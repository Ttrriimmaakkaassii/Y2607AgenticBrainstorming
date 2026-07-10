const STORAGE_KEY = 'multi-agent-changelog';
const MAX_ENTRIES = 300;

export interface ChangeLogEntry {
  id: string;
  timestamp: number;
  scope: 'settings' | 'agent';
  label: string;
  field: string;
  oldValue: string;
  newValue: string;
}

export function loadChangeLog(): ChangeLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChangeLogEntry[]) : [];
  } catch {
    return [];
  }
}

function saveChangeLog(entries: ChangeLogEntry[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '∅';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

/**
 * Diffs `next` against `prev` field-by-field and appends one changelog
 * entry per changed field. Returns the updated list so callers can also
 * update any in-memory state without re-reading localStorage.
 */
export function logFieldChanges<T extends Record<string, unknown>>(
  scope: ChangeLogEntry['scope'],
  label: string,
  prev: T,
  next: T
): ChangeLogEntry[] {
  const entries = loadChangeLog();
  let changed = false;
  for (const key of Object.keys(next)) {
    if (prev[key] === next[key]) continue;
    changed = true;
    entries.push({
      id: `${Date.now()}-${key}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      scope,
      label,
      field: key,
      oldValue: stringify(prev[key]),
      newValue: stringify(next[key]),
    });
  }
  if (changed) saveChangeLog(entries);
  return entries;
}
