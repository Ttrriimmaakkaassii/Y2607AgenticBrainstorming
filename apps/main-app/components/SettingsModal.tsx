'use client';

import { useEffect, useRef, useState } from 'react';
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
import { GEMINI_TTS_VOICES } from '@/lib/google-tts';
import { downloadHtmlAsJpeg } from '@/lib/rasterize-svg';
import { useAuthContext } from '@/lib/auth-context';
import { devRef } from '@/lib/devref';
import { useClickOutside } from '@/lib/use-click-outside';
import { useOverlayClose } from '@/lib/use-overlay-close';
import { LLMProvidersModal } from './LLMProvidersModal';
import { AudioModal } from './AudioModal';
import { ArchivesModal } from './ArchivesModal';
import { ChangeLogPanel } from './ChangeLogPanel';
import { AccountSettingsPanel } from './AccountSettingsPanel';

type SettingsTab = 'agent' | 'llm' | 'audio' | 'display' | 'wiki' | 'archives' | 'log' | 'account';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Turns the wiki digest's "## Heading" + "- bullet" markdown (the exact
 * shape fetchWikiDigest's system prompt asks for) into simple HTML, for the
 * Bullet view and its JPEG export. */
function renderWikiHtml(markdown: string): string {
  const lines = markdown.split('\n');
  const parts: string[] = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      parts.push('</ul>');
      inList = false;
    }
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }
    const heading = /^#{1,6}\s+(.*)/.exec(line);
    const bullet = /^[-*]\s+(.*)/.exec(line);
    if (heading) {
      closeList();
      parts.push(`<h4 style="margin:16px 0 6px;">${escapeHtml(heading[1])}</h4>`);
    } else if (bullet) {
      if (!inList) {
        parts.push('<ul style="margin:0 0 8px;padding-left:20px;">');
        inList = true;
      }
      parts.push(`<li style="margin-bottom:4px;">${escapeHtml(bullet[1])}</li>`);
    } else {
      closeList();
      parts.push(`<p style="margin:0 0 8px;">${escapeHtml(line)}</p>`);
    }
  }
  closeList();
  return parts.join('');
}

