import { generateId } from './id';

/** A globally-defined trait (e.g. "Aggressiveness"). Per-agent values live on Agent.traits, keyed by id. */
export interface TraitDef {
  id: string;
  name: string;
  /** Freeform tag; seeded suggestions are 'Traits' | 'Character' | 'Expertise'. */
  category: string;
}

const STORAGE_KEY = 'multi-agent-trait-defs';
const SEED_CATEGORIES = ['Traits', 'Character', 'Expertise'];

function saveTraitDefs(list: TraitDef[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function loadTraitDefs(): TraitDef[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TraitDef[]) : [];
  } catch {
    return [];
  }
}

export function addTraitDef(name: string, category: string): TraitDef[] {
  const trimmed = name.trim();
  const list = loadTraitDefs();
  if (!trimmed || list.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) return list;
  const next = [...list, { id: generateId(), name: trimmed, category: category.trim() || 'Traits' }];
  saveTraitDefs(next);
  return next;
}

export function renameTraitDef(id: string, newName: string): TraitDef[] {
  const trimmed = newName.trim();
  if (!trimmed) return loadTraitDefs();
  const next = loadTraitDefs().map((t) => (t.id === id ? { ...t, name: trimmed } : t));
  saveTraitDefs(next);
  return next;
}

export function recategorizeTraitDef(id: string, category: string): TraitDef[] {
  const next = loadTraitDefs().map((t) => (t.id === id ? { ...t, category: category.trim() } : t));
  saveTraitDefs(next);
  return next;
}

/** Deletes the definition; stale value keys left on agents are simply unused, not cascaded. */
export function deleteTraitDef(id: string): TraitDef[] {
  const next = loadTraitDefs().filter((t) => t.id !== id);
  saveTraitDefs(next);
  return next;
}

export function loadTraitCategories(): string[] {
  const used = loadTraitDefs()
    .map((t) => t.category)
    .filter(Boolean);
  return Array.from(new Set([...SEED_CATEGORIES, ...used]));
}
