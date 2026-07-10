import { generateId } from './id';
import { loadCustomAgents, saveCustomAgents } from './custom-agents';

export interface CustomCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
}

const STORAGE_KEY = 'multi-agent-custom-categories';
const DEFAULT_COLOR = '#8e44ad';

export function loadCustomCategories(): CustomCategory[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomCategory[];
    return parsed.map((c) => ({ ...c, color: c.color || DEFAULT_COLOR }));
  } catch {
    return [];
  }
}

function saveCustomCategories(categories: CustomCategory[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
}

export function addCustomCategory(name: string, icon: string, color: string): CustomCategory[] {
  const trimmed = name.trim();
  if (!trimmed) return loadCustomCategories();
  const list = loadCustomCategories();
  if (list.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return list;
  const next = [
    ...list,
    { id: generateId(), name: trimmed, icon: icon.trim() || '📁', color: color || DEFAULT_COLOR },
  ];
  saveCustomCategories(next);
  return next;
}

function retagAgents(oldName: string, newName: string | undefined): void {
  const agents = loadCustomAgents();
  saveCustomAgents(
    agents.map((a) => {
      if (!a.categories?.includes(oldName)) return a;
      const withoutOld = a.categories.filter((c) => c !== oldName);
      return { ...a, categories: newName ? [...withoutOld, newName] : withoutOld };
    })
  );
}

/** Renames the category and re-tags every agent that was filed under the old name. */
export function renameCustomCategory(id: string, newName: string): CustomCategory[] {
  const trimmed = newName.trim();
  if (!trimmed) return loadCustomCategories();
  const list = loadCustomCategories();
  const category = list.find((c) => c.id === id);
  if (!category) return list;
  const oldName = category.name;
  const next = list.map((c) => (c.id === id ? { ...c, name: trimmed } : c));
  saveCustomCategories(next);
  retagAgents(oldName, trimmed);
  return next;
}

export function recolorCustomCategory(id: string, color: string): CustomCategory[] {
  const next = loadCustomCategories().map((c) => (c.id === id ? { ...c, color } : c));
  saveCustomCategories(next);
  return next;
}

/** Deletes the category and un-tags (not deletes) any agents filed under it. */
export function deleteCustomCategory(id: string): CustomCategory[] {
  const list = loadCustomCategories();
  const category = list.find((c) => c.id === id);
  const next = list.filter((c) => c.id !== id);
  saveCustomCategories(next);
  if (category) retagAgents(category.name, undefined);
  return next;
}
