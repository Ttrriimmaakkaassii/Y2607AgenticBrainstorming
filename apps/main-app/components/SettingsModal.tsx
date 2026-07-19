'use client';

import { useEffect, useRef, useState } from 'react';
import { getProvider } from '@/lib/llm-catalog';
import { Agent, ArchivedConversation, LLMConnection, Thread } from '@/lib/types';
import { AGENT_LIBRARY, AgentPreset } from '@/lib/agent-library';
import { loadCustomAgents, upsertCustomAgent } from '@/lib/custom-agents';
import { CustomCategory, addCustomCategory, loadCustomCategories } from '@/lib/categories';
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
import { generateId } from '@/lib/id';
import { downloadHtmlAsJpeg } from '@/lib/rasterize-svg';
import { useAuthContext } from '@/lib/auth-context';
import { fetchWebAccessStatus, type WebAccessStatus } from '@/lib/web-access-status';
import { callBrowseUrlTool } from '@/lib/web-browse';
import { callWebSearchTool } from '@/lib/web-search';
import { devRef } from '@/lib/devref';
import { useClickOutside } from '@/lib/use-click-outside';
import { useOverlayClose } from '@/lib/use-overlay-close';
import { LLMProvidersModal } from './LLMProvidersModal';
import { AudioModal } from './AudioModal';
import { ArchivesModal } from './ArchivesModal';
import { ChangeLogPanel } from './ChangeLogPanel';
import { AccountSettingsPanel } from './AccountSettingsPanel';
import { MindmapModal } from './MindmapModal';
import { buildTextFieldMindmapMarkdown } from '@/lib/mindmap';
import {
  autoPopulateField,
  autoPopulateAll,
  elaborateField,
  fetchMindmap,
  DEFAULT_MAX_TOKENS,
  type AgentAutoField,
} from '@/lib/llm-client';
import { sumTokens, groupByAgentAndModel } from '@/lib/token-stats';

type SettingsTab = 'agent' | 'llm' | 'tokens' | 'audio' | 'display' | 'wiki' | 'archives' | 'log' | 'account';

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
  /** Optional deep-link: open the modal focused on this tab (e.g. from a notification's "take me there" action). When set/changed while mounted, the tab switches to it. */
  initialTab?: SettingsTab;
  connections: LLMConnection[];
  onSelectAgent: (id: string) => void;
  onSave: (id: string, updates: Partial<Agent>) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  /** Clone an agent (new id/refNumber, name suffixed "(copy)") — single-click duplicate from the table. */
  onDuplicateAgent: (id: string) => void;
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
  /** Per-reply output-token cap (null = DEFAULT_MAX_TOKENS, 4096). Functional as of the GLM-5.2 fix — was previously a dead UI field. */
  maxTokens: number | null;
  onUpdateMaxTokens: (v: number | null) => void;
  /** Open the full 📊 Analytics modal (period-filtered usage) from the Tokens tab. */
  onOpenAnalytics: () => void;
}

