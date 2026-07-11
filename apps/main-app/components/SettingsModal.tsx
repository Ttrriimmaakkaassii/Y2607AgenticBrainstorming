'use client';

import { useEffect, useState } from 'react';
import { getProvider } from '@/lib/llm-catalog';
import { Agent, ArchivedConversation, LLMConnection, Thread } from '@/lib/types';
import { AGENT_LIBRARY, AgentPreset } from '@/lib/agent-library';
import { loadCustomAgents, upsertCustomAgent } from '@/lib/custom-agents';
import { CustomCategory, loadCustomCategories } from '@/lib/categories';
import {
  Guideline,
  addGuideline,
  deleteGuideline,
  loadGuidelineCategories,
  toggleGuideline,
  updateGuideline,
} from '@/lib/guidelines';
import {
  TraitDef,
  addTraitDef,
  deleteTraitDef,
  loadTraitCategories,
} from '@/lib/traits';
import { LLMProvidersModal } from './LLMProvidersModal';
import { AudioModal } from './AudioModal';
import { ArchivesModal } from './ArchivesModal';
import { ChangeLogPanel } from './ChangeLogPanel';

type SettingsTab = 'agent' | 'llm' | 'audio' | 'archives' | 'log';

interface SettingsModalProps {
  agents: Agent[];
  currentAgentId: string;
  connections: LLMConnection[];
  onSelectAgent: (id: string) => void;
  onSave: (id: string, updates: Partial<Agent>) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onOpenLibrary: () => void;
  onClose: () => void;
  onToast: (message: string) => void;
  onChangeConnections: (connections: LLMConnection[]) => void;
  onUpdateAgentsBulk: (agents: Agent[]) => void;
  threads: Thread[];
  ttsRate: number;
  ttsLang: string;
  onUpdateTts: (updates: { ttsRate?: number; ttsLang?: string }) => void;
  archives: ArchivedConversation[];
  onRestoreArchive: (archive: ArchivedConversation) => void;
  onDeleteArchive: (id: string) => void;
  whatsappNumber: string;
  onUpdateWhatsappNumber: (number: string) => void;
  guidelines: Guideline[];
  onGuidelinesChange: (guidelines: Guideline[]) => void;
  traitDefs: TraitDef[];
  onTraitDefsChange: (traitDefs: TraitDef[]) => void;
  onUpdateAgentTraits: (agentId: string, traits: Record<string, number>) => void;
}

