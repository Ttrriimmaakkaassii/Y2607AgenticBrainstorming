import { generateId } from './id';

export interface Guideline {
  id: string;
  text: string;
  /** Freeform tag, '' allowed = uncategorized. */
  category: string;
  /** Disabling ("recall") keeps the guideline saved without applying it. */
  enabled: boolean;
}

const STORAGE_KEY = 'multi-agent-guidelines';

/** Seeded once on first-ever load; the user can edit, disable, or delete it like any other guideline. */
function defaultGuidelines(): Guideline[] {
  return [
    {
      id: generateId(),
      text: 'When more than one agent is participating, take turns speaking naturally: respond directly to the specific points other agents just made, stay consistent with the full conversation context rather than restarting the topic, and avoid repeating what has already been said.',
      category: 'Conversation Flow',
      enabled: true,
    },
  ];
}

function saveGuidelines(list: Guideline[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function loadGuidelines(): Guideline[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    // Seed the default guideline only on the very first load (no key at
    // all yet) — once the user has an (even empty) saved list, respect
    // their edits/deletions instead of re-adding it.
    if (raw === null) {
      const seeded = defaultGuidelines();
      saveGuidelines(seeded);
      return seeded;
    }
    return JSON.parse(raw) as Guideline[];
  } catch {
    return [];
  }
}

export function addGuideline(text: string, category: string): Guideline[] {
  const trimmed = text.trim();
  if (!trimmed) return loadGuidelines();
  const next = [
    ...loadGuidelines(),
    { id: generateId(), text: trimmed, category: category.trim(), enabled: true },
  ];
  saveGuidelines(next);
  return next;
}

export function updateGuideline(
  id: string,
  updates: Partial<Pick<Guideline, 'text' | 'category'>>
): Guideline[] {
  const next = loadGuidelines().map((g) => (g.id === id ? { ...g, ...updates } : g));
  saveGuidelines(next);
  return next;
}

export function toggleGuideline(id: string): Guideline[] {
  const next = loadGuidelines().map((g) => (g.id === id ? { ...g, enabled: !g.enabled } : g));
  saveGuidelines(next);
  return next;
}

export function deleteGuideline(id: string): Guideline[] {
  const next = loadGuidelines().filter((g) => g.id !== id);
  saveGuidelines(next);
  return next;
}

export function loadGuidelineCategories(): string[] {
  const cats = loadGuidelines()
    .map((g) => g.category)
    .filter(Boolean);
  return Array.from(new Set(cats));
}