export function SettingsModal({
  agents,
  currentAgentId,
  initialTab,
  connections,
  onSelectAgent,
  onSave,
  onAdd,
  onDelete,
  onDuplicateAgent,
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
  maxTokens,
  onUpdateMaxTokens,
  onOpenAnalytics,
}: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>(initialTab ?? 'agent');
  // Deep-link support: when the parent passes/changes initialTab (e.g. a
  // notification's "take me there" action opening Settings straight to the
  // Wiki tab), switch to it.
  useEffect(() => {
    if (initialTab) setTab(initialTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab]);
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
  const [identity, setIdentity] = useState(currentAgent?.identity ?? '');
  const [skills, setSkills] = useState(currentAgent?.skills ?? '');
  const [loopGuidance, setLoopGuidance] = useState(currentAgent?.loopGuidance ?? '');
  const [description, setDescription] = useState(currentAgent?.description ?? '');
  const [color, setColor] = useState(currentAgent?.color ?? '#3b99fc');
  const [connectionId, setConnectionId] = useState<string | null>(
    currentAgent?.connectionId ?? null
  );
  const [voiceURI, setVoiceURI] = useState<string | null>(currentAgent?.voiceURI ?? null);
  const [googleVoiceName, setGoogleVoiceName] = useState<string | null>(
    currentAgent?.googleVoiceName ?? null
  );
  // ✨ Auto-populate state. The connection used to generate profile fields —
  // defaults to the opened agent's own connection, but the user can repoint it
  // on the fly to any saved connection ("use the llm user chooses on the go").
  const [autoConnId, setAutoConnId] = useState<string | null>(currentAgent?.connectionId ?? null);
  // Tracks which field/action is generating: a field key (per-field ✨ or 📈),
  // or 'all' for the Auto-populate-all button. Empty = idle.
  const [autoBusy, setAutoBusy] = useState<'' | AgentAutoField | `${AgentAutoField}-elab` | 'all'>('');
  const [autoError, setAutoError] = useState<string | null>(null);
  // 🧠 Per-field "view as mind map" — set to open MindmapModal over this modal.
  const [mindmapField, setMindmapField] = useState<{ title: string; markdown: string } | null>(null);
  const [mindmapBusy, setMindmapBusy] = useState(false);
  // Build a conclusive mind map for a field via the Wiki Keeper connection,
  // falling back to the naive text-splitting builder when no keeper is set or
  // the call fails — so the button always opens something useful.
  async function openFieldMindmap(label: string, value: string) {
    const title = `${name || 'Agent'} — ${label}`;
    const fallback = () => setMindmapField({ title, markdown: buildTextFieldMindmapMarkdown(label, value) });
    const keeper = connections.find((c) => c.id === wikiKeeperConnectionId);
    if (!keeper || !value.trim()) {
      fallback();
      return;
    }
    setMindmapBusy(true);
    try {
      const md = await fetchMindmap(keeper, title, value);
      setMindmapField({ title, markdown: md ?? buildTextFieldMindmapMarkdown(label, value) });
    } catch {
      fallback();
    } finally {
      setMindmapBusy(false);
    }
  }
  // These only had their initial useState value — fine while currentAgentId
  // never changes without a manual row click (selectAgent already handles
  // that), but if it's ever changed from outside while this modal stays
  // mounted, the form kept showing the PREVIOUSLY selected agent's
  // name/role/color/etc. next to the NEW agent's ref number — exactly the
  // "shows an agent I didn't create" symptom. Keep it reactive instead.
  useEffect(() => {
    if (!currentAgent) return;
    setName(currentAgent.name);
    setRole(currentAgent.role);
    setInstructions(currentAgent.instructions);
    setIdentity(currentAgent.identity ?? '');
    setSkills(currentAgent.skills ?? '');
    setLoopGuidance(currentAgent.loopGuidance ?? '');
    setDescription(currentAgent.description ?? '');
    setColor(currentAgent.color);
    setConnectionId(currentAgent.connectionId);
    setAutoConnId(currentAgent.connectionId ?? null);
    setAutoError(null);
    setVoiceURI(currentAgent.voiceURI ?? null);
    setGoogleVoiceName(currentAgent.googleVoiceName ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAgentId]);
  // Whether each web-access backend's secret is present on the deployment
  // (presence only — the status endpoint never exposes values). Fetched once
  // when the modal opens so the 🌐 toggle area can show what's actually
  // wired up, not just what's enabled per-agent.
  const [webAccessStatus, setWebAccessStatus] = useState<WebAccessStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchWebAccessStatus().then((s) => {
      if (!cancelled) setWebAccessStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  // Live "does this backend actually work?" tests — exercise the exact same
  // /api/research/* path the agents use, with a fixed probe (browse
  // google.com for Cloudflare; search a current question for Tavily).
  type ProbeState = { status: 'idle' | 'testing' | 'ok' | 'fail'; detail: string };
  const [browseProbe, setBrowseProbe] = useState<ProbeState>({ status: 'idle', detail: '' });
  const [searchProbe, setSearchProbe] = useState<ProbeState>({ status: 'idle', detail: '' });

  async function runBrowseProbe() {
    const token = auth?.session.access_token ?? null;
    if (!token) {
      setBrowseProbe({ status: 'fail', detail: 'Sign in first — browse requires a session.' });
      return;
    }
    setBrowseProbe({ status: 'testing', detail: '' });
    const result = await callBrowseUrlTool({ url: 'https://www.google.com' }, token);
    if (result.ok) {
      setBrowseProbe({
        status: 'ok',
        detail: `✅ Rendered google.com — ${result.content.length} chars of content returned.`,
      });
    } else {
      setBrowseProbe({ status: 'fail', detail: `❌ ${result.error?.code ?? 'FAILED'}: ${result.error?.message ?? ''}` });
    }
  }

  async function runSearchProbe() {
    const token = auth?.session.access_token ?? null;
    if (!token) {
      setSearchProbe({ status: 'fail', detail: 'Sign in first — search requires a session.' });
      return;
    }
    setSearchProbe({ status: 'testing', detail: '' });
    const result = await callWebSearchTool({ query: "who is winning the FIFA 2026 World Cup" }, token);
    if (result.ok) {
      const top = result.results[0];
      setSearchProbe({
        status: 'ok',
        detail: `✅ ${result.results.length} result(s)${
          top ? ` — top: ${top.title || top.url}` : ''
        }.`,
      });
    } else {
      setSearchProbe({ status: 'fail', detail: `❌ ${result.error?.code ?? 'FAILED'}: ${result.error?.message ?? ''}` });
    }
  }
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
  const [agentTableView, setAgentTableView] = useState<'overview' | 'traits' | 'importance'>('overview');
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

  /** Creates a brand-new skill category (if the name isn't already taken) and immediately assigns it to `agent`, so users don't have to leave the assignment picker to file someone under a category that doesn't exist yet. */
  function addAndAssignCategory(agent: Agent, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = addCustomCategory(trimmed, '📁', '#8e44ad');
    setCustomCategories(next);
    toggleAgentCategory(agent, trimmed);
  }

  function updateAgentTrait(traitId: string, value: number) {
    if (!currentAgent) return;
    onUpdateAgentTraits(currentAgent.id, { ...currentAgent.traits, [traitId]: value });
  }

  /** Every agent parameter that exists, from both this conversation (traits,
   * voice, active/connection state) and the saved library (which persists
   * across conversations) — a single file that fully restores an agent
   * roster if it's ever lost. */
  function exportAgentsBackup() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      conversationAgents: agents,
      libraryAgents: customAgents,
      categories: customCategories,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'agents-backup.json';
    link.click();
    URL.revokeObjectURL(url);
    onToast('📥 Downloaded agents backup.');
  }

  function fileBase(name: string): string {
    return name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'agent';
  }

  // Per-agent download — each agent as its OWN file (the user's "choose what
  // agents to download, each with its file"). Markdown so it reads as a
  // profile, with every field that defines the agent. Pairs with the existing
  // all-in-one JSON backup above.
  function downloadAgentProfile(agent: Agent) {
    const conn = connections.find((c) => c.id === agent.connectionId);
    const md = [
      `# ${agent.name}`,
      '',
      `- **Ref:** ${agent.refNumber}`,
      `- **Role:** ${agent.role}`,
      `- **LLM:** ${conn ? `${conn.label} (${conn.provider} · ${conn.model})` : 'none (simulated)'}`,
      `- **Pinned to all conversations:** ${agent.pinnedToAllConversations ? 'yes' : 'no'}`,
      `- **Web access:** ${agent.webSearchEnabled ? 'enabled' : 'disabled'}`,
      '',
      '## Identity',
      agent.identity.trim() || '_(empty)_',
      '',
      '## Skills',
      agent.skills.trim() || '_(empty)_',
      '',
      '## Instructions',
      agent.instructions.trim() || '_(empty)_',
      '',
      '## Loop participation',
      agent.loopGuidance.trim() || '_(empty — uses the default anti-repeat fallback)_',
      '',
      '## Description (auto-populate source)',
      agent.description.trim() || '_(empty)_',
      '',
      '## Traits',
      Object.keys(agent.traits ?? {}).length === 0
        ? '_(none set)_'
        : Object.entries(agent.traits).map(([k, v]) => `- ${k}: ${v}/100`).join('\n'),
      '',
    ].join('\n');
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileBase(agent.name)}-${agent.refNumber}.md`;
    link.click();
    URL.revokeObjectURL(url);
    onToast(`📥 Downloaded ${agent.name}.`);
  }

  // A "root" agent (name has no " #N" suffix) that has at least one numbered
  // duplicate in the roster shows an asterisk, signalling "this agent has been
  // duplicated". Numbered duplicates themselves are not flagged.
  const rootName = (name: string) => name.replace(/\s*#\d+$/, '').trim() || name;
  function hasDuplicate(agent: Agent): boolean {
    if (/\s*#\d+$/.test(agent.name)) return false; // only roots are flagged
    const base = rootName(agent.name);
    return agents.some((a) => a.id !== agent.id && rootName(a.name) === base);
  }

  function importAgentsBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as {
          conversationAgents?: Agent[];
          libraryAgents?: AgentPreset[];
          categories?: CustomCategory[];
        };
        (parsed.libraryAgents ?? []).forEach((p) => upsertCustomAgent(p));
        if (parsed.libraryAgents?.length) setCustomAgents(loadCustomAgents());

        const existingCategoryNames = new Set(customCategories.map((c) => c.name.toLowerCase()));
        (parsed.categories ?? []).forEach((c) => {
          if (!existingCategoryNames.has(c.name.toLowerCase())) addCustomCategory(c.name, c.icon, c.color);
        });
        if (parsed.categories?.length) setCustomCategories(loadCustomCategories());

        const imported = parsed.conversationAgents ?? [];
        if (imported.length > 0) {
          // Fresh ids/ref numbers so they can't collide with anything already
          // in this conversation, and no stale connection (a connection id
          // from wherever this backup came from won't exist here) — every
          // other detail (name/role/instructions/color/traits/voice) restored
          // as-is, added inactive so they don't suddenly join a live round.
          let nextNumber =
            Math.max(0, ...agents.map((a) => Number(/Agt(\d+)/.exec(a.refNumber)?.[1] ?? 0))) + 1;
          const restored = imported.map((a) => ({
            ...a,
            id: generateId(),
            refNumber: `Agt${nextNumber++}`,
            connectionId: null,
            active: false,
          }));
          onUpdateAgentsBulk([...agents, ...restored]);
        }
        onToast(`✅ Imported agents backup (${imported.length} agent(s), ${(parsed.libraryAgents ?? []).length} library preset(s)).`);
      } catch {
        onToast('Could not read that file — expected an agents backup JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
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
    if (agentSortColumn === 'ref') {
      // Numeric, not lexicographic — "Agt2" must sort before "Agt11",
      // which plain string comparison gets wrong (treats it character by
      // character, so "Agt11" < "Agt2").
      const numFor = (a: Agent) => Number(/Agt(\d+)/.exec(a.refNumber ?? '')?.[1] ?? 0);
      return [...tableAgentsDraft].sort((a, b) => (numFor(a) - numFor(b)) * dir);
    }
    const keyFor = (a: Agent) => {
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
      identity,
      skills,
      loopGuidance,
      description,
      color,
      connectionId,
      voiceURI,
      googleVoiceName,
      llmProvider: connection?.provider ?? currentAgent.llmProvider,
    });
  }

  // ✨ Auto-populate operates on the OPENED agent only (currentAgent). Uses
  // the connection picked in autoConnId (defaults to the agent's own) and the
  // agent's `description` as the source of truth. Generated text is written
  // into the local form fields for immediate editing AND persisted via onSave
  // so it survives a modal close. Never silently blanks a field — a failed
  // generation surfaces an error and leaves the field untouched.
  function snapshotForAuto(): Agent | null {
    if (!currentAgent) return null;
    return { ...currentAgent, identity, instructions, skills, loopGuidance, description };
  }

  async function runAutoField(field: AgentAutoField) {
    const agent = snapshotForAuto();
    const connection = connections.find((c) => c.id === autoConnId);
    if (!agent || !connection) {
      setAutoError('Pick an LLM connection to generate with.');
      return;
    }
    if (!description.trim()) {
      setAutoError('Add a description first — it’s the source of truth for generation.');
      return;
    }
    setAutoError(null);
    setAutoBusy(field);
    try {
      const text = await autoPopulateField(agent, field, connection);
      if (!text) {
        setAutoError(`Couldn’t generate ${field} — try again or pick another connection.`);
        return;
      }
      if (field === 'identity') setIdentity(text);
      if (field === 'instructions') setInstructions(text);
      if (field === 'skills') setSkills(text);
      if (field === 'loopGuidance') setLoopGuidance(text);
      onSave(agent.id, {
        identity: field === 'identity' ? text : identity,
        instructions: field === 'instructions' ? text : instructions,
        skills: field === 'skills' ? text : skills,
        loopGuidance: field === 'loopGuidance' ? text : loopGuidance,
      });
    } catch {
      setAutoError('Generation failed — check the connection/key and retry.');
    } finally {
      setAutoBusy('');
    }
  }

  // 📈 Elaborate: expand THIS field's existing text into a richer version
  // (builds on what's already there, unlike ✨ which drafts from the
  // description). Operates on the opened agent only; needs existing text.
  async function runElaborate(field: AgentAutoField) {
    const agent = snapshotForAuto();
    const connection = connections.find((c) => c.id === autoConnId);
    const current = (
      field === 'identity' ? identity : field === 'instructions' ? instructions : field === 'skills' ? skills : loopGuidance
    ).trim();
    if (!agent || !connection) {
      setAutoError('Pick an LLM connection to generate with.');
      return;
    }
    if (!current) {
      setAutoError(`Add some text to ${field} first — Elaborate expands what’s already there.`);
      return;
    }
    setAutoError(null);
    setAutoBusy(`${field}-elab`);
    try {
      const text = await elaborateField(agent, field, connection);
      if (!text) {
        setAutoError(`Couldn’t elaborate ${field} — try again or pick another connection.`);
        return;
      }
      if (field === 'identity') setIdentity(text);
      if (field === 'instructions') setInstructions(text);
      if (field === 'skills') setSkills(text);
      if (field === 'loopGuidance') setLoopGuidance(text);
      onSave(agent.id, {
        identity: field === 'identity' ? text : identity,
        instructions: field === 'instructions' ? text : instructions,
        skills: field === 'skills' ? text : skills,
        loopGuidance: field === 'loopGuidance' ? text : loopGuidance,
      });
    } catch {
      setAutoError('Generation failed — check the connection/key and retry.');
    } finally {
      setAutoBusy('');
    }
  }

  async function runAutoAll() {
    const agent = snapshotForAuto();
    const connection = connections.find((c) => c.id === autoConnId);
    if (!agent || !connection) {
      setAutoError('Pick an LLM connection to generate with.');
      return;
    }
    if (!description.trim()) {
      setAutoError('Add a description first — it’s the source of truth for generation.');
      return;
    }
    setAutoError(null);
    setAutoBusy('all');
    try {
      const profile = await autoPopulateAll(agent, connection);
      if (!profile) {
        setAutoError('Couldn’t generate the full profile — try again or pick another connection.');
        return;
      }
      const next = {
        identity: profile.identity || identity,
        instructions: profile.instructions || instructions,
        skills: profile.skills || skills,
        loopGuidance: profile.loopGuidance || loopGuidance,
      };
      setIdentity(next.identity);
      setInstructions(next.instructions);
      setSkills(next.skills);
      setLoopGuidance(next.loopGuidance);
      onSave(agent.id, next);
    } catch {
      setAutoError('Generation failed — check the connection/key and retry.');
    } finally {
      setAutoBusy('');
    }
  }

  const auth = useAuthContext();
  const TABS: { id: SettingsTab; label: string }[] = [
    { id: 'agent', label: '🧑 Agent' },
    { id: 'llm', label: '🔌 LLM' },
    { id: 'tokens', label: '🪙 Tokens' },
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

              <div className="modal-section" {...devRef('s33')}>
                <div className="modal-section-title">🧪 Test web access</div>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
                  Live probes through the same /api/research/* path the agents use. Sign in is
                  required. Shows whether each backend actually returns real data — faster than
                  starting a discussion to find out.
                </div>
                <div className="web-probe-row">
                  <button className="btn-secondary" onClick={runBrowseProbe} disabled={browseProbe.status === 'testing'}>
                    {browseProbe.status === 'testing' ? '🌐 Testing…' : '🌐 Test Cloudflare (browse google.com)'}
                  </button>
                  {browseProbe.status !== 'idle' && browseProbe.status !== 'testing' && (
                    <span className={`web-probe-detail ${browseProbe.status}`}>{browseProbe.detail}</span>
                  )}
                </div>
                <div className="web-probe-row">
                  <button className="btn-secondary" onClick={runSearchProbe} disabled={searchProbe.status === 'testing'}>
                    {searchProbe.status === 'testing' ? '🔍 Testing…' : '🔍 Test Tavily (search "FIFA 2026")'}
                  </button>
                  {searchProbe.status !== 'idle' && searchProbe.status !== 'testing' && (
                    <span className={`web-probe-detail ${searchProbe.status}`}>{searchProbe.detail}</span>
                  )}
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
                <div className="modal-section agent-profile-section" {...devRef('s14b')}>
                  <div className="modal-section-title">Agent profile</div>
                  <div className="form-group">
                    <label>
                      Description <span className="field-hint">(source of truth for ✨ Auto-populate)</span>
                    </label>
                    <textarea
                      {...devRef('t-desc')}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe this agent in plain language — its expertise, voice, and purpose. The ✨ buttons below draft the profile fields from this."
                    />
                  </div>
                  <div className="autopopulate-row">
                    <label className="control-label">
                      Generate with:
                      <select
                        value={autoConnId ?? ''}
                        onChange={(e) => setAutoConnId(e.target.value || null)}
                      >
                        <option value="">Pick a connection…</option>
                        {connections.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label} ({getProvider(c.provider)?.name} · {c.model})
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="btn-secondary"
                      style={{ width: 'auto' }}
                      disabled={!description.trim() || autoBusy !== ''}
                      onClick={runAutoAll}
                    >
                      ✨ {autoBusy === 'all' ? 'Generating…' : 'Auto-populate all'}
                    </button>
                    {autoError && <span className="autopopulate-error">{autoError}</span>}
                  </div>
                  {(
                    [
                      { key: 'identity', label: 'Identity', value: identity, set: setIdentity },
                      { key: 'instructions', label: 'Instructions', value: instructions, set: setInstructions },
                      { key: 'skills', label: 'Skills', value: skills, set: setSkills },
                      { key: 'loopGuidance', label: 'Loops (participation & anti-repeat)', value: loopGuidance, set: setLoopGuidance },
                    ] as const
                  ).map((f) => (
                    <div className="form-group" key={f.key}>
                      <label className="field-label-row">
                        <span>{f.label}</span>
                        <span className="field-actions">
                          <button
                            type="button"
                            className="btn-icon"
                            title="Draft this field from the description"
                            disabled={!description.trim() || autoBusy !== ''}
                            onClick={() => runAutoField(f.key)}
                          >
                            {autoBusy === f.key ? '✨ …' : '✨'}
                          </button>
                          <button
                            type="button"
                            className="btn-icon"
                            title="Elaborate — expand this field’s existing text into a richer version"
                            disabled={!f.value.trim() || autoBusy !== ''}
                            onClick={() => runElaborate(f.key)}
                          >
                            {autoBusy === `${f.key}-elab` ? '📈 …' : '📈'}
                          </button>
                          <button
                            type="button"
                            className="btn-icon"
                            title="View as a conclusive mind map (generated by the Wiki Keeper)"
                            disabled={!f.value.trim() || mindmapBusy}
                            onClick={() => openFieldMindmap(f.label, f.value)}
                          >
                            {mindmapBusy ? '🧠 …' : '🧠'}
                          </button>
                        </span>
                      </label>
                      <textarea
                        {...(f.key === 'instructions' ? devRef('t5') : {})}
                        rows={f.key === 'instructions' ? 5 : 3}
                        value={f.value}
                        onChange={(e) => f.set(e.target.value)}
                      />
                    </div>
                  ))}
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
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="checkbox"
                      {...devRef('ck14')}
                      checked={currentAgent?.pinnedToAllConversations ?? false}
                      onChange={(e) => {
                        if (!currentAgent) return;
                        onSave(currentAgent.id, { pinnedToAllConversations: e.target.checked });
                      }}
                    />
                    📌 Include in every new tab/conversation by default
                  </label>
                </div>
                <div className="form-group">
                  <label
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    title={
                      auth
                        ? undefined
                        : 'Web search requires sign-in, which is not active for this session — the toggle is safe to leave on for when it is.'
                    }
                  >
                    <input
                      type="checkbox"
                      {...devRef('ck15')}
                      checked={currentAgent?.webSearchEnabled ?? false}
                      onChange={(e) => {
                        if (!currentAgent) return;
                        onSave(currentAgent.id, { webSearchEnabled: e.target.checked });
                      }}
                    />
                    🌐 Allow internet access (browse a specific URL){!auth && ' — requires sign-in'}
                  </label>
                  <label className="control-label">
                    <input
                      type="checkbox"
                      checked={currentAgent?.chartEnabled ?? false}
                      onChange={(e) => {
                        if (!currentAgent) return;
                        onSave(currentAgent.id, { chartEnabled: e.target.checked });
                      }}
                    />
                    📊 Chart expert (emit bar/line/multiAxis/heatmap charts as this agent's reply)
                  </label>
                  <div className="web-access-status" {...devRef('s32')}>
                    <span className="web-access-status-title">🔧 Web Access status</span>
                    <span className={`web-access-dot ${webAccessStatus?.searchConfigured ? 'ok' : 'no'}`} title="Tavily search key (web_search discovery tool)">
                      {webAccessStatus?.searchConfigured ? '✅' : '❌'} Search (Tavily)
                    </span>
                    <span className={`web-access-dot ${webAccessStatus?.browseConfigured ? 'ok' : 'no'}`} title="Cloudflare Browser Rendering token + account id (browse_url scrape tool)">
                      {webAccessStatus?.browseConfigured ? '✅' : '❌'} Browse (Cloudflare)
                    </span>
                    <span className={`web-access-dot ${webAccessStatus?.authConfigured ? 'ok' : 'no'}`} title="Supabase auth — required to use either tool; without a signed-in session both degrade to unavailable">
                      {webAccessStatus?.authConfigured ? '✅' : '❌'} Sign-in
                    </span>
                    {webAccessStatus && (!webAccessStatus.searchConfigured || !webAccessStatus.browseConfigured || !webAccessStatus.authConfigured) && (
                      <span className="web-access-status-hint">
                        Missing keys are set as Cloudflare Pages secrets — see the setup notes. Agents with 🌐 on will
                        honestly report &quot;unavailable&quot; for any backend not yet wired up rather than fabricate.
                      </span>
                    )}
                  </div>
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
                        {categoryFilter.trim() &&
                          !allCategoryNames.some((name) => name.toLowerCase() === categoryFilter.trim().toLowerCase()) &&
                          currentAgent && (
                            <button
                              type="button"
                              className="control-btn"
                              {...devRef('b89')}
                              onClick={() => {
                                addAndAssignCategory(currentAgent, categoryFilter);
                                setCategoryFilter('');
                              }}
                            >
                              + Add &quot;{categoryFilter.trim()}&quot; as a new category
                            </button>
                          )}
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
                  <button
                    type="button"
                    className={agentTableView === 'importance' ? 'btn-primary' : 'btn-secondary'}
                    {...devRef('b51')}
                    onClick={() => setAgentTableView('importance')}
                  >
                    ⭐ Importance
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
                          <th title="Enabled/on. Active agents feed the background moderator even if they don't join rounds.">⚡ Active</th>
                          <th title="Joins the visible discussion rounds (participant ⇒ active)">🗣️ Participant</th>
                          <th title="Include this agent in every new tab/conversation by default">📌 Pinned</th>
                          <th title="Give this agent a real browse_url tool (open a specific page, not search)">🌐 Internet</th>
                          <th title="Let this agent emit charts (bar/line/multiAxis/heatmap) as its reply — a Chart expert">📊 Charts</th>
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
                            <td>
                              {agent.name}
                              {hasDuplicate(agent) && (
                                <span className="dup-asterisk" title="This agent has one or more duplicates">*</span>
                              )}
                            </td>
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
                                  {tableCategoryFilter.trim() &&
                                    !allCategoryNames.some(
                                      (n) => n.toLowerCase() === tableCategoryFilter.trim().toLowerCase()
                                    ) && (
                                      <button
                                        type="button"
                                        className="control-btn"
                                        onClick={() => {
                                          addAndAssignCategory(agent, tableCategoryFilter);
                                          setTableCategoryFilter('');
                                        }}
                                      >
                                        + Add &quot;{tableCategoryFilter.trim()}&quot; as a new category
                                      </button>
                                    )}
                                </div>
                              )}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                title="Enabled/on. Turning off also removes from rounds (participant ⇒ active)."
                                checked={agent.active}
                                onChange={(e) =>
                                  onUpdateAgentsBulk(
                                    agents.map((a) =>
                                      a.id === agent.id
                                        ? {
                                            ...a,
                                            active: e.target.checked,
                                            participant: e.target.checked ? a.participant : false,
                                          }
                                        : a
                                    )
                                  )
                                }
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                title="Joins the visible discussion rounds (participant ⇒ active)"
                                checked={agent.participant}
                                onChange={(e) =>
                                  onUpdateAgentsBulk(
                                    agents.map((a) =>
                                      a.id === agent.id
                                        ? {
                                            ...a,
                                            participant: e.target.checked,
                                            active: e.target.checked ? true : a.active,
                                          }
                                        : a
                                    )
                                  )
                                }
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                title="Include this agent in every new tab/conversation by default"
                                checked={agent.pinnedToAllConversations}
                                onChange={(e) =>
                                  onUpdateAgentsBulk(
                                    agents.map((a) =>
                                      a.id === agent.id ? { ...a, pinnedToAllConversations: e.target.checked } : a
                                    )
                                  )
                                }
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                title="Give this agent a real browse_url tool (open a specific page, not search)"
                                checked={agent.webSearchEnabled}
                                onChange={(e) =>
                                  onUpdateAgentsBulk(
                                    agents.map((a) =>
                                      a.id === agent.id ? { ...a, webSearchEnabled: e.target.checked } : a
                                    )
                                  )
                                }
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                title="Let this agent emit charts (bar/line/multiAxis/heatmap) as its reply"
                                checked={agent.chartEnabled}
                                onChange={(e) =>
                                  onUpdateAgentsBulk(
                                    agents.map((a) =>
                                      a.id === agent.id ? { ...a, chartEnabled: e.target.checked } : a
                                    )
                                  )
                                }
                              />
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
                            <td colSpan={5}>
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
                        <th title="Enabled/on. Active agents feed the background moderator even if they don't join rounds.">⚡</th>
                        <th title="Joins the visible discussion rounds (participant ⇒ active)">🗣️</th>
                        <th title="Include this agent in every new tab/conversation by default">📌</th>
                        <th title="Give this agent a real browse_url tool (open a specific page, not search)">🌐</th>
                        <th title="Let this agent emit charts (bar/line/multiAxis/heatmap) as its reply">📊</th>
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
                              {hasDuplicate(agent) && (
                                <span className="dup-asterisk" title="This agent has one or more duplicates">*</span>
                              )}
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
                                  {tableCategoryFilter.trim() &&
                                    !allCategoryNames.some(
                                      (n) => n.toLowerCase() === tableCategoryFilter.trim().toLowerCase()
                                    ) && (
                                      <button
                                        type="button"
                                        className="control-btn"
                                        onClick={() => {
                                          addAndAssignCategory(savedAgent, tableCategoryFilter);
                                          setTableCategoryFilter('');
                                        }}
                                      >
                                        + Add &quot;{tableCategoryFilter.trim()}&quot; as a new category
                                      </button>
                                    )}
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
                            <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                title="Enabled/on. Turning off also removes from rounds (participant ⇒ active)."
                                checked={agent.active}
                                onChange={(e) =>
                                  updateDraftField(agent.id, {
                                    active: e.target.checked,
                                    participant: e.target.checked ? agent.participant : false,
                                  })
                                }
                              />
                            </td>
                            <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                title="Joins the visible discussion rounds (participant ⇒ active)"
                                checked={agent.participant}
                                onChange={(e) =>
                                  updateDraftField(agent.id, {
                                    participant: e.target.checked,
                                    active: e.target.checked ? true : agent.active,
                                  })
                                }
                              />
                            </td>
                            <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                title="Include this agent in every new tab/conversation by default"
                                checked={agent.pinnedToAllConversations}
                                onChange={(e) => updateDraftField(agent.id, { pinnedToAllConversations: e.target.checked })}
                              />
                            </td>
                            <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                title="Give this agent a real browse_url tool (open a specific page, not search)"
                                checked={agent.webSearchEnabled}
                                onChange={(e) => updateDraftField(agent.id, { webSearchEnabled: e.target.checked })}
                              />
                            </td>
                            <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                title="Let this agent emit charts (bar/line/multiAxis/heatmap) as its reply"
                                checked={agent.chartEnabled}
                                onChange={(e) => updateDraftField(agent.id, { chartEnabled: e.target.checked })}
                              />
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
                              <div style={{ display: 'inline-flex', gap: 2 }}>
                                <button
                                  className="btn-icon"
                                  onClick={() => onDuplicateAgent(agent.id)}
                                  title="Duplicate this agent (one click)"
                                >
                                  ⧉
                                </button>
                                <button
                                  className="btn-icon"
                                  onClick={() => downloadAgentProfile(agent)}
                                  title="Download this agent’s profile (.md)"
                                >
                                  ⬇️
                                </button>
                                <button
                                  className="btn-icon delete"
                                  {...devRef('b36', index)}
                                  onClick={() => onDelete(agent.id)}
                                  disabled={agents.length <= 1}
                                  title={agents.length <= 1 ? 'At least one agent is required' : 'Delete agent'}
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                )}

                {agentTableView === 'importance' && (
                  <div className="table-scroll">
                    <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
                      Only active participants in this conversation. Excludes moderators. Drag the sliders to set who you want to hear most.
                    </div>
                    {(() => {
                      const weightedAgents = agents.filter(
                        (a) => a.participant && !/moderator/i.test(a.role) && !/moderator/i.test(a.name)
                      );
                      if (weightedAgents.length === 0) {
                        return <p className="field-hint">No active non-moderator participants. Activate agents in the conversation first.</p>;
                      }
                      const total = weightedAgents.reduce((sum, a) => sum + (a.importance ?? 0), 0);
                      const setImportance = (id: string, val: number) =>
                        onUpdateAgentsBulk(agents.map((a) => (a.id === id ? { ...a, importance: val } : a)));
                      const resetEqual = () =>
                        onUpdateAgentsBulk(agents.map((a) => (weightedAgents.some((wa) => wa.id === a.id) ? { ...a, importance: 0 } : a)));
                      return (
                        <>
                          {weightedAgents.map((agent) => {
                            const pct = agent.importance ?? 0;
                            const display = total > 0 ? Math.round((pct / total) * 100) : Math.round(100 / weightedAgents.length);
                            return (
                              <div key={agent.id} className="importance-row">
                                <span className="participant-dot" style={{ background: agent.color }} />
                                <span className="importance-name">{agent.refNumber} {agent.name}</span>
                                <span className="importance-role">{agent.role}</span>
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  value={pct}
                                  onChange={(e) => setImportance(agent.id, Number(e.target.value))}
                                  className="importance-slider"
                                />
                                <span className="importance-pct">{display}%</span>
                              </div>
                            );
                          })}
                          <button className="btn-secondary" style={{ width: 'auto', marginTop: 8 }} onClick={resetEqual}>
                            ⚖️ Reset to equal
                          </button>
                        </>
                      );
                    })()}
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

              <div className="modal-section" {...devRef('s28')}>
                <div className="modal-section-title">Backup / Transfer Agents</div>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
                  Downloads every agent parameter — name, role, instructions, color, traits, voice,
                  skill categories — for both this conversation&apos;s roster and your saved library, so
                  they can be fully restored if lost.
                </div>
                <button className="btn-secondary" {...devRef('b90')} onClick={exportAgentsBackup}>
                  📥 Download Backup (.json)
                </button>
                <label className="btn-secondary" style={{ display: 'block', textAlign: 'center', cursor: 'pointer' }}>
                  📤 Import Backup
                  <input
                    type="file"
                    accept="application/json"
                    {...devRef('i26')}
                    onChange={importAgentsBackup}
                    style={{ display: 'none' }}
                  />
                </label>
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

          {tab === 'tokens' && (
            <div {...devRef('s30')}>
              <div className="modal-section">
                <div className="modal-section-title">Output token cap (per reply)</div>
                <div className="form-group">
                  <label>
                    Max output tokens per reply{' '}
                    <span className="field-hint">
                      (blank = {DEFAULT_MAX_TOKENS} default)
                    </span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    placeholder={String(DEFAULT_MAX_TOKENS)}
                    value={maxTokens ?? ''}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      onUpdateMaxTokens(v === '' ? null : Math.max(1, Math.floor(Number(v) || DEFAULT_MAX_TOKENS)));
                    }}
                  />
                  <p className="field-hint" style={{ marginTop: 6 }}>
                    Caps how many tokens a single agent reply may use. Reasoning models (GLM-5.2,
                    GLM-4.5/4.6, o-series) need a larger budget to think AND answer; the old default
                    of 500 is why GLM-5.2 came back empty while GLM-4.7-flash worked. Lower this if
                    you hit provider rate limits (429).
                  </p>
                  {maxTokens != null && (
                    <button
                      className="btn-secondary"
                      style={{ width: 'auto', marginTop: 6 }}
                      onClick={() => onUpdateMaxTokens(null)}
                    >
                      Reset to default ({DEFAULT_MAX_TOKENS})
                    </button>
                  )}
                </div>
              </div>

              <div className="modal-section">
                <div className="modal-section-title">Consumption — this conversation</div>
                {(() => {
                  const all = threads.flatMap((t) => t.messages);
                  const totals = sumTokens(all);
                  const rows = groupByAgentAndModel(all, agents);
                  return (
                    <>
                      <div className="token-totals-row">
                        <span><strong>{totals.input.toLocaleString()}</strong> input</span>
                        <span><strong>{totals.output.toLocaleString()}</strong> output</span>
                        <span><strong>{totals.total.toLocaleString()}</strong> total</span>
                      </div>
                      {rows.length === 0 ? (
                        <p className="field-hint">No tracked usage yet — token counts appear once agents reply.</p>
                      ) : (
                        <table className="token-usage-table">
                          <thead>
                            <tr>
                              <th>Agent</th>
                              <th>Provider · Model</th>
                              <th>In</th>
                              <th>Out</th>
                              <th>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r, i) => (
                              <tr key={`${r.agentId}-${r.provider}-${r.model}-${i}`}>
                                <td>{r.agentName}</td>
                                <td className="muted">{r.provider} · {r.model}</td>
                                <td>{r.totals.input.toLocaleString()}</td>
                                <td>{r.totals.output.toLocaleString()}</td>
                                <td>{r.totals.total.toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      <button
                        className="btn-secondary"
                        style={{ width: 'auto', marginTop: 10 }}
                        onClick={onOpenAnalytics}
                      >
                        📊 Open full Analytics (all conversations, by period)
                      </button>
                    </>
                  );
                })()}
              </div>
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
      {mindmapField && (
        <MindmapModal
          markdown={mindmapField.markdown}
          title={mindmapField.title}
          onClose={() => setMindmapField(null)}
        />
      )}
    </div>
  );
}