export function SettingsModal({
  agents,
  currentAgentId,
  connections,
  onSelectAgent,
  onSave,
  onAdd,
  onDelete,
  onOpenLibrary,
  onClose,
  onToast,
  onChangeConnections,
  onUpdateAgentsBulk,
  threads,
  ttsRate,
  ttsLang,
  onUpdateTts,
  archives,
  onRestoreArchive,
  onDeleteArchive,
  whatsappNumber,
  onUpdateWhatsappNumber,
  guidelines,
  onGuidelinesChange,
  traitDefs,
  onTraitDefsChange,
  onUpdateAgentTraits,
}: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>('agent');
  const currentAgent = agents.find((a) => a.id === currentAgentId) ?? agents[0];

  const [name, setName] = useState(currentAgent?.name ?? '');
  const [role, setRole] = useState(currentAgent?.role ?? '');
  const [instructions, setInstructions] = useState(currentAgent?.instructions ?? '');
  const [color, setColor] = useState(currentAgent?.color ?? '#3b99fc');
  const [connectionId, setConnectionId] = useState<string | null>(
    currentAgent?.connectionId ?? null
  );
  const [voiceURI, setVoiceURI] = useState<string | null>(currentAgent?.voiceURI ?? null);
  const [customAgents, setCustomAgents] = useState<AgentPreset[]>([]);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [newGuidelineText, setNewGuidelineText] = useState('');
  const [newGuidelineCategory, setNewGuidelineCategory] = useState('');
  const [newTraitName, setNewTraitName] = useState('');
  const [newTraitCategory, setNewTraitCategory] = useState('');

  useEffect(() => {
    setCustomAgents(loadCustomAgents());
    setCustomCategories(loadCustomCategories());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const load = () => setAvailableVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const allCategoryNames = [...AGENT_LIBRARY.map((c) => c.name), ...customCategories.map((c) => c.name)];
  const currentAgentCategories =
    customAgents.find((a) => a.name === (currentAgent?.name ?? ''))?.categories ?? [];

  function toggleCurrentAgentCategory(categoryName: string) {
    if (!currentAgent) return;
    const existing = customAgents.find((a) => a.name === currentAgent.name);
    const current = existing?.categories ?? [];
    const nextCategories = current.includes(categoryName)
      ? current.filter((c) => c !== categoryName)
      : [...current, categoryName];
    const updated: AgentPreset = {
      name: currentAgent.name,
      role: currentAgent.role,
      instructions: currentAgent.instructions,
      color: currentAgent.color,
      categories: nextCategories,
    };
    upsertCustomAgent(updated);
    setCustomAgents((prev) => {
      const idx = prev.findIndex((a) => a.name === updated.name);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = updated;
        return copy;
      }
      return [...prev, updated];
    });
  }

  function updateAgentTrait(traitId: string, value: number) {
    if (!currentAgent) return;
    onUpdateAgentTraits(currentAgent.id, { ...currentAgent.traits, [traitId]: value });
  }

  function traitsByCategory(): [string, TraitDef[]][] {
    const groups = new Map<string, TraitDef[]>();
    for (const def of traitDefs) {
      const list = groups.get(def.category) ?? [];
      list.push(def);
      groups.set(def.category, list);
    }
    return Array.from(groups.entries());
  }

  function selectAgent(id: string) {
    const agent = agents.find((a) => a.id === id);
    if (!agent) return;
    onSelectAgent(id);
    setName(agent.name);
    setRole(agent.role);
    setInstructions(agent.instructions);
    setColor(agent.color);
    setConnectionId(agent.connectionId);
    setVoiceURI(agent.voiceURI ?? null);
  }

  function save() {
    if (!currentAgent) return;
    const connection = connections.find((c) => c.id === connectionId);
    onSave(currentAgent.id, {
      name,
      role,
      instructions,
      color,
      connectionId,
      voiceURI,
      llmProvider: connection?.provider ?? currentAgent.llmProvider,
    });
  }

  const TABS: { id: SettingsTab; label: string }[] = [
    { id: 'agent', label: '🧑 Agent' },
    { id: 'llm', label: '🔌 LLM' },
    { id: 'audio', label: '🎧 Audio' },
    { id: 'archives', label: '🗄️ Archives' },
    { id: 'log', label: '📜 Log' },
  ];

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760 }}>
        <div className="modal-header">
          <span className="modal-title">⚙️ Settings</span>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="settings-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`settings-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="modal-body">
          {tab === 'agent' && (
            <>
              <div className="modal-section">
                <div className="modal-section-title">Sharing</div>
                <div className="form-group">
                  <label>My WhatsApp Number (digits only, international format)</label>
                  <input
                    type="text"
                    placeholder="e.g. 212661320000 — leave blank to use the default"
                    value={whatsappNumber}
                    onChange={(e) => onUpdateWhatsappNumber(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-section">
                <div className="modal-section-title">General Guidelines (applies to all agents)</div>
                {guidelines.map((g) => (
                  <div key={g.id} className="guideline-row">
                    <input
                      type="checkbox"
                      checked={g.enabled}
                      title={g.enabled ? 'Disable (recall it later without losing it)' : 'Re-enable'}
                      onChange={() => onGuidelinesChange(toggleGuideline(g.id))}
                    />
                    <input
                      type="text"
                      style={{ flex: 1 }}
                      value={g.text}
                      onChange={(e) => onGuidelinesChange(updateGuideline(g.id, { text: e.target.value }))}
                    />
                    <input
                      type="text"
                      style={{ width: 120 }}
                      placeholder="category"
                      list="guideline-category-suggestions"
                      value={g.category}
                      onChange={(e) =>
                        onGuidelinesChange(updateGuideline(g.id, { category: e.target.value }))
                      }
                    />
                    <button
                      className="btn-icon delete"
                      title="Delete permanently"
                      onClick={() => onGuidelinesChange(deleteGuideline(g.id))}
                    >
                      🗑️
                    </button>
                  </div>
                ))}
                <datalist id="guideline-category-suggestions">
                  {loadGuidelineCategories().map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <div className="guideline-row">
                  <input
                    type="text"
                    style={{ flex: 1 }}
                    placeholder="New guideline all agents must follow…"
                    value={newGuidelineText}
                    onChange={(e) => setNewGuidelineText(e.target.value)}
                  />
                  <input
                    type="text"
                    style={{ width: 120 }}
                    placeholder="category"
                    list="guideline-category-suggestions"
                    value={newGuidelineCategory}
                    onChange={(e) => setNewGuidelineCategory(e.target.value)}
                  />
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      if (!newGuidelineText.trim()) return;
                      onGuidelinesChange(addGuideline(newGuidelineText, newGuidelineCategory));
                      setNewGuidelineText('');
                      setNewGuidelineCategory('');
                    }}
                  >
                    + Add
                  </button>
                </div>
              </div>

              <div className="modal-section">
                <div className="modal-section-title">Configure Agent</div>
                <div className="form-group">
                  <label>Agent Name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Role / Personality</label>
                  <input value={role} onChange={(e) => setRole(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Instructions</label>
                  <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Connected LLM</label>
                  <select
                    value={connectionId ?? ''}
                    onChange={(e) => setConnectionId(e.target.value || null)}
                  >
                    <option value="">None (simulated responses)</option>
                    {connections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label} ({getProvider(c.provider)?.name} · {c.model} · {c.effort})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Read-Aloud Voice</label>
                  <select value={voiceURI ?? ''} onChange={(e) => setVoiceURI(e.target.value || null)}>
                    <option value="">Auto (assigned automatically, distinct per agent)</option>
                    {availableVoices.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Avatar Color</label>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    style={{ width: 50, height: 30, border: '1px solid #ddd', padding: 0 }}
                  />
                </div>
                <div className="form-group">
                  <label>Skill Categories (assign as many as you like)</label>
                  <div className="category-checklist">
                    {allCategoryNames.map((name) => (
                      <label key={name} className="category-checkbox">
                        <input
                          type="checkbox"
                          checked={currentAgentCategories.includes(name)}
                          onChange={() => toggleCurrentAgentCategory(name)}
                        />
                        {name}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label>
                    Traits &amp; Character (0-100 scale, purely descriptive — neither end is
                    &quot;better&quot;)
                  </label>
                  {traitsByCategory().map(([category, defs]) => (
                    <div key={category} className="trait-category-group">
                      <div className="trait-category-title">{category}</div>
                      {defs.map((def) => {
                        const value = currentAgent?.traits?.[def.id] ?? 50;
                        return (
                          <div key={def.id} className="trait-slider-row">
                            <span className="trait-slider-label">{def.name}</span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={value}
                              onChange={(e) => updateAgentTrait(def.id, Number(e.target.value))}
                            />
                            <span className="trait-slider-value">{value}</span>
                            <button
                              className="btn-icon delete"
                              title="Delete this trait definition (for all agents)"
                              onClick={() => onTraitDefsChange(deleteTraitDef(def.id))}
                            >
                              🗑️
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  <div className="trait-slider-row">
                    <input
                      type="text"
                      style={{ flex: 1 }}
                      placeholder="New trait name (e.g. Aggressiveness)"
                      value={newTraitName}
                      onChange={(e) => setNewTraitName(e.target.value)}
                    />
                    <input
                      type="text"
                      style={{ width: 120 }}
                      placeholder="category"
                      list="trait-category-suggestions"
                      value={newTraitCategory}
                      onChange={(e) => setNewTraitCategory(e.target.value)}
                    />
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        if (!newTraitName.trim()) return;
                        onTraitDefsChange(addTraitDef(newTraitName, newTraitCategory));
                        setNewTraitName('');
                        setNewTraitCategory('');
                      }}
                    >
                      + Add
                    </button>
                    <datalist id="trait-category-suggestions">
                      {loadTraitCategories().map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>
                </div>
                <button className="btn-primary" onClick={save}>
                  Save Changes
                </button>
              </div>

              <div className="modal-section">
                <div className="modal-section-title">Available Agents</div>
                {agents.map((agent) => (
                  <div
                    className="agent-list-item"
                    key={agent.id}
                    style={{
                      cursor: 'pointer',
                      outline: agent.id === currentAgentId ? '2px solid #3b99fc' : 'none',
                    }}
                    onClick={() => selectAgent(agent.id)}
                  >
                    <div className="avatar" style={{ background: agent.color }}>
                      {agent.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="agent-info">
                      <div className="agent-name">
                        {agent.name} ({agent.role})
                      </div>
                    </div>
                    <button
                      className="btn-icon delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(agent.id);
                      }}
                      disabled={agents.length <= 1}
                      title={agents.length <= 1 ? 'At least one agent is required' : 'Delete agent'}
                    >
                      🗑️
                    </button>
                  </div>
                ))}
                <button className="btn-secondary" onClick={onAdd}>
                  + Add Blank Agent
                </button>
                <button className="btn-secondary" onClick={onOpenLibrary}>
                  📚 Browse Agent Library
                </button>
              </div>
            </>
          )}

          {tab === 'llm' && (
            <LLMProvidersModal
              embedded
              connections={connections}
              onChange={onChangeConnections}
              agents={agents}
              onUpdateAgents={onUpdateAgentsBulk}
              onClose={() => {}}
              onToast={onToast}
            />
          )}

          {tab === 'audio' && (
            <AudioModal
              embedded
              agents={agents}
              threads={threads}
              ttsRate={ttsRate}
              ttsLang={ttsLang}
              onUpdateTts={onUpdateTts}
              onClose={() => {}}
              onToast={onToast}
            />
          )}

          {tab === 'archives' && (
            <ArchivesModal
              embedded
              archives={archives}
              onRestore={onRestoreArchive}
              onDelete={onDeleteArchive}
              onClose={() => {}}
            />
          )}

          {tab === 'log' && <ChangeLogPanel />}
        </div>
      </div>
    </div>
  );
}
