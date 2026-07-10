import { generateId } from './id';
import { loadCustomAgents, saveCustomAgents } from './custom-agents';

export interface CustomCategory {
  id: string;
  name: string;
  icon: string;
}

const STORAGE_KEY = 'multi-agent-custom-categories';

export function loadCustomCategories(): CustomCategory[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CustomCategory[]) : [];
  } catch {
    return [];
  }
}

function saveCustomCategories(categories: CustomCategory[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
}

export function addCustomCategory(name: string, icon: string): CustomCategory[] {
  const trimmed = name.trim();
  if (!trimmed) return loadCustomCategories();
  const list = loadCustomCategories();
  if (list.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return list;
  const next = [...list, { id: generateId(), name: trimmed, icon: icon.trim() || '📁' }];
  saveCustomCategories(next);
  return next;
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

  const agents = loadCustomAgents();
  saveCustomAgents(
    agents.map((a) => (a.category === oldName ? { ...a, category: trimmed } : a))
  );
  return next;
}

/** Deletes the category and un-tags (not deletes) any agents filed under it. */
export function deleteCustomCategory(id: string): CustomCategory[] {
  const list = loadCustomCategories();
  const category = list.find((c) => c.id === id);
  const next = list.filter((c) => c.id !== id);
  saveCustomCategories(next);

  if (category) {
    const agents = loadCustomAgents();
    saveCustomAgents(
      agents.map((a) => (a.category === category.name ? { ...a, category: undefined } : a))
    );
  }
  return next;
}
