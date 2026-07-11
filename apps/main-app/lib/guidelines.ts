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

function saveGuidelines(list: Guideline[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function loadGuidelines(): Guideline[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Guideline[]) : [];
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
