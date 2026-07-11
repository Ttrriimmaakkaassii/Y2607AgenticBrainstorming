import { AgentPreset } from './agent-library';

const STORAGE_KEY = 'multi-agent-custom-agents';

/**
 * Every agent a user creates or edits is saved here, keyed by name. This
 * persists independently of any conversation's agent list, so deleting an
 * agent from a conversation doesn't lose its definition — it stays
 * available to re-add later via the Agent Library's "My Saved Agents".
 */
export function loadCustomAgents(): AgentPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as (AgentPreset & { category?: string })[];
    // Migrate the old single `category` field to the new `categories` array.
    return parsed.map((p) => {
      if (p.categories) return p;
      const { category, ...rest } = p;
      return { ...rest, categories: category ? [category] : [] };
    });
  } catch {
    return [];
  }
}

export function saveCustomAgents(presets: AgentPreset[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function upsertCustomAgent(preset: AgentPreset): void {
  const list = loadCustomAgents();
  const key = preset.name.trim().toLowerCase();
  const index = list.findIndex((p) => p.name.trim().toLowerCase() === key);
  if (index >= 0) {
    list[index] = preset;
  } else {
    list.push(preset);
  }
  saveCustomAgents(list);
}

/**
 * Renames a saved agent in place, preserving its categories and other
 * fields. Presets are keyed by name, so a plain upsertCustomAgent() call
 * under the new name would silently orphan the old entry (and its
 * categories) instead of updating it — callers renaming an agent must use
 * this first.
 */
export function renameCustomAgent(oldName: string, newName: string): void {
  const trimmedNew = newName.trim();
  const oldKey = oldName.trim().toLowerCase();
  if (!trimmedNew || oldKey === trimmedNew.toLowerCase()) return;
  const list = loadCustomAgents();
  const index = list.findIndex((p) => p.name.trim().toLowerCase() === oldKey);
  if (index >= 0) {
    list[index] = { ...list[index], name: trimmedNew };
    saveCustomAgents(list);
  }
}

/** Permanently erases a saved agent from the library (not just from a conversation). */
export function removeCustomAgent(name: string): void {
  const key = name.trim().toLowerCase();
  saveCustomAgents(loadCustomAgents().filter((p) => p.name.trim().toLowerCase() !== key));
}
