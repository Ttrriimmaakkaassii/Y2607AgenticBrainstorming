import { ObjectiveRecord } from './types';
import { generateId } from './id';

/**
 * Deterministic, rule-based user-objective extraction (NOT an LLM call).
 *
 * Processes each user message against the current objective, pulling confirmed
 * facts (numbers, asset types, constraints, preferences) from natural text.
 * On correction (a field value changes), marks the old objective as superseded
 * and replaces the fact. The orchestrator checks `hasUnresolvedField` before
 * allowing an agent to ask a clarification — preventing repeated questions.
 *
 * This is deliberately conservative: it catches common patterns (explicit
 * numbers, asset-type keywords, comparison language) but won't parse every
 * nuanced sentence. An LLM-based extractor can be layered on later via the
 * Wiki Keeper connection if richer extraction is needed.
 */

const AREA_RE = /(\d[\d,.\s]*)\s*(m2|m²|sqm|square\s*m|hectare|ha|acre)/i;
const BUDGET_RE = /(?:budget|max|up\s*to|around|maximum)\s*(?:is\s+)?\$?\s*(\d[\d,.]*)\s*(k|thousand|million|m)?/i;
const ASSET_KEYWORDS: Record<string, string[]> = {
  land: ['land', 'plot', 'parcel', 'acreage', 'lot'],
  apartment: ['apartment', 'flat', 'condo', 'studio'],
  villa: ['villa', 'house', 'detached', 'bungalow', 'cottage'],
  commercial: ['commercial', 'office', 'retail', 'warehouse', 'shop'],
  rental: ['rental', 'rent', 'lease', 'investment property', 'airbnb'],
};
const INTENT_KEYWORDS: Record<string, string[]> = {
  subdivision: ['subdivid', 'split', 'parcel', 'develop', 'subdivide'],
  live_in: ['live in', 'move to', 'relocate', 'settle', 'primary residence'],
  investment: ['investment', 'roi', 'rental yield', 'appreciation', 'flip'],
  vacation: ['vacation', 'holiday', 'second home', 'getaway'],
};

function normalizeNumber(raw: string): string {
  return raw.replace(/[\s,]/g, '');
}

function matchFirst(re: RegExp, text: string): string | null {
  const m = text.match(re);
  return m ? m[0] : null;
}

/**
 * Process a user message and return an updated objective (or the current one
 * unchanged if nothing new was extracted). Creates an objective on first call.
 */
export function processUserMessage(
  message: string,
  current: ObjectiveRecord | undefined
): ObjectiveRecord {
  const text = message.toLowerCase().trim();
  const now = new Date().toISOString();
  const facts: Record<string, string> = { ...(current?.confirmedFacts ?? {}) };
  const constraints: Record<string, string> = { ...(current?.constraints ?? {}) };
  const preferences: Record<string, string> = { ...(current?.preferences ?? {}) };
  let changed = false;

  // Area
  const areaMatch = text.match(AREA_RE);
  if (areaMatch) {
    facts.minimumArea = normalizeNumber(areaMatch[1]) + ' ' + areaMatch[2];
    changed = true;
  }

  // Budget
  const budgetMatch = text.match(BUDGET_RE);
  if (budgetMatch) {
    const num = normalizeNumber(budgetMatch[1]);
    const suffix = budgetMatch[2]?.toLowerCase();
    const multiplier = suffix === 'k' || suffix === 'thousand' ? '000' : suffix === 'm' || suffix === 'million' ? '000000' : '';
    facts.budget = num + multiplier;
    changed = true;
  }

  // Asset type
  for (const [assetType, keywords] of Object.entries(ASSET_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) {
      facts.assetType = assetType;
      changed = true;
      break;
    }
  }

  // Intent / strategy
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) {
      preferences.strategy = intent;
      changed = true;
      break;
    }
  }

  // Location (heuristic: "in <place>", "near <place>")
  const locMatch = text.match(/(?:in|near|around|at)\s+([a-z][a-z\s,]{2,30}?)(?:[.,\n]|$)/i);
  if (locMatch && locMatch[1].trim().length > 2) {
    facts.location = locMatch[1].trim();
    changed = true;
  }

  if (!changed && current) return current;

  // On any fact change, supersede the previous objective.
  const superseded = current && changed ? [...(current.supersededObjectiveIds ?? []), current.objectiveId] : (current?.supersededObjectiveIds ?? []);

  return {
    objectiveId: generateId(),
    summary: message.slice(0, 200),
    confirmedFacts: facts,
    constraints,
    preferences,
    unresolvedFields: current?.unresolvedFields ?? [],
    supersededObjectiveIds: superseded,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };
}

/** Does the objective have a confirmed value for this field? */
export function hasConfirmedFact(objective: ObjectiveRecord | undefined, field: string): boolean {
  return !!(objective?.confirmedFacts[field]);
}

/** Remove a field from unresolvedFields once it's confirmed. */
export function resolveField(objective: ObjectiveRecord, field: string): ObjectiveRecord {
  if (!objective.unresolvedFields.includes(field)) return objective;
  return {
    ...objective,
    unresolvedFields: objective.unresolvedFields.filter((f) => f !== field),
    updatedAt: new Date().toISOString(),
  };
}

/** Create an empty objective (used on new conversation). */
export function emptyObjective(): ObjectiveRecord | undefined {
  return undefined;
}
