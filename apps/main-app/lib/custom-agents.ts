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
    return raw ? (JSON.parse(raw) as AgentPreset[]) : [];
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
