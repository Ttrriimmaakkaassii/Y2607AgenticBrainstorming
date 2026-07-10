const STORAGE_KEY = 'multi-agent-custom-moods';

export function loadCustomMoods(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function addCustomMood(mood: string): string[] {
  const trimmed = mood.trim();
  const list = loadCustomMoods();
  if (!trimmed || list.includes(trimmed)) return list;
  const next = [...list, trimmed];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
