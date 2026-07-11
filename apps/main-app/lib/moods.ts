import { generateId } from './id';

export interface CustomMood {
  id: string;
  name: string;
}

/** Never persisted, never editable — the fixed base moods every conversation starts with. */
export const BUILTIN_MOODS = ['debate', 'complementary', 'research'] as const;

const STORAGE_KEY = 'multi-agent-custom-moods';

function saveCustomMoods(moods: CustomMood[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(moods));
}

export function loadCustomMoods(): CustomMood[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Migrate the old flat string[] shape (pre-CRUD) into CustomMood[].
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
      const migrated = (parsed as string[]).map((name) => ({ id: generateId(), name }));
      saveCustomMoods(migrated);
      return migrated;
    }
    return parsed as CustomMood[];
  } catch {
    return [];
  }
}

export function addCustomMood(name: string): CustomMood[] {
  const trimmed = name.trim();
  const list = loadCustomMoods();
  if (!trimmed || list.some((m) => m.name.toLowerCase() === trimmed.toLowerCase())) return list;
  const next = [...list, { id: generateId(), name: trimmed }];
  saveCustomMoods(next);
  return next;
}

export function renameCustomMood(id: string, newName: string): CustomMood[] {
  const trimmed = newName.trim();
  if (!trimmed) return loadCustomMoods();
  const next = loadCustomMoods().map((m) => (m.id === id ? { ...m, name: trimmed } : m));
  saveCustomMoods(next);
  return next;
}

export function deleteCustomMood(id: string): CustomMood[] {
  const next = loadCustomMoods().filter((m) => m.id !== id);
  saveCustomMoods(next);
  return next;
}