/** A real dropdown for freeform-tag category fields, with a "+ New category…" escape hatch. */
function CategorySelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (next: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === '__new__') {
          const name = window.prompt('New category name:', '');
          if (name?.trim()) onChange(name.trim());
          return;
        }
        onChange(e.target.value);
      }}
    >
      <option value="">Uncategorized</option>
      {value && !options.includes(value) && <option value={value}>{value}</option>}
      {options.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      <option value="__new__">+ New category…</option>
    </select>
  );
}

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
  onReorderAgents: (agents: Agent[]) => void;
  threads: Thread[];
  ttsRate: number;
  ttsLang: string;
  ttsProvider: 'browser' | 'google' | 'custom';
  googleTtsModel: string;
  onUpdateTts: (updates: {
    ttsRate?: number;
    ttsLang?: string;
    ttsProvider?: 'browser' | 'google' | 'custom';
    googleTtsModel?: string;
  }) => void;
  archives: ArchivedConversation[];
  onRestoreArchive: (archive: ArchivedConversation) => void;
  onDeleteArchive: (id: string) => void;
  onUpdateArchiveMeta: (id: string, updates: { category?: string | null; color?: string | null }) => void;
  whatsappNumber: string;
  onUpdateWhatsappNumber: (number: string) => void;
  guidelines: Guideline[];
  onGuidelinesChange: (guidelines: Guideline[]) => void;
  traitDefs: TraitDef[];
  onTraitDefsChange: (traitDefs: TraitDef[]) => void;
  onUpdateAgentTraits: (agentId: string, traits: Record<string, number>) => void;
  wikiEnabled: boolean;
  wikiKeeperConnectionId: string | null;
  wikiRefreshInterval: number;
  wikiDigest: string;
  wikiUpdatedAt: number;
  wikiHistory: { digest: string; updatedAt: number; messageCount: number }[];
  onUpdateWiki: (updates: {
    wikiEnabled?: boolean;
    wikiKeeperConnectionId?: string | null;
    wikiRefreshInterval?: number;
  }) => void;
  onRefreshWikiNow: () => void;
  onOpenMindmap: (markdown: string, title: string) => void;
  /** Message bubble text size in Thread View — also the default for Scene View's central bubble text size. */
  textSize: 'xs' | 'sm' | 'md' | 'lg';
  onUpdateTextSize: (size: 'xs' | 'sm' | 'md' | 'lg') => void;
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
  onReorderAgents,
  threads,
  ttsRate,
  ttsLang,
  ttsProvider,
  googleTtsModel,
  onUpdateTts,
  archives,
  onRestoreArchive,
  onDeleteArchive,
  onUpdateArchiveMeta,
  whatsappNumber,
  onUpdateWhatsappNumber,
  guidelines,
  onGuidelinesChange,
  traitDefs,
  onTraitDefsChange,
  onUpdateAgentTraits,
  wikiEnabled,
  wikiKeeperConnectionId,
  wikiRefreshInterval,
  wikiDigest,
  wikiUpdatedAt,
  wikiHistory,
  onUpdateWiki,
  onRefreshWikiNow,
  onOpenMindmap,
  textSize,
  onUpdateTextSize,
}: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>('agent');
  const currentAgent = agents.find((a) => a.id === currentAgentId) ?? agents[0];
  const configureAgentRef = useRef<HTMLDivElement>(null);
  const overlayClose = useOverlayClose(onClose);
  // null = viewing the current digest; otherwise an index into wikiHistory.
  const [wikiViewIndex, setWikiViewIndex] = useState<number | null>(null);
  const [wikiViewMode, setWikiViewMode] = useState<'raw' | 'bullets'>('bullets');
  const [wikiJpegExporting, setWikiJpegExporting] = useState(false);

  const [name, setName] = useState(currentAgent?.name ?? '');
  const [role, setRole] = useState(currentAgent?.role ?? '');
  const [instructions, setInstructions] = useState(currentAgent?.instructions ?? '');
  const [color, setColor] = useState(currentAgent?.color ?? '#3b99fc');
  const [connectionId, setConnectionId] = useState<string | null>(
    currentAgent?.connectionId ?? null
  );
  const [voiceURI, setVoiceURI] = useState<string | null>(currentAgent?.voiceURI ?? null);
  const [googleVoiceName, setGoogleVoiceName] = useState<string | null>(
    currentAgent?.googleVoiceName ?? null
  );
  const [customAgents, setCustomAgents] = useState<AgentPreset[]>([]);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [newGuidelineText, setNewGuidelineText] = useState('');
  const [newGuidelineCategory, setNewGuidelineCategory] = useState('');
  const [newTraitName, setNewTraitName] = useState('');
  const [newTraitCategory, setNewTraitCategory] = useState('');
  const [expandedGuidelineIds, setExpandedGuidelineIds] = useState<Set<string>>(new Set());
  const [newGuidelineExpanded, setNewGuidelineExpanded] = useState(false);
  const [categoriesMenuOpen, setCategoriesMenuOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [draggedAgentId, setDraggedAgentId] = useState<string | null>(null);
  const [dragOverAgentId, setDragOverAgentId] = useState<string | null>(null);
  type AgentSortColumn = 'ref' | 'name' | 'role' | 'category' | 'llm';
  const [agentSortColumn, setAgentSortColumn] = useState<AgentSortColumn | null>(null);
  const [agentSortDir, setAgentSortDir] = useState<'asc' | 'desc'>('asc');
  const [categoryMenuAgentId, setCategoryMenuAgentId] = useState<string | null>(null);
  const categoriesMenuRef = useClickOutside<HTMLDivElement>(
    () => setCategoriesMenuOpen(false),
    categoriesMenuOpen
  );
  const tableCategoryMenuRef = useClickOutside<HTMLTableCellElement>(
    () => setCategoryMenuAgentId(null),
    categoryMenuAgentId !== null
  );
  const [tableCategoryFilter, setTableCategoryFilter] = useState('');
  const [agentTableView, setAgentTableView] = useState<'overview' | 'traits'>('overview');
  const [tableAgentsDraft, setTableAgentsDraft] = useState<Agent[]>(agents);

  useEffect(() => {
    setTableAgentsDraft(agents);
  }, [agents]);

  function toggleGuidelineExpanded(id: string) {
    setExpandedGuidelineIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

  function toggleAgentCategory(agent: Agent, categoryName: string) {
    const existing = customAgents.find((a) => a.name === agent.name);
    const current = existing?.categories ?? [];
    const nextCategories = current.includes(categoryName)
      ? current.filter((c) => c !== categoryName)
      : [...current, categoryName];
    const updated: AgentPreset = {
      name: agent.name,
      role: agent.role,
      instructions: agent.instructions,
      color: agent.color,
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

  function toggleCurrentAgentCategory(categoryName: string) {
    if (!currentAgent) return;
    toggleAgentCategory(currentAgent, categoryName);
  }

  function updateAgentTrait(traitId: string, value: number) {
    if (!currentAgent) return;
    onUpdateAgentTraits(currentAgent.id, { ...currentAgent.traits, [traitId]: value });
  }

  function updateAgentTraitFor(agentId: string, traitId: string, value: number) {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;
    onUpdateAgentTraits(agentId, { ...agent.traits, [traitId]: value });
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

  function moveAgent(id: string, direction: -1 | 1) {
    const idx = agents.findIndex((a) => a.id === id);
    const newIdx = idx + direction;
    if (idx < 0 || newIdx < 0 || newIdx >= agents.length) return;
    const next = [...agents];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    onReorderAgents(next);
  }

  function categoriesForAgent(name: string): string[] {
    return customAgents.find((a) => a.name === name)?.categories ?? [];
  }

  function updateDraftField(id: string, patch: Partial<Agent>) {
    setTableAgentsDraft((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  function saveTableDraft() {
    onUpdateAgentsBulk(tableAgentsDraft);
    const current = tableAgentsDraft.find((a) => a.id === currentAgentId);
    if (current) {
      setName(current.name);
      setRole(current.role);
      setConnectionId(current.connectionId);
    }
    onToast('✅ Agent table changes saved');
  }

  function toggleAgentSort(column: AgentSortColumn) {
    if (agentSortColumn === column) {
      if (agentSortDir === 'asc') {
        setAgentSortDir('desc');
      } else {
        setAgentSortColumn(null);
        setAgentSortDir('asc');
      }
    } else {
      setAgentSortColumn(column);
      setAgentSortDir('asc');
    }
  }

  const sortedAgents = (() => {
    if (!agentSortColumn) return tableAgentsDraft;
    const dir = agentSortDir === 'asc' ? 1 : -1;
    const keyFor = (a: Agent) => {
      if (agentSortColumn === 'ref') return a.refNumber ?? '';
      if (agentSortColumn === 'name') return a.name;
      if (agentSortColumn === 'role') return a.role;
      if (agentSortColumn === 'llm') return connections.find((c) => c.id === a.connectionId)?.label ?? '';
      return categoriesForAgent(a.name).join(', ');
    };
    return [...tableAgentsDraft].sort((a, b) => keyFor(a).localeCompare(keyFor(b)) * dir);
  })();

  function sortArrow(column: AgentSortColumn): string {
    if (agentSortColumn !== column) return '';
    return agentSortDir === 'asc' ? ' ▲' : ' ▼';
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
    setGoogleVoiceName(agent.googleVoiceName ?? null);
    configureAgentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      googleVoiceName,
      llmProvider: connection?.provider ?? currentAgent.llmProvider,
    });
  }

  const auth = useAuthContext();
  const TABS: { id: SettingsTab; label: string }[] = [
    { id: 'agent', label: '🧑 Agent' },
    { id: 'llm', label: '🔌 LLM' },
    { id: 'audio', label: '🎧 Audio' },
    { id: 'display', label: '🔠 Display' },
    { id: 'wiki', label: '📚 Wiki' },
    { id: 'archives', label: '🗄️ Archives' },
    { id: 'log', label: '📜 Log' },
    ...(auth ? [{ id: 'account' as const, label: '👤 Account' }] : []),
  ];

  return (
    <div className="modal-overlay active" {...overlayClose}>
      <div className="modal modal-fullscreen" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">⚙️ Settings</span>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="settings-tabs" {...devRef('s10')}>
          {TABS.map((t, i) => (
            <button
              key={t.id}
              {...devRef('b26')}
              className={`settings-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="modal-body" {...devRef('s11')}>
          {tab === 'agent' && (
            <>
              <div className="modal-section" {...devRef('s12')}>
                <div className="modal-section-title">Sharing</div>
                <div className="form-group">
                  <label>My WhatsApp Number (digits only, international format)</label>
                  <input
                    type="text"
                    {...devRef('i8')}
                    placeholder="e.g. 212661320000 — leave blank to use the default"
                    value={whatsappNumber}
                    onChange={(e) => onUpdateWhatsappNumber(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-section" {...devRef('s13')}>
                <div className="modal-section-title">General Guidelines (applies to all agents)</div>
                {guidelines.map((g, gi) => {
                  const expanded = expandedGuidelineIds.has(g.id);
                  return (
                    <div key={g.id} className="guideline-row">
                      <input
                        type="checkbox"
                        {...devRef('ck4')}
                        checked={g.enabled}
                        title={g.enabled ? 'Disable (recall it later without losing it)' : 'Re-enable'}
                        onChange={() => onGuidelinesChange(toggleGuideline(g.id))}
                      />
                      {expanded ? (
                        <textarea
                          className="guideline-textarea"
                          {...devRef('t3')}
                          value={g.text}
                          onChange={(e) =>
                            onGuidelinesChange(updateGuideline(g.id, { text: e.target.value }))
                          }
                        />
                      ) : (
                        <input
                          type="text"
                          {...devRef('i9')}
                          style={{ flex: 1 }}
                          value={g.text}
                          onChange={(e) =>
                            onGuidelinesChange(updateGuideline(g.id, { text: e.target.value }))
                          }
                        />
                      )}
                      <button
                        className="btn-icon"
                        {...devRef('b27')}
                        title={expanded ? 'Collapse' : 'Expand to full text'}
                        onClick={() => toggleGuidelineExpanded(g.id)}
                      >
                        {expanded ? '🗕' : '🗖'}
                      </button>
                      <CategorySelect
                        value={g.category}
                        options={loadGuidelineCategories()}
                        onChange={(next) => onGuidelinesChange(updateGuideline(g.id, { category: next }))}
                      />
                      <button
                        className="btn-icon delete"
                        {...devRef('b28')}
                        title="Delete permanently"
                        onClick={() => onGuidelinesChange(deleteGuideline(g.id))}
                      >
                        🗑️
                      </button>
                    </div>
                  );
                })}
                <div className="guideline-row">
                  {newGuidelineExpanded ? (
                    <textarea
                      className="guideline-textarea"
                      {...devRef('t4')}
                      placeholder="New guideline all agents must follow…"
                      value={newGuidelineText}
                      onChange={(e) => setNewGuidelineText(e.target.value)}
                    />
                  ) : (
                    <input
                      type="text"
                      {...devRef('i10')}
                      style={{ flex: 1 }}
                      placeholder="New guideline all agents must follow…"
                      value={newGuidelineText}
                      onChange={(e) => setNewGuidelineText(e.target.value)}
                    />
                  )}
                  <button
                    className="btn-icon"
                    {...devRef('b29')}
                    title={newGuidelineExpanded ? 'Collapse' : 'Expand to full text'}
                    onClick={() => setNewGuidelineExpanded((v) => !v)}
                  >
                    {newGuidelineExpanded ? '🗕' : '🗖'}
                  </button>
                  <CategorySelect
                    value={newGuidelineCategory}
                    options={loadGuidelineCategories()}
                    onChange={setNewGuidelineCategory}
                  />
                  <button
                    className="btn-secondary"
                    {...devRef('b30')}
                    onClick={() => {
                      if (!newGuidelineText.trim()) return;
                      onGuidelinesChange(addGuideline(newGuidelineText, newGuidelineCategory));
                      setNewGuidelineText('');
                      setNewGuidelineCategory('');
                      setNewGuidelineExpanded(false);
                    }}
                  >
                    + Add
                  </button>
                </div>
              </div>

              <div className="modal-section" ref={configureAgentRef} {...devRef('s14')}>
                <div className="modal-section-title">Configure Agent</div>
                <div className="form-group">
                  <label>Agent Name</label>
                  <input {...devRef('i11')} value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Role / Personality</label>
                  <input {...devRef('i12')} value={role} onChange={(e) => setRole(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Instructions</label>
                  <textarea
                    {...devRef('t5')}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Connected LLM</label>
                  <select
                    {...devRef('dr5')}
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
                  <select
                    {...devRef('dr6')}
                    value={voiceURI ?? ''}
                    onChange={(e) => setVoiceURI(e.target.value || null)}
                  >
                    <option value="">Auto (assigned automatically, distinct per agent)</option>
                    {availableVoices.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Gemini TTS Voice (used when TTS Engine is set to Gemini TTS)</label>
                  <select
                    {...devRef('dr7')}
                    value={googleVoiceName ?? ''}
                    onChange={(e) => setGoogleVoiceName(e.target.value || null)}
                  >
                    <option value="">Auto (assigned automatically, distinct per agent)</option>
                    {GEMINI_TTS_VOICES.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name} ({v.desc})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Avatar Color</label>
                  <input
                    type="color"
                    {...devRef('i13')}
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    style={{ width: 50, height: 30, border: '1px solid #ddd', padding: 0 }}
                  />
                </div>
                <div className="form-group">
                  <label>Skill Categories (assign as many as you like)</label>
                  <div className="moods-menu-wrap" ref={categoriesMenuRef}>
                    <button
                      type="button"
                      className="control-btn"
                      {...devRef('b31')}
                      onClick={() => setCategoriesMenuOpen((v) => !v)}
                    >
                      🏷️ Categories ({currentAgentCategories.length}) ▾
                    </button>
                    {categoriesMenuOpen && (
                      <div className="moods-menu">
                        <input
                          type="text"
                          className="control-input"
                          {...devRef('i14')}
                          autoFocus
                          placeholder="Filter categories…"
                          value={categoryFilter}
                          onChange={(e) => setCategoryFilter(e.target.value)}
                        />
                        <div className="moods-menu-list">
                          {allCategoryNames
                            .filter((name) =>
                              name.toLowerCase().includes(categoryFilter.trim().toLowerCase())
                            )
                            .map((name, ci) => (
                              <div key={name} className="moods-menu-row">
                                <label>
                                  <input
                                    type="checkbox"
                                    {...devRef('ck5')}
                                    checked={currentAgentCategories.includes(name)}
                                    onChange={() => toggleCurrentAgentCategory(name)}
                                  />
                                  {name}
                                </label>
                              </div>
                            ))}
                          {allCategoryNames.filter((name) =>
                            name.toLowerCase().includes(categoryFilter.trim().toLowerCase())
                          ).length === 0 && <div className="moods-menu-empty">No categories match.</div>}
                        </div>
                      </div>
                    )}
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
                      {defs.map((def, di) => {
                        const value = currentAgent?.traits?.[def.id] ?? 50;
                        return (
                          <div key={def.id} className="trait-slider-row">
                            <span className="trait-slider-label">{def.name}</span>
                            <input
                              type="range"
                              {...devRef('i15')}
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
                      {...devRef('i16')}
                      style={{ flex: 1 }}
                      placeholder="New trait name (e.g. Aggressiveness)"
                      value={newTraitName}
                      onChange={(e) => setNewTraitName(e.target.value)}
                    />
                    <CategorySelect
                      value={newTraitCategory}
                      options={loadTraitCategories()}
                      onChange={setNewTraitCategory}
                    />
                    <button
                      className="btn-secondary"
                      {...devRef('b32')}
                      onClick={() => {
                        if (!newTraitName.trim()) return;
                        onTraitDefsChange(addTraitDef(newTraitName, newTraitCategory));
                        setNewTraitName('');
                        setNewTraitCategory('');
                      }}
                    >
                      + Add
                    </button>
                  </div>
                </div>
                <button className="btn-primary" {...devRef('b33')} onClick={save}>
                  Save Changes
                </button>
              </div>

              <div className="modal-section" {...devRef('s15')}>
                <div className="modal-section-title">
                  Available Agents {agentSortColumn ? '(sorted — drag reorder disabled)' : '(drag to reorder)'}
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <button
                    type="button"
                    className={agentTableView === 'overview' ? 'btn-primary' : 'btn-secondary'}
                    {...devRef('b49')}
                    onClick={() => setAgentTableView('overview')}
                  >
                    Overview
                  </button>
                  <button
                    type="button"
                    className={agentTableView === 'traits' ? 'btn-primary' : 'btn-secondary'}
                    {...devRef('b50')}
                    onClick={() => setAgentTableView('traits')}
                  >
                    🎚️ Traits &amp; Character
                  </button>
                </div>
                {agentTableView === 'traits' ? (
                  <div className="table-scroll">
                    <table className="agent-table">
                      <thead>
                        <tr>
                          <th></th>
                          <th>Ref</th>
                          <th>Name</th>
                          <th>Categories</th>
                          {traitDefs.map((def) => (
                            <th key={def.id} title={def.category}>
                              {def.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {agents.map((agent) => {
                          const cats = categoriesForAgent(agent.name);
                          return (
                          <tr key={agent.id} className={`agent-row ${agent.id === currentAgentId ? 'current' : ''}`}>
                            <td>
                              <div
                                className="avatar"
                                style={{ background: agent.color, width: 22, height: 22, fontSize: 11 }}
                              >
                                {agent.name.charAt(0).toUpperCase()}
                              </div>
                            </td>
                            <td
                              style={{ cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}
                              title="Click to open in Configure Agent"
                              onClick={() => selectAgent(agent.id)}
                            >
                              {agent.refNumber}
                            </td>
                            <td>{agent.name}</td>
                            <td
                              style={{ position: 'relative' }}
                              ref={categoryMenuAgentId === agent.id ? tableCategoryMenuRef : undefined}
                            >
                              <div
                                style={{ display: 'flex', flexWrap: 'wrap', gap: 3, cursor: 'pointer', minHeight: 18 }}
                                title="Click to edit categories"
                                onClick={() => {
                                  setTableCategoryFilter('');
                                  setCategoryMenuAgentId((prev) => (prev === agent.id ? null : agent.id));
                                }}
                              >
                                {cats.length === 0 ? (
                                  <span className="category-chip" style={{ opacity: 0.6 }}>
                                    + add ▾
                                  </span>
                                ) : (
                                  cats.map((c) => (
                                    <span key={c} className="category-chip">
                                      {c}
                                    </span>
                                  ))
                                )}
                              </div>
                              {categoryMenuAgentId === agent.id && (
                                <div className="moods-menu" style={{ zIndex: 60 }}>
                                  <input
                                    type="text"
                                    className="control-input"
                                    autoFocus
                                    placeholder="Filter categories…"
                                    value={tableCategoryFilter}
                                    onChange={(e) => setTableCategoryFilter(e.target.value)}
                                  />
                                  <div className="moods-menu-list">
                                    {allCategoryNames
                                      .filter((catName) =>
                                        catName.toLowerCase().includes(tableCategoryFilter.trim().toLowerCase())
                                      )
                                      .map((catName) => (
                                        <div key={catName} className="moods-menu-row">
                                          <label>
                                            <input
                                              type="checkbox"
                                              checked={cats.includes(catName)}
                                              onChange={() => toggleAgentCategory(agent, catName)}
                                            />
                                            {catName}
                                          </label>
                                        </div>
                                      ))}
                                    {allCategoryNames.filter((catName) =>
                                      catName.toLowerCase().includes(tableCategoryFilter.trim().toLowerCase())
                                    ).length === 0 && (
                                      <div className="moods-menu-empty">No categories match.</div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>
                            {traitDefs.map((def) => {
                              const value = agent.traits?.[def.id] ?? 50;
                              return (
                                <td key={def.id}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <input
                                      type="range"
                                      min={0}
                                      max={100}
                                      value={value}
                                      style={{ width: 70 }}
                                      onChange={(e) => updateAgentTraitFor(agent.id, def.id, Number(e.target.value))}
                                    />
                                    <span style={{ fontSize: 11, minWidth: 20, textAlign: 'right' }}>{value}</span>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                          );
                        })}
                        {traitDefs.length === 0 && (
                          <tr>
                            <td colSpan={4}>
                              <div className="empty-state">No traits defined yet — add one in Traits &amp; Character above.</div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                <div className="table-scroll">
                  <table className="agent-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th className="sortable" onClick={() => toggleAgentSort('ref')}>
                          Ref{sortArrow('ref')}
                        </th>
                        <th className="sortable" onClick={() => toggleAgentSort('name')}>
                          Name{sortArrow('name')}
                        </th>
                        <th className="sortable" onClick={() => toggleAgentSort('role')}>
                          Role{sortArrow('role')}
                        </th>
                        <th className="sortable" onClick={() => toggleAgentSort('category')}>
                          Categories{sortArrow('category')}
                        </th>
                        <th className="sortable" onClick={() => toggleAgentSort('llm')}>
                          LLM{sortArrow('llm')}
                        </th>
                        <th>Order</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedAgents.map((agent) => {
                        const index = agents.findIndex((a) => a.id === agent.id);
                        const savedAgent = agents.find((a) => a.id === agent.id) ?? agent;
                        const cats = categoriesForAgent(savedAgent.name);
                        return (
                          <tr
                            className={`agent-row ${agent.id === currentAgentId ? 'current' : ''} ${
                              dragOverAgentId === agent.id ? 'drag-over' : ''
                            }`}
                            key={agent.id}
                            {...devRef('r2', index)}
                            draggable={agentSortColumn === null}
                            style={{ cursor: agentSortColumn === null ? 'grab' : 'default' }}
                            onDragStart={() => setDraggedAgentId(agent.id)}
                            onDragOver={(e) => {
                              if (agentSortColumn !== null) return;
                              e.preventDefault();
                              setDragOverAgentId(agent.id);
                            }}
                            onDragLeave={() => setDragOverAgentId((prev) => (prev === agent.id ? null : prev))}
                            onDrop={(e) => {
                              if (agentSortColumn !== null) return;
                              e.preventDefault();
                              setDragOverAgentId(null);
                              if (!draggedAgentId || draggedAgentId === agent.id) return;
                              const fromIdx = agents.findIndex((a) => a.id === draggedAgentId);
                              const toIdx = agents.findIndex((a) => a.id === agent.id);
                              if (fromIdx < 0 || toIdx < 0) return;
                              const next = [...agents];
                              const [moved] = next.splice(fromIdx, 1);
                              next.splice(toIdx, 0, moved);
                              onReorderAgents(next);
                              setDraggedAgentId(null);
                            }}
                            onDragEnd={() => {
                              setDraggedAgentId(null);
                              setDragOverAgentId(null);
                            }}
                          >
                            <td>
                              <div className="avatar" style={{ background: agent.color, width: 22, height: 22, fontSize: 11 }}>
                                {agent.name.charAt(0).toUpperCase()}
                              </div>
                            </td>
                            <td
                              style={{ cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}
                              title="Click to open in Configure Agent"
                              onClick={() => selectAgent(agent.id)}
                            >
                              {agent.refNumber}
                            </td>
                            <td>
                              <input
                                type="text"
                                {...devRef('i21', index)}
                                value={agent.name}
                                onChange={(e) => updateDraftField(agent.id, { name: e.target.value })}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                {...devRef('i22', index)}
                                value={agent.role}
                                onChange={(e) => updateDraftField(agent.id, { role: e.target.value })}
                              />
                            </td>
                            <td
                              style={{ position: 'relative' }}
                              ref={categoryMenuAgentId === agent.id ? tableCategoryMenuRef : undefined}
                            >
                              <div
                                {...devRef('dr18', index)}
                                style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: 3,
                                  cursor: 'pointer',
                                  minHeight: 18,
                                }}
                                title="Click to edit categories"
                                onClick={() => {
                                  setTableCategoryFilter('');
                                  setCategoryMenuAgentId((prev) => (prev === agent.id ? null : agent.id));
                                }}
                              >
                                {cats.length === 0 ? (
                                  <span className="category-chip" style={{ opacity: 0.6 }}>
                                    + add ▾
                                  </span>
                                ) : (
                                  cats.map((c) => (
                                    <span key={c} className="category-chip">
                                      {c}
                                    </span>
                                  ))
                                )}
                              </div>
                              {categoryMenuAgentId === agent.id && (
                                <div className="moods-menu" style={{ zIndex: 60 }}>
                                  <input
                                    type="text"
                                    className="control-input"
                                    {...devRef('i23', index)}
                                    autoFocus
                                    placeholder="Filter categories…"
                                    value={tableCategoryFilter}
                                    onChange={(e) => setTableCategoryFilter(e.target.value)}
                                  />
                                  <div className="moods-menu-list">
                                    {allCategoryNames
                                      .filter((catName) =>
                                        catName.toLowerCase().includes(tableCategoryFilter.trim().toLowerCase())
                                      )
                                      .map((catName) => (
                                        <div key={catName} className="moods-menu-row">
                                          <label>
                                            <input
                                              type="checkbox"
                                              {...devRef('ck12', index)}
                                              checked={cats.includes(catName)}
                                              onChange={() => toggleAgentCategory(savedAgent, catName)}
                                            />
                                            {catName}
                                          </label>
                                        </div>
                                      ))}
                                    {allCategoryNames.filter((catName) =>
                                      catName.toLowerCase().includes(tableCategoryFilter.trim().toLowerCase())
                                    ).length === 0 && (
                                      <div className="moods-menu-empty">No categories match.</div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td style={{ maxWidth: 110 }}>
                              <select
                                {...devRef('dr19', index)}
                                style={{ maxWidth: 110 }}
                                title={
                                  agent.connectionId
                                    ? connections.find((c) => c.id === agent.connectionId)?.label
                                    : 'No LLM connected'
                                }
                                value={agent.connectionId ?? ''}
                                onChange={(e) =>
                                  updateDraftField(agent.id, { connectionId: e.target.value || null })
                                }
                              >
                                <option value="">No LLM</option>
                                {connections.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <div className="agent-reorder-btns">
                                <button
                                  className="btn-icon"
                                  {...devRef('b34', index)}
                                  onClick={() => moveAgent(agent.id, -1)}
                                  disabled={index === 0}
                                  title="Move up (renumbers Agt##)"
                                >
                                  ▲
                                </button>
                                <button
                                  className="btn-icon"
                                  {...devRef('b35', index)}
                                  onClick={() => moveAgent(agent.id, 1)}
                                  disabled={index === agents.length - 1}
                                  title="Move down (renumbers Agt##)"
                                >
                                  ▼
                                </button>
                              </div>
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <button
                                className="btn-icon delete"
                                {...devRef('b36', index)}
                                onClick={() => onDelete(agent.id)}
                                disabled={agents.length <= 1}
                                title={agents.length <= 1 ? 'At least one agent is required' : 'Delete agent'}
                              >
                                🗑️
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                )}
                {agentTableView === 'overview' && (
                  <button className="btn-primary" {...devRef('b48')} onClick={saveTableDraft} style={{ marginTop: 8 }}>
                    💾 Save All Changes
                  </button>
                )}
                <button className="btn-secondary" {...devRef('b37')} onClick={onAdd}>
                  + Add Blank Agent
                </button>
                <button className="btn-secondary" {...devRef('b38')} onClick={onOpenLibrary}>
                  📚 Browse Agent Library
                </button>
              </div>
            </>
          )}

          {tab === 'llm' && (
            <div {...devRef('s16')}>
              <LLMProvidersModal
                embedded
                connections={connections}
                onChange={onChangeConnections}
                agents={agents}
                onUpdateAgents={onUpdateAgentsBulk}
                onClose={() => {}}
                onToast={onToast}
                googleTtsModel={googleTtsModel}
                onUpdateTtsModel={(model) => onUpdateTts({ googleTtsModel: model })}
              />
            </div>
          )}

          {tab === 'audio' && (
            <div {...devRef('s17')}>
              <AudioModal
                embedded
                agents={agents}
                threads={threads}
                ttsRate={ttsRate}
                ttsLang={ttsLang}
                ttsProvider={ttsProvider}
                googleTtsModel={googleTtsModel}
                onUpdateTts={onUpdateTts}
                onClose={() => {}}
                onToast={onToast}
              />
            </div>
          )}

          {tab === 'display' && (
            <div {...devRef('s27')}>
              <div className="modal-section">
                <h3>🔠 Text Size</h3>
                <p style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>
                  Controls the size of message text in Thread View — and doubles as the default bubble
                  text size in Scene View (Scene View's own size dropdown can still override it for that
                  session).
                </p>
                <div className="control-group">
                  <select
                    className="control-input"
                    {...devRef('dr30')}
                    value={textSize}
                    onChange={(e) => onUpdateTextSize(e.target.value as 'xs' | 'sm' | 'md' | 'lg')}
                  >
                    <option value="xs">Extra Small</option>
                    <option value="sm">Small (default)</option>
                    <option value="md">Medium</option>
                    <option value="lg">Large</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {tab === 'wiki' && (
            <div {...devRef('s23')}>
              <div className="modal-section">
                <h3>📚 Shared Wiki</h3>
                <p style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>
                  A compact, LLM-maintained summary of facts/decisions/open questions from every
                  thread in this conversation — injected into every agent's prompt so agents in
                  different threads stay aware of what's been said elsewhere, without sending the
                  full raw history to every call.
                </p>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                  <input
                    type="checkbox"
                    {...devRef('ck13')}
                    checked={wikiEnabled}
                    onChange={(e) => onUpdateWiki({ wikiEnabled: e.target.checked })}
                  />
                  Enable shared wiki
                </label>
                <div className="form-group compact-field">
                  <label>Wiki Keeper (LLM connection that writes the digest)</label>
                  <select
                    {...devRef('dr24')}
                    value={wikiKeeperConnectionId ?? ''}
                    onChange={(e) => onUpdateWiki({ wikiKeeperConnectionId: e.target.value || null })}
                  >
                    <option value="">— none —</option>
                    {connections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group compact-field">
                  <label>Refresh every N new messages</label>
                  <input
                    type="number"
                    min={1}
                    {...devRef('i25')}
                    value={wikiRefreshInterval}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n) && n >= 1) onUpdateWiki({ wikiRefreshInterval: Math.floor(n) });
                    }}
                  />
                </div>
                <button className="btn-secondary" {...devRef('b61')} onClick={onRefreshWikiNow}>
                  🔄 Regenerate now
                </button>

                {(() => {
                  const selected = wikiViewIndex == null
                    ? { digest: wikiDigest, updatedAt: wikiUpdatedAt, messageCount: null as number | null }
                    : wikiHistory[wikiViewIndex] ?? { digest: wikiDigest, updatedAt: wikiUpdatedAt, messageCount: null };
                  const selectedDigest = selected.digest;
                  const totalRawChars = threads.reduce(
                    (n, t) => n + t.messages.reduce((m, msg) => m + msg.content.length, 0),
                    0
                  );
                  const estRawTokens = Math.round(totalRawChars / 4);
                  const estDigestTokens = Math.round(selectedDigest.length / 4);
                  const savedPct =
                    estRawTokens > 0 ? Math.round((1 - estDigestTokens / Math.max(estRawTokens, 1)) * 100) : 0;

                  async function downloadJpeg() {
                    if (!selectedDigest) return;
                    setWikiJpegExporting(true);
                    try {
                      const html =
                        wikiViewMode === 'bullets'
                          ? renderWikiHtml(selectedDigest)
                          : `<pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(selectedDigest)}</pre>`;
                      const wrapped = `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#111;padding:32px;">${html}</div>`;
                      await downloadHtmlAsJpeg(wrapped, 1000, 1400, 'shared-wiki.jpg');
                    } finally {
                      setWikiJpegExporting(false);
                    }
                  }

                  return (
                    <>
                      <div className="form-group compact-field" style={{ marginTop: 12 }}>
                        <label>Version</label>
                        <select
                          value={wikiViewIndex == null ? 'current' : String(wikiViewIndex)}
                          onChange={(e) =>
                            setWikiViewIndex(e.target.value === 'current' ? null : Number(e.target.value))
                          }
                        >
                          <option value="current">
                            Current{wikiUpdatedAt ? ` (${new Date(wikiUpdatedAt).toLocaleString()})` : ' (not generated yet)'}
                          </option>
                          {wikiHistory.map((h, i) => (
                            <option key={h.updatedAt} value={i}>
                              {new Date(h.updatedAt).toLocaleString()} — {h.messageCount} messages
                            </option>
                          ))}
                        </select>
                      </div>

                      <p style={{ fontSize: 12, opacity: 0.7, margin: '4px 0 12px' }}>
                        Full conversation so far: ~{estRawTokens.toLocaleString()} tokens (est.) · this digest: ~
                        {estDigestTokens.toLocaleString()} tokens (est.) ·{' '}
                        {savedPct > 0 ? `~${savedPct}% smaller` : 'no reduction yet'}
                      </p>

                      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                        <button
                          className={`btn-secondary ${wikiViewMode === 'bullets' ? 'active' : ''}`}
                          style={{ width: 'auto' }}
                          onClick={() => setWikiViewMode('bullets')}
                        >
                          • Bullets
                        </button>
                        <button
                          className={`btn-secondary ${wikiViewMode === 'raw' ? 'active' : ''}`}
                          style={{ width: 'auto' }}
                          onClick={() => setWikiViewMode('raw')}
                        >
                          📄 Raw
                        </button>
                        <button
                          className="btn-secondary"
                          style={{ width: 'auto' }}
                          disabled={!selectedDigest}
                          onClick={() => onOpenMindmap(selectedDigest, 'Shared Wiki')}
                        >
                          🗺️ Mind Map
                        </button>
                        <button
                          className="btn-secondary"
                          style={{ width: 'auto' }}
                          disabled={!selectedDigest || wikiJpegExporting}
                          onClick={downloadJpeg}
                        >
                          🖼️ {wikiJpegExporting ? 'Exporting…' : 'Download JPEG'}
                        </button>
                      </div>

                      <div className="form-group">
                        {wikiViewMode === 'raw' ? (
                          <textarea
                            readOnly
                            {...devRef('t6')}
                            value={selectedDigest || '(empty — enable the wiki and pick a keeper connection, then send a few messages)'}
                            rows={14}
                          />
                        ) : selectedDigest ? (
                          <div
                            className="wiki-bullet-view"
                            dangerouslySetInnerHTML={{ __html: renderWikiHtml(selectedDigest) }}
                          />
                        ) : (
                          <p style={{ opacity: 0.7 }}>
                            (empty — enable the wiki and pick a keeper connection, then send a few messages)
                          </p>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {tab === 'archives' && (
            <div {...devRef('s18')}>
              <ArchivesModal
                embedded
                archives={archives}
                onRestore={onRestoreArchive}
                onDelete={onDeleteArchive}
                onUpdateMeta={onUpdateArchiveMeta}
                onClose={() => {}}
              />
            </div>
          )}

          {tab === 'log' && (
            <div {...devRef('s19')}>
              <ChangeLogPanel />
            </div>
          )}

          {tab === 'account' && (
            <div {...devRef('s20')}>
              <AccountSettingsPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
