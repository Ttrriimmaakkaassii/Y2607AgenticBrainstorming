'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Agent,
  ArchivedConversation,
  ConversationEvent,
  ConversationState,
  Feedback,
  InteractionStyle,
  LLMConnection,
  Message,
  Mood,
  ReactionType,
  ResponseStyle,
  Thread,
} from '@/lib/types';
import { AGENT_LIBRARY, AgentPreset } from '@/lib/agent-library';
import { CustomCategory, loadCustomCategories } from '@/lib/categories';
import { loadCustomAgents, renameCustomAgent, upsertCustomAgent } from '@/lib/custom-agents';
import { generateId } from '@/lib/id';
import { AgentReplyResult, fetchAgentReply, fetchWikiDigest, fetchMindmap, reactionInstruction, DEFAULT_MAX_TOKENS } from '@/lib/llm-client';
import { judgeRepetition } from '@/lib/orchestrator';
import { loadGlobalWikiKeeper, saveGlobalWikiKeeper } from '@/lib/wiki-keeper';
import { gatherAdvisorNote } from '@/lib/background-moderator';
import {
  loadGlobalCommunicationMode,
  saveGlobalCommunicationMode,
  loadGlobalA2ADisplayMode,
  saveGlobalA2ADisplayMode,
  effectiveCommunicationMode,
  effectiveA2ADisplayMode,
} from '@/lib/communication-mode';
import { summarizeForPrompt } from '@/lib/shared-state';
import { evaluateSpeakerPermission, shouldInvokeAgent } from '@/lib/speaker-gating';
import { coerceA2AFromReply } from '@/lib/a2a';
import { pickVoiceForAgent } from '@/lib/voice-picker';
import { useAuthContext } from '@/lib/auth-context';
import { devRef } from '@/lib/devref';
import { useClickOutside } from '@/lib/use-click-outside';
import { AGENT_REACTIONS, UNIVERSAL_REACTIONS } from '@/lib/reactions';
import { SceneView } from './SceneView';
import { GEMINI_TTS_MODELS, pickGoogleVoiceForAgent, synthesizeGoogleAudio } from '@/lib/google-tts';
import { loadTtsApiKey } from '@/lib/tts-connection';
import { loadCustomTtsApiKey, loadCustomTtsBaseUrl, loadCustomTtsVoice, synthesizeCustomTts } from '@/lib/custom-tts';
import {
  loadConnections,
  loadConnectionsFromSupabase,
  saveConnections,
  syncConnectionsToSupabase,
} from '@/lib/llm-connections';
import { getSession, onAuthStateChange } from '@/lib/auth';
import { deleteConversation, loadConversation, saveConversation } from '@/lib/storage';
import { buildArchiveTitle, loadArchives, saveArchives } from '@/lib/archives';
import { ConversationTabMeta, loadTabs, saveTabs } from '@/lib/conversation-tabs';
import { buildMessageMindmapMarkdown } from '@/lib/mindmap';
import { Theme, applyTheme, loadTheme } from '@/lib/theme';
import {
  BUILTIN_MOODS,
  CustomMood,
  addCustomMood,
  deleteCustomMood,
  loadCustomMoods,
  renameCustomMood,
} from '@/lib/moods';
import { Guideline, loadGuidelines } from '@/lib/guidelines';
import { TraitDef, loadTraitDefs } from '@/lib/traits';
import { getCurrentConversationId, setCurrentConversationId } from '@/lib/admin';
import { logFieldChanges } from '@/lib/changelog';
import { SettingsModal } from './SettingsModal';
import { AudioModal } from './AudioModal';
import { AudioRail } from './AudioRail';
import { MessageContent } from './MessageContent';
import { ChartRenderer } from '@/lib/chart-render';
import { ElapsedTimer } from './ElapsedTimer';
import { A2AReadableCard } from './A2AReadableCard';
import { startAgentTiming, completeAgentTiming, failAgentTiming, formatDuration } from '@/lib/agent-timing';
import { AnalyticsModal } from './AnalyticsModal';
import { ExportModal } from './ExportModal';
import { LLMProvidersModal } from './LLMProvidersModal';
import { AgentLibraryModal } from './AgentLibraryModal';
import { MindmapModal } from './MindmapModal';
import { ArchivesModal } from './ArchivesModal';
import { BUILD_VERSION, BUILD_COMMIT, BUILD_COMMIT_COUNT } from '@/lib/build-version';

const CONVERSATION_ID_KEY = 'multi-agent-conversation-id';
const DEFAULT_WHATSAPP_NUMBER = '212661320000';


const DEFAULT_AGENTS: Agent[] = [
  {
    id: generateId(),
    refNumber: 'Agt1',
    name: 'Agent A',
    role: 'Researcher',
    instructions: 'Research recent developments and gather supporting evidence.',
    identity: '',
    skills: '',
    loopGuidance: '',
    description: '',
    color: '#3b99fc',
    llmProvider: 'openai',
    connectionId: null,
    active: true, participant: true,
    pinnedToAllConversations: false,
    webSearchEnabled: false, chartEnabled: false,
    voiceURI: null,
    googleVoiceName: null,
    traits: {},
  },
  {
    id: generateId(),
    refNumber: 'Agt2',
    name: 'Agent B',
    role: 'Analyst',
    instructions: 'Weigh tradeoffs and challenge assumptions with data.',
    identity: '',
    skills: '',
    loopGuidance: '',
    description: '',
    color: '#2ecc71',
    llmProvider: 'anthropic',
    connectionId: null,
    active: true, participant: true,
    pinnedToAllConversations: false,
    webSearchEnabled: false, chartEnabled: false,
    voiceURI: null,
    googleVoiceName: null,
    traits: {},
  },
  {
    id: generateId(),
    refNumber: 'Agt3',
    name: 'Agent C',
    role: 'Moderator',
    instructions: 'Keep the discussion balanced and summarize consensus.',
    identity: '',
    skills: '',
    loopGuidance: '',
    description: '',
    color: '#f39c12',
    llmProvider: 'google',
    connectionId: null,
    active: true, participant: true,
    pinnedToAllConversations: false,
    webSearchEnabled: false, chartEnabled: false,
    voiceURI: null,
    googleVoiceName: null,
    traits: {},
  },
];

function defaultState(): ConversationState {
  return {
    id: generateId(),
    agents: DEFAULT_AGENTS,
    threads: [],
    settings: {
      topic: '',
      maxSentences: 5,
      bulletCount: 5,
      maxExchanges: 10,
      maxTokens: null,
      orchestratorEnabled: true,
      repetitionGuardEnabled: true,
      moods: ['debate'],
      responseStyle: 'sentences',
      interactionStyle: 'dialogue',
      ttsRate: 1,
      ttsLang: 'en-US',
      ttsProvider: 'browser',
      googleTtsModel: GEMINI_TTS_MODELS[0].id,
      whatsappNumber: '',
      wikiEnabled: true,
      wikiKeeperConnectionId: null,
      wikiRefreshInterval: 10,
      wikiDigest: '',
      wikiUpdatedAt: 0,
      wikiMessageCountAtLastUpdate: 0,
      wikiHistory: [],
      pauseOnTabSwitch: true,
      textSize: 'sm',
    },
    status: 'idle',
    updatedAt: Date.now(),
    nextAgentNumber: 4,
  };
}

/** Backfills fields for conversations saved before newer features existed. */
function migrateState(state: ConversationState): ConversationState {
  let maxSeen = 0;
  const agents = state.agents.map((agent) => {
    const active = agent.active ?? true;
    // participant joins the visible rounds; preserve the old `active` meaning
    // (which was "participates in rounds") on migration, then the user can
    // demote some active agents to background advisors.
    const participant = agent.participant ?? active;
    let refNumber = agent.refNumber;
    if (!refNumber) {
      refNumber = `Agt${maxSeen + 1}`;
    }
    const match = /Agt(\d+)/.exec(refNumber);
    if (match) maxSeen = Math.max(maxSeen, Number(match[1]));
    return {
      ...agent,
      refNumber,
      active,
      participant,
      pinnedToAllConversations: agent.pinnedToAllConversations ?? false,
      webSearchEnabled: agent.webSearchEnabled ?? false,
      chartEnabled: agent.chartEnabled ?? false,
      identity: agent.identity ?? '',
      skills: agent.skills ?? '',
      loopGuidance: agent.loopGuidance ?? '',
      description: agent.description ?? '',
      voiceURI: agent.voiceURI ?? null,
      googleVoiceName: agent.googleVoiceName ?? null,
      traits: agent.traits ?? {},
    };
  });
  const threads = state.threads.map((t) => ({
    ...t,
    messages: t.messages.map((m) => ({
      ...m,
      replyToId: m.replyToId ?? null,
      starred: m.starred ?? false,
      category: m.category ?? null,
    })),
  }));
  return {
    ...state,
    agents,
    threads,
    settings: {
      ...state.settings,
      moods:
        state.settings.moods ??
        ((state.settings as any).mood ? [(state.settings as any).mood as string] : ['debate']),
      responseStyle: state.settings.responseStyle ?? 'sentences',
      bulletCount: state.settings.bulletCount ?? 5,
      interactionStyle: state.settings.interactionStyle ?? 'dialogue',
      ttsRate: state.settings.ttsRate ?? 1,
      ttsLang: state.settings.ttsLang ?? 'en-US',
      ttsProvider: state.settings.ttsProvider ?? 'browser',
      googleTtsModel: state.settings.googleTtsModel ?? GEMINI_TTS_MODELS[0].id,
      whatsappNumber: state.settings.whatsappNumber ?? '',
      wikiEnabled: state.settings.wikiEnabled ?? true,
      wikiKeeperConnectionId: state.settings.wikiKeeperConnectionId ?? null,
      wikiRefreshInterval: state.settings.wikiRefreshInterval ?? 10,
      wikiDigest: state.settings.wikiDigest ?? '',
      wikiUpdatedAt: state.settings.wikiUpdatedAt ?? 0,
      wikiMessageCountAtLastUpdate: state.settings.wikiMessageCountAtLastUpdate ?? 0,
      wikiHistory: state.settings.wikiHistory ?? [],
      pauseOnTabSwitch: state.settings.pauseOnTabSwitch ?? true,
      textSize: state.settings.textSize ?? 'sm',
      repetitionGuardEnabled: state.settings.repetitionGuardEnabled ?? true,
    },
    nextAgentNumber: Math.max(maxSeen + 1, state.nextAgentNumber ?? 0),
  };
}

/** Short label for a conversation tab — the topic if one's been set, otherwise a generic placeholder. */
function deriveTabTitle(state: ConversationState): string {
  const topic = state.settings.topic.trim();
  if (!topic) return 'New Conversation';
  return topic.length > 30 ? `${topic.slice(0, 30)}…` : topic;
}

function getOrCreateConversationId(): string {
  if (typeof window === 'undefined') return generateId();
  const existing = window.localStorage.getItem(CONVERSATION_ID_KEY);
  if (existing) return existing;
  const id = generateId();
  window.localStorage.setItem(CONVERSATION_ID_KEY, id);
  return id;
}

/**
 * Text field for a "number or ∞" setting. A plain controlled input tied
 * directly to `value ?? '∞'` snaps back to '∞' on every keystroke once the
 * field is cleared, making it impossible to type a new number. This keeps
 * a local text buffer and only commits (parses + calls onCommit) on
 * blur/Enter, syncing back from the external value only while not focused.
 */
function useInfinityField(value: number | null, onCommit: (v: number | null) => void) {
  const [text, setText] = useState(value == null ? '∞' : String(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setText(value == null ? '∞' : String(value));
    }
  }, [value]);

  function commit() {
    const trimmed = text.trim();
    if (trimmed === '' || trimmed === '∞') {
      onCommit(null);
      setText('∞');
      return;
    }
    const n = Number(trimmed);
    if (Number.isFinite(n) && n >= 0) {
      const rounded = Math.floor(n);
      onCommit(rounded);
      setText(String(rounded));
    } else {
      setText(value == null ? '∞' : String(value));
    }
  }

  return {
    value: text,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value),
    onFocus: () => {
      focusedRef.current = true;
    },
    onBlur: () => {
      focusedRef.current = false;
      commit();
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        commit();
        (e.target as HTMLInputElement).blur();
      }
    },
  };
}

export function ChatApp() {
  const [expandedSearchMessageId, setExpandedSearchMessageId] = useState<string | null>(null);
  // Null when this deployment has no Supabase auth configured — agents with
  // webSearchEnabled degrade to TOOL_UNAVAILABLE in that case (see
  // functions/api/research/browse.ts's auth check) rather than erroring.
  const auth = useAuthContext();
  const [state, setState] = useState<ConversationState>(defaultState);
  const [currentAgentId, setCurrentAgentId] = useState<string>(DEFAULT_AGENTS[0].id);
  const [inputMessage, setInputMessage] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const dictationFinalTextRef = useRef('');
  const lastContextMenuRef = useRef<{ time: number } | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStarredOnly, setFilterStarredOnly] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');
  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [activeModal, setActiveModal] = useState<
    'settings' | 'analytics' | 'export' | 'library' | 'mindmap' | null
  >(null);
  // Deep-link target for Settings: when a notification's "take me there"
  // action opens Settings, it sets this so SettingsModal lands on the right
  // tab (e.g. 'wiki'). Cleared on close.
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    'agent' | 'llm' | 'audio' | 'display' | 'wiki' | 'archives' | 'log' | 'account' | null
  >(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const [commMenuOpen, setCommMenuOpen] = useState(false);
  const commMenuRef = useClickOutside<HTMLDivElement>(() => setCommMenuOpen(false), commMenuOpen);
  // When opening the Library from inside Settings, remember to return there
  // on close instead of dropping the user out with no modal open at all.
  const [modalReturnTo, setModalReturnTo] = useState<typeof activeModal>(null);
  const [participantsMenuOpen, setParticipantsMenuOpen] = useState(false);
  const [participantFilter, setParticipantFilter] = useState('');
  const [participantCategoryFilters, setParticipantCategoryFilters] = useState<Set<string>>(new Set());
  const [showInactiveParticipants, setShowInactiveParticipants] = useState(false);
  /** Collapses the participant chip row to active-only (one compact line) by default; a button reveals the inactive ones too. */
  const [chipBarShowAll, setChipBarShowAll] = useState(false);
  const [searchBarOpen, setSearchBarOpen] = useState(false);
  const [participantsCustomAgents, setParticipantsCustomAgents] = useState<AgentPreset[]>([]);
  const [participantsCustomCategories, setParticipantsCustomCategories] = useState<CustomCategory[]>([]);
  const [manageBulkConnectionId, setManageBulkConnectionId] = useState('');
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);

  useEffect(() => {
    setParticipantsCustomAgents(loadCustomAgents());
    setParticipantsCustomCategories(loadCustomCategories());
  }, []);

  function categoriesForParticipant(name: string): string[] {
    return participantsCustomAgents.find((p) => p.name === name)?.categories ?? [];
  }
  const chipClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [topPanelOpen, setTopPanelOpen] = useState(true);
  const [freezeScroll, setFreezeScroll] = useState(false);
  const autoCollapsedRef = useRef(false);
  useEffect(() => {
    // Collapse the search/participants/controls panel upward the first time
    // the conversation actually has messages, to get it out of the way —
    // but only once, so it doesn't fight a user who reopens it manually.
    if (state.threads.length > 0 && !autoCollapsedRef.current) {
      autoCollapsedRef.current = true;
      setTopPanelOpen(false);
    }
  }, [state.threads.length]);

  function openLibraryFromSettings() {
    setModalReturnTo('settings');
    setActiveModal('library');
  }

  function closeSubModal() {
    setActiveModal(modalReturnTo);
    setModalReturnTo(null);
  }
  const [mindmapData, setMindmapData] = useState<{ markdown: string; title: string } | null>(null);

  function openMindmapFromSettings(markdown: string, title: string) {
    setModalReturnTo('settings');
    setMindmapData({ markdown, title });
    setActiveModal('mindmap');
  }
  const [hydrated, setHydrated] = useState(false);
  const [liveMode, setLiveMode] = useState<boolean | null>(null);
  const [connections, setConnections] = useState<LLMConnection[]>([]);
  const [archives, setArchives] = useState<ArchivedConversation[]>([]);
  const [tabs, setTabs] = useState<ConversationTabMeta[]>([]);
  const [closingTabId, setClosingTabId] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState<{
    messageId: string;
    charIndex: number;
    charLength: number;
  } | null>(null);
  // Gemini TTS now synthesizes a whole message before any audio can start,
  // which can take a couple of seconds for longer messages — this tracks
  // which message is mid-generation so the UI can show it's working rather
  // than looking stuck/broken.
  const [ttsLoadingMessageId, setTtsLoadingMessageId] = useState<string | null>(null);
  const speakingCancelledRef = useRef(false);
  const googleAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAbortControllerRef = useRef<AbortController | null>(null);
  const statusRef = useRef(state.status);
  useEffect(() => {
    statusRef.current = state.status;
  }, [state.status]);
  const settingsRef = useRef(state.settings);
  useEffect(() => {
    settingsRef.current = state.settings;
  }, [state.settings]);
  // runAgentRound is a long-running async loop that only reads its
  // `respondingAgents` snapshot once, at round start — without this, an
  // agent deactivated (or disconnected) mid-round would still get called on
  // its next turn, since the loop never re-checked. Read live per-turn
  // instead, matching the settingsRef/statusRef pattern above.
  const agentsRef = useRef(state.agents);
  useEffect(() => {
    agentsRef.current = state.agents;
  }, [state.agents]);
  const [showAudioRail, setShowAudioRail] = useState(false);
  const [sceneViewOpen, setSceneViewOpen] = useState(false);
  // How long the conversation engine pauses after an agent finishes replying
  // before the next agent's turn starts — gives Scene View's camera/reader
  // time to settle on the finished message. Read via a ref inside
  // runAgentRound (a long-running async loop) so changes apply mid-round,
  // matching the settingsRef/statusRef pattern above.
  const [postSpeechDelayMs, setPostSpeechDelayMs] = useState(2500);
  const postSpeechDelayRef = useRef(postSpeechDelayMs);
  useEffect(() => {
    postSpeechDelayRef.current = postSpeechDelayMs;
  }, [postSpeechDelayMs]);
  const [topicExpanded, setTopicExpanded] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');
  const [customMoods, setCustomMoods] = useState<CustomMood[]>([]);
  const [moodsMenuOpen, setMoodsMenuOpen] = useState(false);
  const [moodFilter, setMoodFilter] = useState('');
  const moodsMenuRef = useClickOutside<HTMLDivElement>(() => setMoodsMenuOpen(false), moodsMenuOpen);
  const participantsMenuRef = useClickOutside<HTMLDivElement>(
    () => setParticipantsMenuOpen(false),
    participantsMenuOpen
  );
  const notificationsMenuRef = useClickOutside<HTMLDivElement>(
    () => setNotificationsOpen(false),
    notificationsOpen
  );
  const [guidelines, setGuidelines] = useState<Guideline[]>([]);
  const [traitDefs, setTraitDefs] = useState<TraitDef[]>([]);

  useEffect(() => {
    setCustomMoods(loadCustomMoods());
    setGuidelines(loadGuidelines());
    setTraitDefs(loadTraitDefs());
  }, []);

  // Guidelines/traitDefs live outside ConversationState, but getReply() is
  // called repeatedly inside a long-running async auto-loop — read from
  // refs (not the closured state) so edits made mid-conversation apply
  // immediately, matching the settingsRef/statusRef pattern above.
  const guidelinesRef = useRef(guidelines);
  useEffect(() => {
    guidelinesRef.current = guidelines;
  }, [guidelines]);
  const traitDefsRef = useRef(traitDefs);
  useEffect(() => {
    traitDefsRef.current = traitDefs;
  }, [traitDefs]);
  const [devMode, setDevMode] = useState(false);
  /**
   * agentId -> { threadId, conversationId } for every agent currently
   * awaiting an LLM reply. Tracks EVERY open tab at once (not just the
   * active one) — a round started before a tab switch keeps running in the
   * background — so `conversationId` is what a given entry belongs to.
   * `visibleThinking` below is the current tab's own slice, and is what
   * actually gets rendered/passed down; reading `thinking` directly for UI
   * would show an agent as "speaking" in a tab it has nothing to do with,
   * the instant it happened to be mid-round in a DIFFERENT tab.
   */
  const [thinking, setThinking] = useState<
    Map<string, { threadId: string; conversationId: string; startedMs: number }>
  >(new Map());
  const visibleThinking = useMemo(
    () =>
      new Map(
        Array.from(thinking.entries())
          .filter(([, v]) => v.conversationId === state.id)
          .map(([agentId, v]) => [agentId, { threadId: v.threadId, startedMs: v.startedMs }])
      ),
    [thinking, state.id]
  );

  function startThinking(agentId: string, threadId: string, conversationId: string) {
    setThinking((prev) => new Map(prev).set(agentId, { threadId, conversationId, startedMs: Date.now() }));
  }

  function stopThinking(agentId: string) {
    setThinking((prev) => {
      if (!prev.has(agentId)) return prev;
      const next = new Map(prev);
      next.delete(agentId);
      return next;
    });
  }

  useEffect(() => {
    const t = loadTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  function changeTheme(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }

  const THEME_ORDER: Theme[] = ['light', 'dark', 'ascii'];
  const THEME_ICONS: Record<Theme, string> = { light: '☀️', dark: '🌙', ascii: '🟢' };
  function cycleTheme() {
    const idx = THEME_ORDER.indexOf(theme);
    changeTheme(THEME_ORDER[(idx + 1) % THEME_ORDER.length]);
  }

  useEffect(() => {
    document.body.classList.toggle('dev-mode', devMode);
  }, [devMode]);

  /** In Dev Mode, every tagged element shows this code as a small badge (CSS ::after). */
  const conversationAreaRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = messageInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [inputMessage]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [authResolved, setAuthResolved] = useState(false);

  useEffect(() => {
    setConnections(loadConnections());
    setArchives(loadArchives());

    getSession().then((session) => {
      setUserId(session?.user.id ?? null);
      setAuthResolved(true);
    });
    return onAuthStateChange((session) => setUserId(session?.user.id ?? null));
  }, []);

  useEffect(() => {
    if (!userId) return;
    loadConnectionsFromSupabase(userId).then((remote) => {
      if (remote) {
        setConnections(remote);
        saveConnections(remote);
      }
    });
  }, [userId]);

  function updateConnections(next: LLMConnection[]) {
    setConnections(next);
    saveConnections(next);
    if (userId) syncConnectionsToSupabase(next, userId);
  }

  useEffect(() => {
    if (!authResolved) return;
    let cancelled = false;

    (async () => {
      // When signed in, the "current conversation" is tracked per-account
      // (not per-browser), so opening the app on a different device/browser
      // resumes the same conversation instead of starting a new blank one.
      let conversationId: string;
      if (userId) {
        const remoteId = await getCurrentConversationId(userId);
        if (remoteId) {
          conversationId = remoteId;
        } else {
          conversationId = getOrCreateConversationId();
          await setCurrentConversationId(userId, conversationId);
        }
      } else {
        conversationId = getOrCreateConversationId();
      }
      if (cancelled) return;

      const loaded = await loadConversation(conversationId);
      if (cancelled) return;
      let loadedState: ConversationState;
      if (loaded) {
        loadedState = migrateState(loaded);
        setState(loadedState);
        setCurrentAgentId(loaded.agents[0]?.id ?? DEFAULT_AGENTS[0].id);
      } else {
        loadedState = { ...defaultState(), id: conversationId };
        setState((prev) => ({ ...prev, id: conversationId }));
      }

      // First run after upgrading to tabs: seed a single tab for whatever
      // conversation was already active, so existing users see exactly one
      // tab (matching what was on screen before) rather than none.
      const existingTabs = loadTabs();
      if (existingTabs.length > 0) {
        setTabs(existingTabs);
      } else {
        const seeded: ConversationTabMeta[] = [
          { id: conversationId, title: deriveTabTitle(loadedState), category: null },
        ];
        setTabs(seeded);
        saveTabs(seeded);
      }

      setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [authResolved, userId]);

  useEffect(() => {
    if (!hydrated) return;
    saveConversation(state);
  }, [state, hydrated]);

  useEffect(() => {
    if (freezeScroll) return;
    conversationAreaRef.current?.scrollTo({
      top: conversationAreaRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [state.threads, freezeScroll]);

  // Reading mode should always keep the message currently being spoken in
  // view and visually prominent, regardless of the freeze-scroll toggle —
  // that toggle is about not being yanked around by new incoming messages,
  // not about the explicit read-aloud the user started.
  useEffect(() => {
    if (!speaking) return;
    const el = conversationAreaRef.current?.querySelector(
      `[data-message-id="${speaking.messageId}"]`
    );
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [speaking?.messageId]);

  function showToast(message: string) {
    setToast(message);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2500);
  }

  const allMessages = useMemo(() => state.threads.flatMap((t) => t.messages), [state.threads]);

  const messageCategories = useMemo(
    () => Array.from(new Set(allMessages.map((m) => m.category).filter(Boolean))) as string[],
    [allMessages]
  );

  const visibleThreads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const hasFilter = q || filterStarredOnly || filterCategory;
    if (!hasFilter) return state.threads;
    return state.threads
      .map((t) => ({
        ...t,
        messages: t.messages.filter((m) => {
          if (filterStarredOnly && !m.starred) return false;
          if (filterCategory && m.category !== filterCategory) return false;
          if (q && !(m.content.toLowerCase().includes(q) || m.category?.toLowerCase().includes(q))) {
            return false;
          }
          return true;
        }),
      }))
      .filter((t) => t.messages.length > 0);
  }, [state.threads, searchQuery, filterStarredOnly, filterCategory]);

  // A brand-new tab starts with nobody active (see
  // freshConversationWithCurrentAgents) — the Participants bar shows a
  // category picker in that state instead of an empty/degenerate chip row.
  const noActiveParticipants = state.agents.length > 0 && state.agents.every((a) => !a.participant);

  function agentIsConnected(agent: Agent): boolean {
    return !!agent.connectionId && connections.some((c) => c.id === agent.connectionId);
  }

  // Real, code-level enforcement rather than just trusting the system
  // prompt's NO_FABRICATION_INSTRUCTION — a model can still ignore an
  // instruction (this is exactly what happened with the reported OpenClaw
  // fetch fabrication). Checks the ACTUAL recorded tool-call evidence
  // (reply.webBrowses, populated only by a real successful browse_url
  // round-trip — see lib/llm-client.ts's tool-calling loop) against what
  // the reply text claims, and rejects the reply outright (never posted)
  // instead of merely flagging it after the fact.
  const TOOL_USE_CLAIM_PATTERN =
    /\b(i searched|i found (?:this|that|the following)|according to (?:my|the) search|search results? (?:show|indicate|reveal)|i looked (?:this|that|it) up|based on (?:my|a) (?:web )?search|i (?:just )?checked (?:the|their) (?:website|site|repo|repository|documentation)|i browsed|i opened (?:the|their) (?:page|site|website)|fetching|i retrieved|retrieved from)\b/i;
  const URL_CITATION_PATTERN = /https?:\/\/[^\s)]+/;

  function validateAgentReply(agent: Agent, reply: AgentReplyResult): string | null {
    const claimsToolUse = TOOL_USE_CLAIM_PATTERN.test(reply.content) || URL_CITATION_PATTERN.test(reply.content);
    const browsedAtAll = (reply.webBrowses?.length ?? 0) > 0;

    if (claimsToolUse && !browsedAtAll) {
      // Claims to have searched/browsed/fetched/retrieved/cited a URL, but
      // no browse_url tool call was actually recorded this turn at all.
      return 'FABRICATED_TOOL_USE';
    }
    return null;
  }

  function agentExchangeCount(thread: Thread): number {
    return thread.messages.filter((m) => m.agentId !== 'user').length;
  }

  function withinLimits(thread: Thread): boolean {
    // Reads from the live ref (not the closured `state`) so extending the
    // exchange limit mid-conversation takes effect immediately, even while
    // an auto-loop is already running.
    const maxExchanges = settingsRef.current.maxExchanges;
    if (maxExchanges == null) return true;
    return agentExchangeCount(thread) < maxExchanges;
  }

  function appendMessage(threadId: string, message: Message) {
    setState((prev) => ({
      ...prev,
      threads: prev.threads.map((t) =>
        t.id === threadId ? { ...t, messages: [...t.messages, message] } : t
      ),
      updatedAt: Date.now(),
    }));
  }

  /** Append an INTERNAL event (tool exec / skip / state transition / status) —
   * kept separate from Message so scheduling decisions and tool calls NEVER
   * appear as assistant messages. Bounded ring buffer (newest last). */
  function recordEvent(event: ConversationEvent) {
    setState((prev) => ({ ...prev, events: [...(prev.events ?? []), event].slice(-200), updatedAt: Date.now() }));
    // Also log structured (no secrets) for observability.
    console.log(JSON.stringify({ type: 'conversation_event', conversationId: state.id, ...event }));
  }

  /** Resolve @Agt<N> mentions in the last user message to agent ids — the
   * deterministic "directly addressed" set for speaker gating. */
  function directMentionsFromThread(messages: Message[]): string[] {
    const lastUser = [...messages].reverse().find((m) => m.agentId === 'user');
    if (!lastUser) return [];
    const refs = [...lastUser.content.matchAll(/@(Agt\d+)/gi)].map((m) => m[1]);
    if (refs.length === 0) return [];
    return state.agents.filter((a) => refs.includes(a.refNumber)).map((a) => a.id);
  }

  function createThread(agentId: string, seedReply?: AgentReplyResult): Thread {
    const thread: Thread = {
      id: generateId(),
      agentId,
      createdAt: Date.now(),
      messages: [],
    };
    if (seedReply) {
      thread.messages.push({
        id: generateId(),
        threadId: thread.id,
        agentId,
        content: seedReply.content,
        timestamp: Date.now(),
        feedback: null,
        replyToId: null,
        starred: false,
        category: null,
        inputTokens: seedReply.usage.inputTokens,
        outputTokens: seedReply.usage.outputTokens,
        provider: seedReply.provider,
        model: seedReply.model,
        webSearches: seedReply.webSearches,
        webBrowses: seedReply.webBrowses,
        webAccessFailed: seedReply.webAccessFailed,
        executionId: seedReply.timing?.executionId,
        timing: seedReply.timing,
      });
    }
    return thread;
  }

  /** Never falls back to a simulated/mock message — returns null if the agent has no working LLM. */
  async function getReply(
    agent: Agent,
    precedingMessages: Message[],
    extraInstruction?: string,
    advisorNote?: string
  ): Promise<AgentReplyResult | null> {
    if (!agentIsConnected(agent)) return null;
    // Reads live settings via the ref (not the closured `state`) so changes
    // like mood/topic made mid-conversation apply immediately, even while
    // a long auto-loop round is already in flight.
    const live = settingsRef.current;
    const enabledGuidelines = guidelinesRef.current.filter((g) => g.enabled).map((g) => g.text);
    const resolvedTraits = traitDefsRef.current.map((def) => ({
      name: def.name,
      value: agent.traits?.[def.id] ?? 50,
    }));
    // Error sink captures the real provider error (status + body slice) when
    // the call fails, so runAgentRound can show WHY instead of a generic
    // "failed to respond". Reset per call.
    const errorSink: { message?: string } = {};
    lastReplyErrorRef.current = null;
    // Per-execution timing — application-authoritative, captured at the fetch
    // boundary (no server; non-streaming so firstTokenAt = completedAt).
    const timing = startAgentTiming();
    // In A2A mode, fold the compact shared-state summary into the instruction
    // (the "smaller relevant state package" — agents reference claims by id).
    const sharedSummary = summarizeForPrompt(live.sharedState);
    const a2a = effectiveCommunicationMode(live.communicationMode) === 'a2a';
    const mergedExtraInstruction =
      a2a && sharedSummary
        ? [extraInstruction, `Shared conversation state (reference claims by id):\n${sharedSummary}`].filter(Boolean).join('\n\n')
        : extraInstruction;
    const reply = await fetchAgentReply(
      agent,
      connections,
      live.moods,
      live.topic,
      precedingMessages,
      state.agents,
      live.responseStyle,
      live.maxSentences,
      live.bulletCount,
      live.interactionStyle,
      enabledGuidelines,
      resolvedTraits,
      mergedExtraInstruction,
      live.wikiEnabled ? live.wikiDigest : undefined,
      auth?.session.access_token ?? null,
      live.maxTokens ?? DEFAULT_MAX_TOKENS,
      errorSink,
      advisorNote
    );
    if (reply) {
      reply.timing = completeAgentTiming(timing);
    } else {
      failAgentTiming(timing);
    }
    // Structured observability log — never the prompt, body, or key.
    console.log(
      JSON.stringify({
        type: 'agent_execution',
        conversationId: state.id,
        executionId: timing.executionId,
        agentId: agent.id,
        communicationMode: effectiveCommunicationMode(live.communicationMode),
        phase: live.sharedState?.activePhase,
        startedAt: timing.startedAt,
        completedAt: reply?.timing?.completedAt,
        failedAt: reply ? undefined : timing.failedAt,
        durationMs: reply?.timing?.totalDurationMs ?? timing.totalDurationMs,
        provider: reply?.provider,
        model: reply?.model,
        inputTokens: reply?.usage.inputTokens,
        outputTokens: reply?.usage.outputTokens,
        error: reply ? undefined : (errorSink.message ?? 'no reply'),
      })
    );
    if (!reply && errorSink.message) lastReplyErrorRef.current = errorSink.message;
    if (reply) {
      setLiveMode(true);
    } else {
      setLiveMode((prev) => (prev === true ? prev : false));
    }
    return reply;
  }

  const wikiRefreshInFlightRef = useRef(false);
  // Last provider error captured by getReply's error sink (status + body
  // slice). Read by runAgentRound to show WHY a reply failed instead of the
  // old opaque "failed to respond".
  const lastReplyErrorRef = useRef<string | null>(null);

  /**
   * Regenerates the shared cross-thread wiki digest from just the newest
   * messages (not the whole ledger — the digest already carries prior
   * knowledge forward incrementally each refresh). Fire-and-forget: never
   * awaited from runAgentRound's loop, so it can't block turn-taking. On
   * failure/no connection, silently keeps the existing digest rather than
   * clobbering good data with null.
   */
  async function refreshWikiDigest() {
    const live = settingsRef.current;
    // Resolve the keeper: the conversation's own choice, else the GLOBAL
    // default (persisted across refreshes) so the user sets it once.
    const keeperId = live.wikiKeeperConnectionId ?? loadGlobalWikiKeeper();
    const connection = connections.find((c) => c.id === keeperId);
    if (!connection || wikiRefreshInFlightRef.current) return;
    wikiRefreshInFlightRef.current = true;
    try {
      const allMessagesSorted = state.threads
        .flatMap((t) => t.messages)
        .sort((a, b) => a.timestamp - b.timestamp);
      const snapshotCount = allMessagesSorted.length;
      const newMessages = allMessagesSorted.slice(-Math.max(live.wikiRefreshInterval, 40));
      const transcript = newMessages
        .map((m) => {
          const author = m.agentId === 'user' ? 'User' : agentById(m.agentId)?.name ?? 'Agent';
          return `[Thread ${m.threadId.slice(0, 6)}] ${author}: ${m.content}`;
        })
        .join('\n');
      const digest = await fetchWikiDigest(connection, live.wikiDigest, transcript);
      if (!digest) return;
      const updatedAt = Date.now();
      // Newest first, capped — enough to browse how the wiki evolved without
      // the settings blob growing unbounded over a long conversation.
      const history = [
        { digest, updatedAt, messageCount: snapshotCount },
        ...live.wikiHistory,
      ].slice(0, 20);
      updateSettings({
        wikiDigest: digest,
        wikiUpdatedAt: updatedAt,
        wikiMessageCountAtLastUpdate: snapshotCount,
        wikiHistory: history,
      });
    } finally {
      wikiRefreshInFlightRef.current = false;
    }
  }

  const totalMessageCount = useMemo(
    () => state.threads.reduce((n, t) => n + t.messages.length, 0),
    [state.threads]
  );

  const wikiNoKeeperNotifiedRef = useRef(false);

  useEffect(() => {
    const live = settingsRef.current;
    if (!live.wikiEnabled) return;
    if (totalMessageCount - live.wikiMessageCountAtLastUpdate < live.wikiRefreshInterval) return;
    // Keeper = conversation choice OR the persisted global default, so a user
    // who already picked one doesn't get asked again on every refresh.
    const keeperId = live.wikiKeeperConnectionId ?? loadGlobalWikiKeeper();
    if (!keeperId) {
      if (!wikiNoKeeperNotifiedRef.current) {
        wikiNoKeeperNotifiedRef.current = true;
        showToast('📚 The shared wiki is on but has no Wiki Keeper — pick a connection in Settings → Wiki.');
      }
      return;
    }
    refreshWikiDigest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalMessageCount]);

  /**
   * Runs one round-robin pass over `respondingAgents`. When a finite
   * maxExchanges is set, keeps cycling through them (agent1, agent2,
   * agent1, agent2, ...) until that many agent messages exist in the
   * thread, rather than stopping after a single pass — so "20 exchanges,
   * 2 agents" actually plays out as ~10 messages each, autonomously.
   */
  async function runAgentRound(thread: Thread, respondingAgents: Agent[]) {
    // Captured once, at the moment this round is kicked off — if the user
    // switches tabs while it's still running (only possible with
    // pauseOnTabSwitch off, or the brief race before a pause takes effect),
    // this round still belongs to the conversation it started in, not
    // whichever tab happens to be active when a reply lands.
    const conversationId = state.id;
    const connected = respondingAgents.filter(agentIsConnected);
    const skipped = respondingAgents.filter((a) => !agentIsConnected(a));
    if (skipped.length > 0) {
      showToast(`Skipped ${skipped.map((a) => a.refNumber).join(', ')} — no LLM connected.`);
    }
    if (connected.length === 0) return;

    const hasLimit = () => settingsRef.current.maxExchanges != null;
    const isRunnable = () => {
      const s: string = statusRef.current;
      // 'awaiting_user' suspends the scheduler until a new user message arrives
      // — a Moderator timeout or phase drift can't continue autonomously.
      return s !== 'paused' && s !== 'stopped' && s !== 'awaiting_user';
    };
    let updatedThread = thread;
    let turn = 0;
    let consecutiveFailures = 0;

    // Background moderator: poll active-but-not-participant advisors once for
    // this round and synthesize their input into a note injected into every
    // participant's prompt. Synthesizer = the global Wiki Keeper connection
    // (the app's designated "background" LLM); bounded + failure-tolerant
    // inside gatherAdvisorNote so this can never kill the round.
    let advisorNote: string | undefined;
    const advisors = state.agents.filter((a) => a.active && !a.participant);
    if (advisors.length > 0) {
      const synthId = loadGlobalWikiKeeper();
      const synthesizer = synthId ? connections.find((c) => c.id === synthId) ?? null : null;
      try {
        advisorNote = (await gatherAdvisorNote(advisors, connections, updatedThread.messages, state.agents, synthesizer)) ?? undefined;
      } catch {
        advisorNote = undefined;
      }
    }

    do {
      if (!withinLimits(updatedThread)) break;
      if (!isRunnable()) break;

      const agent = connected[turn % connected.length];
      turn += 1;

      // Re-check against LIVE state, not the `connected` snapshot taken at
      // round start — the user may have deactivated or disconnected this
      // agent since the round began. Skip its turn rather than calling an
      // LLM it's no longer authorized to speak for.
      const liveAgent = agentsRef.current.find((a) => a.id === agent.id);
      if (!liveAgent || !liveAgent.participant || !agentIsConnected(liveAgent)) {
        continue;
      }

      const liveSettings = settingsRef.current;
      // Speaker gating — the SCHEDULER decides whether to call this agent
      // (never the agent via NO_RESPONSE). A blocked agent → no provider
      // request, no timer, no message, no tokens. Only the assigned/addressee
      // agent runs when an assignment exists; otherwise normal round-robin.
      const gate = shouldInvokeAgent(liveAgent, {
        status: statusRef.current,
        allowedAgentIds: connected.map((a) => a.id),
        assignedAgentId: liveSettings.sharedState?.assignedSpeaker,
        directMentions: directMentionsFromThread(updatedThread.messages),
        phase: liveSettings.sharedState?.activePhase,
        sharedState: liveSettings.sharedState,
      });
      if (!gate.invoke) {
        recordEvent({ kind: 'agent_skipped', at: new Date().toISOString(), agentId: agent.id, reason: gate.reason ?? 'blocked' });
        continue;
      }

      startThinking(agent.id, updatedThread.id, conversationId);
      const reply = await getReply(agent, updatedThread.messages, undefined, advisorNote);
      stopThinking(agent.id);
      if (!reply) {
        showToast(`⚠️ ${agent.refNumber} failed to respond${lastReplyErrorRef.current ? `: ${lastReplyErrorRef.current}` : ''} — check its LLM connection.`);
        consecutiveFailures += 1;
        // Only abort the whole round once every agent in rotation has failed
        // back-to-back — one agent's bad key/CORS issue shouldn't silence
        // the others.
        if (consecutiveFailures >= connected.length) break;
        continue;
      }
      const rejectionReason = validateAgentReply(agent, reply);
      if (rejectionReason) {
        showToast(`⚠️ ${agent.refNumber}'s reply was rejected: ${rejectionReason}`);
        consecutiveFailures += 1;
        if (consecutiveFailures >= connected.length) break;
        continue;
      }
      consecutiveFailures = 0;

      // Orchestrator repetition judge (#4). When repetitionGuardEnabled is on
      // and the speaking agent has a usable connection, check whether this
      // draft substantively restates recent points. If it does, re-prompt the
      // SAME agent ONCE with a "elaborate on this subject differently" nudge —
      // bounded to a single re-prompt so it can never spin on itself. Any
      // judge error keeps the original draft (the round must survive the
      // judge failing, same graceful-degradation rule as the web tools).
      let finalReply = reply;
      if (settingsRef.current.repetitionGuardEnabled) {
        const judgeConn = connections.find((c) => c.id === liveAgent.connectionId);
        if (judgeConn) {
          try {
            const recent = updatedThread.messages.slice(-6);
            const verdict = await judgeRepetition(finalReply.content, recent, liveAgent, judgeConn);
            if (verdict.isRepetitive && verdict.guidance) {
              const redone = await getReply(liveAgent, updatedThread.messages, verdict.guidance, advisorNote);
              if (redone && redone.content.trim()) {
                finalReply = redone;
              }
            }
          } catch {
            // Keep finalReply as the original draft.
          }
        }
      }

      const message: Message = {
        id: generateId(),
        threadId: updatedThread.id,
        agentId: agent.id,
        content: finalReply.content,
        timestamp: Date.now(),
        feedback: null,
        replyToId: null,
        starred: false,
        category: null,
        inputTokens: finalReply.usage.inputTokens,
        outputTokens: finalReply.usage.outputTokens,
        provider: finalReply.provider,
        model: finalReply.model,
        webBrowses: finalReply.webBrowses,
        webAccessFailed: finalReply.webAccessFailed,
        charts: finalReply.charts,
        executionId: finalReply.timing?.executionId,
        timing: finalReply.timing,
      };
      // Structured A2A: build + validate an envelope and attach it. The NL
      // content is always preserved as message.content; the envelope is the
      // machine-readable twin. On validation failure, set a2aError (envelope
      // rejected, never silently promoted to a valid NL message).
      if (effectiveCommunicationMode(liveSettings.communicationMode) === 'a2a') {
        const nextAgent = connected[turn % connected.length];
        const toAgent = message.replyToId ? liveAgent.id : (nextAgent?.id ?? 'all');
        const env = coerceA2AFromReply(
          liveAgent,
          message,
          conversationId,
          toAgent,
          liveSettings.sharedState?.activePhase ?? 'execution',
          finalReply.timing
        );
        if (env) message.a2aEnvelope = env;
        else message.a2aError = 'envelope failed validation';
      }
      updatedThread = { ...updatedThread, messages: [...updatedThread.messages, message] };
      const finishedThread = updatedThread;
      setState((prev) => {
        if (prev.id !== conversationId) {
          // The user has switched to a different tab since this round
          // started — persist directly to the ORIGINATING conversation's
          // own storage instead of silently dropping the reply, or (worse)
          // matching against whatever tab happens to be showing right now.
          void loadConversation(conversationId).then((original) => {
            if (!original) return;
            void saveConversation({
              ...original,
              threads: original.threads.map((t) => (t.id === thread.id ? finishedThread : t)),
              updatedAt: Date.now(),
            });
          });
          return prev;
        }
        return {
          ...prev,
          threads: prev.threads.map((t) => (t.id === thread.id ? finishedThread : t)),
          updatedAt: Date.now(),
        };
      });
      // Give the reader (and Scene View's camera) time to settle on the
      // message that just finished before the next agent starts typing.
      if (postSpeechDelayRef.current > 0 && isRunnable()) {
        await new Promise((resolve) => setTimeout(resolve, postSpeechDelayRef.current));
      }
      // With no exchange limit set, keep going until every agent in this
      // round has had a turn (so all active agents respond to the user's
      // message, not just the first one in rotation) — only an explicit
      // limit extends this into an indefinite auto-discussion loop.
    } while ((hasLimit() ? withinLimits(updatedThread) : turn < connected.length) && isRunnable());

    // The round is over — the user now owns the next turn. Suspend the
    // scheduler as 'awaiting_user' UNLESS the user explicitly consented to
    // autonomous continuation (Auto Mode / autonomousMode). In manual mode
    // this prevents a Moderator timeout or phase drift from continuing on its
    // own; only a new user message resumes. Auto Mode (default on) preserves
    // the existing auto-continue behavior.
    const auto = state.autonomousMode || settingsRef.current.orchestratorEnabled;
    if (statusRef.current !== 'stopped' && statusRef.current !== 'paused' && !auto) {
      statusRef.current = 'awaiting_user';
      setState((prev) => (prev.id === conversationId ? { ...prev, status: 'awaiting_user', updatedAt: Date.now() } : prev));
      recordEvent({ kind: 'system_status', at: new Date().toISOString(), status: 'awaiting_user', message: 'Round complete — awaiting user.' });
    }
  }

  async function startDiscussion() {
    const activeAgents = state.agents.filter((a) => a.participant);
    const connectedActive = activeAgents.filter(agentIsConnected);
    if (connectedActive.length === 0) {
      showToast(
        activeAgents.length === 0
          ? 'Select at least one participating agent first.'
          : 'None of the selected agents have an LLM connected — assign one in 🔌 LLMs.'
      );
      return;
    }
    const [opener, ...responders] = connectedActive;
    startThinking(opener.id, 'pending', state.id);
    const openingLine = await getReply(opener, []);
    stopThinking(opener.id);
    if (!openingLine) {
      showToast(`⚠️ ${opener.refNumber} failed to respond${lastReplyErrorRef.current ? `: ${lastReplyErrorRef.current}` : ''} — check its LLM connection.`);
      return;
    }
    const openingRejection = validateAgentReply(opener, openingLine);
    if (openingRejection) {
      showToast(`⚠️ ${opener.refNumber}'s reply was rejected: ${openingRejection}`);
      return;
    }
    const thread = createThread(opener.id, openingLine);
    setState((prev) => ({
      ...prev,
      threads: [...prev.threads, thread],
      status: 'running',
      updatedAt: Date.now(),
    }));
    if (state.settings.orchestratorEnabled) {
      runAgentRound(thread, responders);
    }
    showToast('▶️ Discussion started!');
  }

  async function handleNewThread(agentId: string) {
    const agent = state.agents.find((a) => a.id === agentId);
    if (!agent) return;
    if (!agentIsConnected(agent)) {
      showToast(`${agent.refNumber} has no LLM connected — assign one in 🔌 LLMs first.`);
      return;
    }
    startThinking(agent.id, 'pending', state.id);
    const openingLine = await getReply(agent, []);
    stopThinking(agent.id);
    if (!openingLine) {
      showToast(`⚠️ ${agent.refNumber} failed to respond${lastReplyErrorRef.current ? `: ${lastReplyErrorRef.current}` : ''} — check its LLM connection.`);
      return;
    }
    const openingRejection = validateAgentReply(agent, openingLine);
    if (openingRejection) {
      showToast(`⚠️ ${agent.refNumber}'s reply was rejected: ${openingRejection}`);
      return;
    }
    const thread = createThread(agentId, openingLine);
    setState((prev) => ({ ...prev, threads: [...prev.threads, thread], updatedAt: Date.now() }));
    showToast(`🧵 New thread started with ${agent.name}`);
  }

  /**
   * One button, two actions: first click starts listening and live-fills
   * the composer as you speak; clicking the SAME button again stops
   * listening and immediately sends whatever was transcribed. The browser's
   * SpeechRecognition API only supports one fixed language per session —
   * there's no standard way to auto-detect/mix languages mid-utterance —
   * so this uses the conversation's configured TTS language as a
   * best-effort single-language recognition target.
   */
  function toggleDictation() {
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      showToast('Voice input is not supported in this browser.');
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = state.settings.ttsLang;
    recognition.continuous = true;
    recognition.interimResults = true;
    dictationFinalTextRef.current = inputMessage ? `${inputMessage} ` : '';

    recognition.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          dictationFinalTextRef.current += `${transcript} `;
        } else {
          interim += transcript;
        }
      }
      setInputMessage(`${dictationFinalTextRef.current}${interim}`.trim());
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      const text = dictationFinalTextRef.current.trim();
      if (text) sendMessage(text);
    };
    recognition.onerror = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }

  // Double-tap Ctrl (press it twice quickly, alone — not as part of a
  // combo like Ctrl+C) toggles voice dictation. Reads toggleDictation via a
  // ref since this effect only registers its listeners once, and a plain
  // closure over toggleDictation would otherwise call a stale version that
  // still sees an old isListening/inputMessage.
  const toggleDictationRef = useRef(toggleDictation);
  useEffect(() => {
    toggleDictationRef.current = toggleDictation;
  });
  useEffect(() => {
    let lastCtrlTapTime = 0;
    let comboUsedSinceCtrlDown = false;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Control' && e.ctrlKey) comboUsedSinceCtrlDown = true;
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key !== 'Control') return;
      const now = Date.now();
      if (!comboUsedSinceCtrlDown && now - lastCtrlTapTime < 500) {
        toggleDictationRef.current();
        lastCtrlTapTime = 0;
      } else {
        lastCtrlTapTime = now;
      }
      comboUsedSinceCtrlDown = false;
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  async function sendMessage(overrideText?: string) {
    // Accepts an explicit override so voice dictation can push the freshly
    // transcribed text directly, without depending on inputMessage state
    // having caught up yet (it's set from a SpeechRecognition callback that
    // may fire across several re-renders after this function was captured).
    const content = (overrideText ?? inputMessage).trim();
    if (!content) return;

    let targetThread = state.threads[state.threads.length - 1];
    if (!targetThread) {
      targetThread = createThread(state.agents[0]?.id ?? 'user');
      setState((prev) => ({ ...prev, threads: [...prev.threads, targetThread] }));
    }

    const userMessage: Message = {
      id: generateId(),
      threadId: targetThread.id,
      agentId: 'user',
      content,
      timestamp: Date.now(),
      feedback: null,
      replyToId: replyingTo?.id ?? null,
      starred: false,
      category: null,
    };
    appendMessage(targetThread.id, userMessage);
    setInputMessage('');
    setReplyingTo(null);

    // Sending a message always resumes/continues the conversation — no
    // separate trip to Play is needed after a pause or a stop.
    statusRef.current = 'running';
    setState((prev) => ({ ...prev, status: 'running' }));

    // If the exchange limit was already reached, extend it automatically
    // rather than silently going quiet right after the user's message — UNLESS
    // the orchestrator repetition judge is on, in which case quality is
    // handled by re-prompting rather than by inflating the loop length (the
    // reported "agents repeat themselves and extend the loop" problem).
    if (
      settingsRef.current.maxExchanges != null &&
      !withinLimits(targetThread) &&
      !settingsRef.current.repetitionGuardEnabled
    ) {
      extendExchanges(10);
    }

    const mentionMatch = /@(Agt\d+)/i.exec(content);
    const mentionedAgent = mentionMatch
      ? state.agents.find((a) => a.refNumber.toLowerCase() === mentionMatch[1].toLowerCase())
      : null;

    if (mentionedAgent) {
      // Deactivate immediately so the participants bar reflects that this
      // agent was addressed directly and won't auto-join future rounds
      // until the user re-selects it.
      setState((prev) => ({
        ...prev,
        agents: prev.agents.map((a) => (a.id === mentionedAgent.id ? { ...a, active: false } : a)),
      }));
      showToast(`Directed at ${mentionedAgent.refNumber} — it's been unselected from Participants.`);
      const threadWithUserMsg = { ...targetThread, messages: [...targetThread.messages, userMessage] };
      runAgentRound(threadWithUserMsg, [mentionedAgent]);
      return;
    }

    // Every active, connected agent responds to the user's message by
    // default — not just the first one in rotation — unless @mentioning a
    // specific agent (handled above) says otherwise.
    const threadWithUserMsg = { ...targetThread, messages: [...targetThread.messages, userMessage] };
    runAgentRound(threadWithUserMsg, state.agents.filter((a) => a.participant));
  }

  /** Quick-action shortcuts for steering an in-progress discussion, sent
   * exactly like a typed message so every active agent sees and responds to
   * them (and, per the "always prioritize the user" system-prompt rule,
   * treats them as a direct redirect rather than just another talking point). */
  function nextSubject() {
    const subject = window.prompt('New subject to move the discussion to:', '');
    if (subject === null) return;
    const trimmed = subject.trim();
    if (!trimmed) return;
    updateSettings({ topic: trimmed });
    sendMessage(`Let's move on to a new subject: ${trimmed}. Please shift the discussion to focus on this now.`);
  }

  function changeDirection() {
    sendMessage("I don't like the direction this is going — please change your approach and reconsider.");
  }

  function continueElaborate() {
    sendMessage('Please continue and elaborate further on the current subject.');
  }

  async function handleReaction(threadId: string, message: Message, type: ReactionType) {
    if (type === 'mindmap') {
      const author = state.agents.find((a) => a.id === message.agentId);
      const title = `${author ? author.refNumber : 'Message'} Mind Map`;
      // Prefer a CONCLUSIVE mind map generated by the Wiki Keeper connection;
      // fall back to the naive sentence-split builder when no keeper or on
      // failure, so the reaction always opens something.
      const keeperId = state.settings.wikiKeeperConnectionId ?? loadGlobalWikiKeeper();
      const keeper = keeperId ? connections.find((c) => c.id === keeperId) : undefined;
      let markdown: string;
      if (keeper) {
        showToast('🧠 Generating conclusive mind map…');
        const generated = await fetchMindmap(keeper, title, message.content);
        markdown = generated ?? buildMessageMindmapMarkdown(state.agents, message);
      } else {
        markdown = buildMessageMindmapMarkdown(state.agents, message);
      }
      setMindmapData({ markdown, title });
      setActiveModal('mindmap');
      return;
    }

    if (type === 'youtube' || type === 'tiktok') {
      const query = `${state.settings.topic} ${message.content}`.trim().slice(0, 150);
      const url =
        type === 'youtube'
          ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
          : `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    const author = state.agents.find((a) => a.id === message.agentId);
    if (!author) {
      showToast('Reactions that ask for a follow-up only work on agent messages.');
      return;
    }
    if (!agentIsConnected(author)) {
      showToast(`${author.refNumber} has no LLM connected — assign one in 🔌 LLMs first.`);
      return;
    }

    const thread = state.threads.find((t) => t.id === threadId);
    if (!thread) return;
    const index = thread.messages.findIndex((m) => m.id === message.id);
    const precedingMessages = thread.messages.slice(0, index + 1);
    const instruction = reactionInstruction(type);

    startThinking(author.id, threadId, state.id);
    const reply = await getReply(author, precedingMessages, instruction);
    stopThinking(author.id);
    if (!reply) {
      showToast(`⚠️ ${author.refNumber} failed to respond${lastReplyErrorRef.current ? `: ${lastReplyErrorRef.current}` : ''} — check its LLM connection.`);
      return;
    }
    const reactionRejection = validateAgentReply(author, reply);
    if (reactionRejection) {
      showToast(`⚠️ ${author.refNumber}'s reply was rejected: ${reactionRejection}`);
      return;
    }

    if (type === 'suggest') {
      setInputMessage(reply.content);
      showToast('💡 Suggestion added to the composer — edit and send, or discard.');
      return;
    }

    appendMessage(threadId, {
      id: generateId(),
      threadId,
      agentId: author.id,
      content: reply.content,
      timestamp: Date.now(),
      feedback: null,
      replyToId: message.id,
      starred: false,
      category: null,
      inputTokens: reply.usage.inputTokens,
      outputTokens: reply.usage.outputTokens,
      provider: reply.provider,
      model: reply.model,
      webBrowses: reply.webBrowses,
        webAccessFailed: reply.webAccessFailed,
        executionId: reply.timing?.executionId,
        timing: reply.timing,
    });
  }

  function stopSpeaking() {
    speakingCancelledRef.current = true;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (googleAudioRef.current) {
      googleAudioRef.current.pause();
      googleAudioRef.current = null;
    }
    if (ttsAbortControllerRef.current) {
      ttsAbortControllerRef.current.abort();
      ttsAbortControllerRef.current = null;
    }
    setSpeaking(null);
    setTtsLoadingMessageId(null);
  }

  /**
   * Splits text into sentence-ish chunks with their offset in the original
   * string. Android Chrome's Web Speech API truncates long utterances after
   * a couple of seconds, so long messages must be spoken as a queue of short
   * per-sentence utterances rather than one utterance for the whole message.
   */
  /**
   * Finds every whitespace-delimited word in `text` with its offset/length.
   * Used to normalize word-highlighting: some voices/browsers (mainly
   * non-Microsoft ones) fire 'word' onboundary events once per CHARACTER
   * instead of once per word, which made the highlight look like it was
   * creeping one letter at a time instead of lighting up a whole word.
   */
  function splitIntoWords(text: string): { start: number; length: number }[] {
    const words: { start: number; length: number }[] = [];
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      words.push({ start: m.index, length: m[0].length });
    }
    return words;
  }

  /**
   * Gemini TTS doesn't return per-word timestamps, so audio-progress-based
   * highlighting can only ever be an estimate — but naively dividing
   * progress evenly across word COUNT is a poor one, since real speech
   * spends more time on long words and pauses after punctuation. Weighting
   * by character length (plus an extra pause allowance after clause/
   * sentence-ending punctuation) tracks natural speaking rhythm much more
   * closely, without needing timestamps the API doesn't provide.
   */
  function buildWeightedWordCumulative(
    text: string,
    words: { start: number; length: number }[]
  ): number[] {
    let cumulative = 0;
    return words.map((w) => {
      const wordText = text.slice(w.start, w.start + w.length);
      let weight = w.length;
      if (/[.!?]$/.test(wordText)) weight += 6;
      else if (/[,;:]$/.test(wordText)) weight += 3;
      cumulative += weight;
      return cumulative;
    });
  }

  function wordIndexAtFraction(cumulativeEnds: number[], frac: number): number {
    const total = cumulativeEnds[cumulativeEnds.length - 1] || 1;
    const target = frac * total;
    for (let i = 0; i < cumulativeEnds.length; i++) {
      if (target <= cumulativeEnds[i]) return i;
    }
    return cumulativeEnds.length - 1;
  }

  function splitIntoSentences(text: string): { text: string; offset: number }[] {
    const re = /[^.!?\n]+[.!?]+(\s+|$)|[^.!?\n]+$|\n+/g;
    const parts: { text: string; offset: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m[0].trim()) parts.push({ text: m[0], offset: m.index });
    }
    return parts.length > 0 ? parts : [{ text, offset: 0 }];
  }

  function playFromMessage(startIndex: number, startCharOffset?: number) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      showToast('Speech synthesis is not supported in this browser.');
      return;
    }
    window.speechSynthesis.cancel();
    speakingCancelledRef.current = false;

    // Chrome silently drops boundary/word events if speak() is called in
    // the same tick as cancel(), and can stall on long utterances unless
    // periodically nudged with pause()/resume() — both are long-standing
    // DESKTOP Web Speech API quirks. On Android, pause()/resume() is the
    // opposite of harmless: resume() is well known to never actually
    // resume there, permanently freezing the utterance — which read as
    // "the reading just stops" even after the message-to-message chaining
    // was already fixed. So the nudge only runs where it was meant to.
    const isAndroid = /android/i.test(navigator.userAgent);
    const keepAlive = setInterval(() => {
      if (!isAndroid && window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 10000);

    function speakAt(index: number) {
      if (speakingCancelledRef.current || index >= allMessages.length) {
        setSpeaking(null);
        clearInterval(keepAlive);
        return;
      }
      const msg = allMessages[index];
      // Only the message the user actually clicked/selected into starts
      // partway through — every message after it in the chain plays from
      // the beginning as usual.
      const offset = index === startIndex ? startCharOffset ?? 0 : 0;
      const apiKey = loadTtsApiKey();
      if (state.settings.ttsProvider === 'google' && apiKey) {
        speakMessageGoogle(index, msg, apiKey, offset);
        return;
      }
      const customBaseUrl = loadCustomTtsBaseUrl();
      const customApiKey = loadCustomTtsApiKey();
      if (state.settings.ttsProvider === 'custom' && customBaseUrl && customApiKey) {
        speakMessageCustom(index, msg, customBaseUrl, customApiKey, offset);
        return;
      }
      speakMessageBrowser(index, msg, offset);
    }

    // Splits a message into a short "fast start" chunk (first sentence, or
    // first ~14 words if there's no early sentence break) plus the
    // remainder, so the first chunk's short synthesis request comes back
    // quickly and audio can start almost immediately, instead of waiting
    // for the whole message to finish generating. Short messages that are
    // already fast on their own aren't split. Returns null when splitting
    // wouldn't help (short message, or nothing left after the first chunk).
    function splitForFastStart(text: string): [string, string] | null {
      const words = splitIntoWords(text);
      if (words.length <= 14) return null;

      const sentences = splitIntoSentences(text);
      let cutIndex: number;
      if (sentences.length > 1 && sentences[0].text.trim().split(/\s+/).length <= 25) {
        cutIndex = sentences[0].offset + sentences[0].text.length;
      } else {
        const w = words[13];
        cutIndex = w.start + w.length;
      }
      const first = text.slice(0, cutIndex);
      const rest = text.slice(cutIndex).trimStart();
      if (!rest) return null;
      return [first, rest];
    }

    /** Plays one already-synthesized chunk, driving word-highlight over its own text/offset, then calls onEnded. */
    function playGoogleAudioChunk(
      msg: Message,
      audioUrl: string,
      chunkText: string,
      chunkOffset: number,
      onEnded: () => void
    ) {
      const audio = new Audio(audioUrl);
      googleAudioRef.current = audio;
      const words = splitIntoWords(chunkText);
      const cumulativeEnds = buildWeightedWordCumulative(chunkText, words);
      let progressTimer: ReturnType<typeof setInterval> | null = null;
      // Gemini/Custom TTS return NO per-word timestamps, so the highlight is
      // an ESTIMATE derived from audio progress mapped through a char-weighted
      // word distribution — it will always drift somewhat vs. real prosody.
      // Tightened from 80ms→45ms polling (smoother, lower perceptible lag) and
      // made robust to providers that report duration as Infinity until the
      // blob is fully decoded (otherwise frac stayed 0 and the highlight froze
      // on the first word for the whole chunk). When duration is unknown we
      // fall back to a wall-clock estimate so the highlight at least advances.
      const POLL_MS = 45;
      const estMsPerWord = words.length > 0 ? (320 / Math.max(state.settings.ttsRate, 0.25)) : 320;
      let startedAt = 0;
      audio.onloadedmetadata = () => {
        setSpeaking({ messageId: msg.id, charIndex: chunkOffset, charLength: 0 });
        startedAt = performance.now();
        progressTimer = setInterval(() => {
          if (words.length === 0) return;
          const dur = audio.duration;
          let frac: number;
          if (isFinite(dur) && dur > 0) {
            frac = Math.min(audio.currentTime / dur, 1);
          } else {
            const elapsedSec = (performance.now() - startedAt) / 1000;
            const estSec = (words.length * estMsPerWord) / 1000;
            frac = estSec > 0 ? Math.min(elapsedSec / estSec, 1) : 0;
          }
          const w = words[wordIndexAtFraction(cumulativeEnds, frac)];
          setSpeaking({ messageId: msg.id, charIndex: chunkOffset + w.start, charLength: w.length });
        }, POLL_MS);
      };
      audio.onended = () => {
        if (progressTimer) clearInterval(progressTimer);
        googleAudioRef.current = null;
        onEnded();
      };
      audio.onerror = () => {
        if (progressTimer) clearInterval(progressTimer);
        googleAudioRef.current = null;
        onEnded();
      };
      audio.play();
    }

    // Gemini TTS previously synthesized the WHOLE message in a single
    // request, which reads naturally (no per-sentence "stop and resume"
    // gaps) but means a visible wait before ANY audio starts on longer
    // messages. Now the first short chunk is requested (and played) on its
    // own so it comes back fast, while the remainder is requested
    // concurrently in the background so it's normally ready by the time
    // the first chunk finishes — best of both: fast start, no mid-message gap.
    async function speakMessageGoogle(index: number, msg: Message, apiKey: string, startOffset = 0) {
      const author = agentById(msg.agentId);
      const voiceName = pickGoogleVoiceForAgent(msg.agentId, author?.googleVoiceName);
      const model = state.settings.googleTtsModel;
      const rate = state.settings.ttsRate;
      setTtsLoadingMessageId(msg.id);
      const abortController = new AbortController();
      ttsAbortControllerRef.current = abortController;

      // Starting partway through skips fast-start splitting entirely — it's
      // already a short remainder, no need to split it further.
      const content = startOffset > 0 ? msg.content.slice(startOffset) : msg.content;
      const split = startOffset > 0 ? null : splitForFastStart(content);
      const finishLoading = () => setTtsLoadingMessageId((prev) => (prev === msg.id ? null : prev));

      if (!split) {
        const audioUrl = await synthesizeGoogleAudio(apiKey, content, voiceName, model, rate, abortController.signal);
        if (ttsAbortControllerRef.current === abortController) ttsAbortControllerRef.current = null;
        finishLoading();
        if (speakingCancelledRef.current) return;
        if (!audioUrl) {
          showToast('⚠️ Gemini TTS failed — falling back to the browser voice.');
          speakMessageBrowser(index, msg, startOffset);
          return;
        }
        playGoogleAudioChunk(msg, audioUrl, content, startOffset, () => speakAt(index + 1));
        return;
      }

      const [firstText, restText] = split;
      const restOffset = msg.content.indexOf(restText, firstText.length);
      const firstPromise = synthesizeGoogleAudio(apiKey, firstText, voiceName, model, rate, abortController.signal);
      const restPromise = synthesizeGoogleAudio(apiKey, restText, voiceName, model, rate, abortController.signal);

      const firstUrl = await firstPromise;
      if (ttsAbortControllerRef.current === abortController) ttsAbortControllerRef.current = null;
      finishLoading();
      if (speakingCancelledRef.current) return;
      if (!firstUrl) {
        showToast('⚠️ Gemini TTS failed — falling back to the browser voice.');
        speakMessageBrowser(index, msg, startOffset);
        return;
      }
      playGoogleAudioChunk(msg, firstUrl, firstText, 0, async () => {
        if (speakingCancelledRef.current) return;
        const restUrl = await restPromise;
        if (speakingCancelledRef.current) return;
        if (!restUrl) {
          speakAt(index + 1);
          return;
        }
        playGoogleAudioChunk(msg, restUrl, restText, restOffset, () => speakAt(index + 1));
      });
    }

    // No fast-start split here (unlike Gemini) — a custom/self-hosted TTS
    // service's latency characteristics aren't known in advance, so this
    // keeps the request shape simple: synthesize the whole message once.
    async function speakMessageCustom(index: number, msg: Message, baseUrl: string, apiKey: string, startOffset = 0) {
      const voice = loadCustomTtsVoice();
      const content = startOffset > 0 ? msg.content.slice(startOffset) : msg.content;
      setTtsLoadingMessageId(msg.id);
      const abortController = new AbortController();
      ttsAbortControllerRef.current = abortController;
      const audioUrl = await synthesizeCustomTts(baseUrl, apiKey, content, voice, abortController.signal);
      if (ttsAbortControllerRef.current === abortController) ttsAbortControllerRef.current = null;
      setTtsLoadingMessageId((prev) => (prev === msg.id ? null : prev));
      if (speakingCancelledRef.current) return;
      if (!audioUrl) {
        showToast('⚠️ Custom TTS failed — falling back to the browser voice.');
        speakMessageBrowser(index, msg, startOffset);
        return;
      }
      playGoogleAudioChunk(msg, audioUrl, content, startOffset, () => speakAt(index + 1));
    }

    function speakMessageBrowser(index: number, msg: Message, startOffset = 0) {
      const sentences = splitIntoSentences(msg.content);
      // Jump straight to the sentence containing the selected word instead
      // of slicing text mid-sentence — each sentence's own `offset` already
      // maps back to the full message, so word-highlighting stays correct.
      let sentenceIdx =
        startOffset > 0 ? Math.max(sentences.findIndex((s) => s.offset + s.text.length > startOffset), 0) : 0;

      function speakSentenceBrowser(text: string, offset: number) {
        const utterance = new SpeechSynthesisUtterance(text);
        const author = agentById(msg.agentId);
        const { voice, pitch, rate } = pickVoiceForAgent(
          msg.agentId,
          author?.voiceURI,
          state.settings.ttsLang,
          state.settings.ttsRate
        );
        utterance.rate = rate;
        utterance.pitch = pitch;
        utterance.lang = state.settings.ttsLang;
        if (voice) utterance.voice = voice;
        // Some voices/platforms never fire onboundary events at all, which
        // silently breaks the word-highlight ("I don't see the words being
        // read"). Others (mainly non-Microsoft voices) fire 'word' boundary
        // events once per CHARACTER instead of once per word, making the
        // highlight creep one letter at a time. Both are worked around by
        // always resolving to a whole word from `words`, either from the
        // boundary event's position or from a timer-driven step through the
        // word list when no boundary events arrive at all.
        const words = splitIntoWords(text);
        let receivedBoundary = false;
        let fallbackTimer: ReturnType<typeof setInterval> | null = null;
        let fallbackWordIdx = 0;
        const estimatedMsPerChar = 55 / Math.max(rate, 0.25);
        const estimatedMsPerWord =
          words.length > 0 ? (estimatedMsPerChar * text.length) / words.length : 300;

        utterance.onstart = () => {
          setSpeaking({ messageId: msg.id, charIndex: offset, charLength: 0 });
          fallbackTimer = setInterval(() => {
            if (receivedBoundary) {
              if (fallbackTimer) clearInterval(fallbackTimer);
              return;
            }
            if (fallbackWordIdx >= words.length) return;
            const w = words[fallbackWordIdx];
            fallbackWordIdx += 1;
            setSpeaking({ messageId: msg.id, charIndex: offset + w.start, charLength: w.length });
          }, estimatedMsPerWord);
        };
        utterance.onboundary = (e) => {
          if (e.name && e.name !== 'word') return;
          receivedBoundary = true;
          // Expand to the full word containing e.charIndex, regardless of
          // whether this event landed at the word's start (normal case) or
          // somewhere mid-word (the per-character-event browser quirk).
          const word = words.find((w) => e.charIndex >= w.start && e.charIndex < w.start + w.length);
          if (word) {
            setSpeaking({ messageId: msg.id, charIndex: offset + word.start, charLength: word.length });
          } else {
            setSpeaking({ messageId: msg.id, charIndex: offset + e.charIndex, charLength: 1 });
          }
        };
        // Android Chrome silently swallows a speak() call for the NEXT
        // utterance when it's made synchronously from inside the previous
        // utterance's onend/onerror handler — desktop Chrome tolerates
        // this chaining, Android doesn't, and the queue just goes quiet
        // with no error. Deferring to a fresh tick avoids it.
        let advanced = false;
        function advanceOnce() {
          if (advanced) return;
          advanced = true;
          if (fallbackTimer) clearInterval(fallbackTimer);
          if (endWatchdog) clearInterval(endWatchdog);
          setTimeout(speakSentence, 80);
        }
        utterance.onend = advanceOnce;
        utterance.onerror = advanceOnce;
        window.speechSynthesis.speak(utterance);

        // Some Android builds never fire onend/onerror at all for a given
        // utterance — not delayed, just never. Trusting only those events
        // left playback permanently frozen on whatever sentence that
        // happened to. This polls the synthesizer's own state directly as
        // an independent, event-free way to notice the utterance actually
        // finished, so the chain can't get stuck waiting on an event that
        // was never going to come.
        let watchdogChecks = 0;
        const endWatchdog: ReturnType<typeof setInterval> = setInterval(() => {
          if (speakingCancelledRef.current) {
            clearInterval(endWatchdog);
            return;
          }
          watchdogChecks += 1;
          if (watchdogChecks < 4) return; // give speak() ~1s to actually start before trusting "not speaking"
          if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
            clearInterval(endWatchdog);
            advanceOnce();
          }
        }, 250);
      }

      function speakSentence() {
        if (speakingCancelledRef.current) {
          setSpeaking(null);
          clearInterval(keepAlive);
          return;
        }
        if (sentenceIdx >= sentences.length) {
          setTimeout(() => speakAt(index + 1), 80);
          return;
        }
        const { text, offset } = sentences[sentenceIdx];
        sentenceIdx += 1;
        speakSentenceBrowser(text, offset);
      }

      speakSentence();
    }

    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.addEventListener(
        'voiceschanged',
        () => setTimeout(() => speakAt(startIndex), 50),
        { once: true }
      );
    } else {
      setTimeout(() => speakAt(startIndex), 50);
    }
  }

  function toggleAgentActive(id: string) {
    const agent = state.agents.find((a) => a.id === id);
    if (!agent) return;
    // Toggling the participant chip flips whether this agent joins the visible
    // rounds. participant ⇒ active (can't participate if not enabled), so
    // turning participation on also enables the agent.
    const nextParticipant = !agent.participant;
    if (nextParticipant && !agentIsConnected(agent)) {
      showToast(`${agent.refNumber} has no LLM connected — assign one in 🔌 LLMs first.`);
      return;
    }
    setState((prev) => ({
      ...prev,
      agents: prev.agents.map((a) =>
        a.id === id
          ? { ...a, participant: nextParticipant, active: nextParticipant ? true : a.active }
          : a
      ),
    }));
  }

  function handleFeedback(threadId: string, messageId: string, type: Feedback) {
    setState((prev) => ({
      ...prev,
      threads: prev.threads.map((t) =>
        t.id !== threadId
          ? t
          : {
              ...t,
              messages: t.messages.map((m) =>
                m.id === messageId ? { ...m, feedback: m.feedback === type ? null : type } : m
              ),
            }
      ),
    }));
    const labels: Record<Feedback, string> = {
      like: '👍 Thanks for the feedback!',
      dislike: '👎 Sorry you didn’t like this.',
      clarify: '🤔 Noted — flagged for clarification.',
    };
    showToast(labels[type]);
  }

  function toggleStarred(threadId: string, messageId: string) {
    setState((prev) => ({
      ...prev,
      threads: prev.threads.map((t) =>
        t.id !== threadId
          ? t
          : {
              ...t,
              messages: t.messages.map((m) =>
                m.id === messageId ? { ...m, starred: !m.starred } : m
              ),
            }
      ),
    }));
  }

  function setMessageCategory(threadId: string, messageId: string) {
    const current = state.threads
      .find((t) => t.id === threadId)
      ?.messages.find((m) => m.id === messageId)?.category;
    const category = window.prompt('Tag this message with a category:', current ?? '');
    if (category === null) return;
    setState((prev) => ({
      ...prev,
      threads: prev.threads.map((t) =>
        t.id !== threadId
          ? t
          : {
              ...t,
              messages: t.messages.map((m) =>
                m.id === messageId ? { ...m, category: category.trim() || null } : m
              ),
            }
      ),
    }));
  }

  function getSelectedOrFullText(fallback: string): string {
    const selection = window.getSelection()?.toString().trim();
    return selection && selection.length > 0 ? selection : fallback;
  }

  async function copyMessageText(content: string) {
    const text = getSelectedOrFullText(content);
    try {
      await navigator.clipboard.writeText(text);
      showToast('📋 Copied to clipboard');
    } catch {
      showToast('Could not copy — try selecting the text manually.');
    }
  }

  /**
   * Right-click a message to copy it directly (no browser context menu);
   * right-click the SAME message again within the window to paste the
   * clipboard into the composer instead.
   */
  function handleMessageContextMenu(e: React.MouseEvent, content: string) {
    e.preventDefault();
    const now = Date.now();
    const last = lastContextMenuRef.current;
    if (last && now - last.time < 500) {
      lastContextMenuRef.current = null;
      navigator.clipboard
        .readText()
        .then((text) => {
          if (text) setInputMessage((prev) => `${prev}${text}`);
        })
        .catch(() => showToast('Could not read clipboard — check browser permissions.'));
      return;
    }
    lastContextMenuRef.current = { time: now };
    copyMessageText(content);
  }

  function shareToWhatsApp(content: string) {
    const text = getSelectedOrFullText(content);
    const digitsOnly = state.settings.whatsappNumber.replace(/\D/g, '');
    const number = (digitsOnly || DEFAULT_WHATSAPP_NUMBER).replace(/^00/, '');
    const url = `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function toggleMessageSelected(id: string) {
    setSelectedMessageIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  }

  function selectedMessagesText(): string {
    const chronological = allMessages
      .filter((m) => selectedMessageIds.includes(m.id))
      .sort((a, b) => a.timestamp - b.timestamp);
    return chronological
      .map((m) => `${authorLabel(m.agentId)}: ${m.content}`)
      .join('\n\n');
  }

  /** Selects every currently-visible message (respecting the active search/filter), or clears the selection if everything visible is already selected. */
  function toggleSelectAllMessages() {
    const visibleIds = visibleThreads.flatMap((t) => t.messages.map((m) => m.id));
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedMessageIds.includes(id));
    setSelectedMessageIds(allSelected ? [] : visibleIds);
  }

  async function copySelectedMessages() {
    try {
      await navigator.clipboard.writeText(selectedMessagesText());
      showToast(`📋 Copied ${selectedMessageIds.length} messages`);
    } catch {
      showToast('Could not copy — try again.');
    }
  }

  function shareSelectedToWhatsApp() {
    const text = selectedMessagesText();
    const digitsOnly = state.settings.whatsappNumber.replace(/\D/g, '');
    const number = (digitsOnly || DEFAULT_WHATSAPP_NUMBER).replace(/^00/, '');
    const url = `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /** Whole conversation as readable text (every message, chronological). */
  function conversationText(): string {
    const chronological = allMessages.slice().sort((a, b) => a.timestamp - b.timestamp);
    const header = state.settings.topic ? `Topic: ${state.settings.topic}\n\n` : '';
    return (
      header +
      chronological.map((m) => `${authorLabel(m.agentId)}: ${m.content}`).join('\n\n')
    );
  }

  function downloadTextFile(filename: string, text: string) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function conversationFileBase(): string {
    const title = tabs.find((t) => t.id === state.id)?.title || state.settings.topic || 'conversation';
    return title.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40) || 'conversation';
  }

  function downloadSelectedMessages() {
    if (selectedMessageIds.length === 0) {
      showToast('Select at least one message first.');
      return;
    }
    downloadTextFile(`${conversationFileBase()}-selected.txt`, selectedMessagesText());
    showToast(`📥 Downloaded ${selectedMessageIds.length} messages`);
  }

  function downloadConversation() {
    downloadTextFile(`${conversationFileBase()}.txt`, conversationText());
    showToast('📥 Downloaded conversation');
  }

  function pauseConversation() {
    statusRef.current = 'paused';
    setState((prev) => ({ ...prev, status: 'paused' }));
    showToast('⏸️ Conversation paused');
  }

  function stopConversation() {
    statusRef.current = 'stopped';
    setState((prev) => ({ ...prev, status: 'stopped' }));
    showToast('⏹️ Conversation stopped');
  }

  function playConversation() {
    const lastThread = state.threads[state.threads.length - 1];
    if (!lastThread) {
      showToast('Start a discussion first.');
      return;
    }
    const connectedActive = state.agents.filter((a) => a.participant && agentIsConnected(a));
    if (connectedActive.length === 0) {
      showToast('No connected, participating agents to resume with.');
      return;
    }
    statusRef.current = 'running';
    setState((prev) => ({ ...prev, status: 'running' }));
    // Resume ALWAYS resumes — if the exchange limit was reached, auto-extend
    // by 10 rather than leaving the user stuck (previously this returned early
    // after flipping status to running, so "resume" silently did nothing).
    if (!withinLimits(lastThread)) {
      const current = settingsRef.current.maxExchanges ?? 0;
      updateSettings({ maxExchanges: current + 10 });
      showToast(`➕ Extended +10 and resuming…`);
    }
    runAgentRound(lastThread, connectedActive);
  }

  function extendExchanges(amount: number) {
    const current = state.settings.maxExchanges ?? 0;
    updateSettings({ maxExchanges: current + amount });
    showToast(`➕ Exchange limit extended to ${current + amount}`);
  }

  function resetConversation() {
    if (allMessages.length === 0) {
      setState((prev) => ({ ...prev, threads: [], status: 'idle' }));
      showToast('🔄 Conversation reset');
      return;
    }
    const shouldArchive = window.confirm(
      'Archive this conversation before resetting?\n\nOK = Archive & Reset\nCancel = choose to reset without saving, or back out entirely'
    );
    if (shouldArchive) {
      const userTitle = window.prompt('Give this conversation a title before archiving it:', '');
      if (userTitle === null) return; // cancelled the title prompt — stays on the current conversation
      const title = buildArchiveTitle(userTitle.trim(), state);
      const archive: ArchivedConversation = {
        id: generateId(),
        title,
        archivedAt: Date.now(),
        category: null,
        color: null,
        state,
      };
      const nextArchives = [...archives, archive];
      setArchives(nextArchives);
      saveArchives(nextArchives);
      setState((prev) => ({ ...prev, threads: [], status: 'idle' }));
      showToast(`🗄️ Archived as "${title}" and reset`);
      return;
    }
    const discardWithoutSaving = window.confirm(
      'Reset WITHOUT saving? This conversation will be permanently lost.\n\nOK = Reset without saving\nCancel = go back, keep the current conversation'
    );
    if (!discardWithoutSaving) return; // stays on the current conversation
    setState((prev) => ({ ...prev, threads: [], status: 'idle' }));
    showToast('🔄 Conversation reset (not saved)');
  }

  function restoreArchive(archive: ArchivedConversation) {
    const restored = migrateState(archive.state);
    setState(restored);
    setCurrentAgentId(restored.agents[0]?.id ?? DEFAULT_AGENTS[0].id);
    // Opens as its own tab (rather than clobbering whatever tab was active) —
    // unless that same conversation id is already open as a tab, in which
    // case just switch to it instead of creating a duplicate entry.
    if (!tabs.some((t) => t.id === restored.id)) {
      const nextTabs = [...tabs, { id: restored.id, title: deriveTabTitle(restored), category: null }];
      setTabs(nextTabs);
      saveTabs(nextTabs);
    }
    // Point the "current conversation" pointer at the restored conversation's
    // own id — otherwise a reload re-resolves the previous pointer and it
    // looks like restoring silently created a separate instance.
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CONVERSATION_ID_KEY, restored.id);
    }
    if (userId) {
      setCurrentConversationId(userId, restored.id);
    }
    setActiveModal(null);
    showToast(`♻️ Restored "${archive.title}" as a new tab`);
  }

  function deleteArchive(id: string) {
    const next = archives.filter((a) => a.id !== id);
    setArchives(next);
    saveArchives(next);
    showToast('🗑️ Archive deleted');
  }

  function updateArchiveMeta(id: string, updates: { category?: string | null; color?: string | null }) {
    const next = archives.map((a) => (a.id === id ? { ...a, ...updates } : a));
    setArchives(next);
    saveArchives(next);
  }

  /**
   * A brand-new conversation seeded with the CURRENT tab's agent roster
   * (names, roles, instructions, colors, LLM connections, traits) rather
   * than the hardcoded starter agents — agents are a shared cast across
   * every tab, only the thread history is per-tab.
   */
  function freshConversationWithCurrentAgents(id?: string): ConversationState {
    const base = defaultState();
    return {
      ...base,
      id: id ?? base.id,
      // Agent identity/LLM assignment carries over, but participation
      // (`active`) is each tab's own — a brand-new tab starts with nobody
      // active (prompting a category pick in the Participants bar, see
      // ChatApp's `s5` block) EXCEPT agents pinned to always join every
      // conversation by default, which start active here regardless.
      agents: state.agents.map((a) => ({ ...a, active: a.pinnedToAllConversations })),
      nextAgentNumber: state.nextAgentNumber,
    };
  }

  /** Switches the single live conversation slot to a different (already-open) tab's conversation. */
  async function switchTab(id: string) {
    if (id === state.id) return;
    if (state.settings.pauseOnTabSwitch && (state.status === 'running' || visibleThinking.size > 0)) {
      pauseConversation();
    }
    const loaded = await loadConversation(id);
    const nextState = loaded ? migrateState(loaded) : freshConversationWithCurrentAgents(id);
    setState(nextState);
    setCurrentAgentId(nextState.agents[0]?.id ?? DEFAULT_AGENTS[0].id);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CONVERSATION_ID_KEY, id);
    }
    if (userId) {
      setCurrentConversationId(userId, id);
    }
  }

  function addTab() {
    const fresh = freshConversationWithCurrentAgents();
    setState(fresh);
    setCurrentAgentId(fresh.agents[0]?.id ?? DEFAULT_AGENTS[0].id);
    // Inherits the current tab's group, if any, so opening a new tab from
    // inside a group keeps it there instead of starting ungrouped.
    const currentCategory = tabs.find((t) => t.id === state.id)?.category ?? null;
    const nextTabs = [...tabs, { id: fresh.id, title: deriveTabTitle(fresh), category: currentCategory }];
    setTabs(nextTabs);
    saveTabs(nextTabs);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CONVERSATION_ID_KEY, fresh.id);
    }
    if (userId) {
      setCurrentConversationId(userId, fresh.id);
    }
    showToast('🆕 New conversation tab');
  }

  /** Opens the Save/Discard/Cancel prompt for closing a tab — skipped for an empty, currently-active tab (nothing to lose). */
  function closeTab(id: string) {
    if (id === state.id && allMessages.length === 0) {
      finishCloseTab(id, 'discard');
      return;
    }
    setClosingTabId(id);
  }

  async function finishCloseTab(id: string, action: 'save' | 'discard') {
    setClosingTabId(null);
    const isActive = id === state.id;
    const tabState = isActive ? state : migrateState((await loadConversation(id)) ?? { ...defaultState(), id });

    if (action === 'save') {
      const label = tabs.find((t) => t.id === id)?.title || 'Conversation';
      const title = buildArchiveTitle(label, tabState);
      const archive: ArchivedConversation = {
        id: generateId(),
        title,
        archivedAt: Date.now(),
        category: null,
        color: null,
        state: tabState,
      };
      const nextArchives = [...archives, archive];
      setArchives(nextArchives);
      saveArchives(nextArchives);
    }
    await deleteConversation(id);

    const remainingTabs = tabs.filter((t) => t.id !== id);
    if (remainingTabs.length === 0) {
      // Never end up with zero tabs — open a fresh one in its place.
      const fresh = freshConversationWithCurrentAgents();
      setState(fresh);
      setCurrentAgentId(fresh.agents[0]?.id ?? DEFAULT_AGENTS[0].id);
      const seeded = [{ id: fresh.id, title: deriveTabTitle(fresh), category: null }];
      setTabs(seeded);
      saveTabs(seeded);
      if (typeof window !== 'undefined') window.localStorage.setItem(CONVERSATION_ID_KEY, fresh.id);
      if (userId) setCurrentConversationId(userId, fresh.id);
    } else {
      setTabs(remainingTabs);
      saveTabs(remainingTabs);
      if (isActive) await switchTab(remainingTabs[0].id);
    }
    showToast(action === 'save' ? '💾 Saved to Archives and closed' : '🗑️ Discarded and closed');
  }

  function renameTab(id: string) {
    const current = tabs.find((t) => t.id === id);
    if (!current) return;
    const next = window.prompt('Rename this tab:', current.title);
    if (next === null || !next.trim()) return;
    const nextTabs = tabs.map((t) => (t.id === id ? { ...t, title: next.trim() } : t));
    setTabs(nextTabs);
    saveTabs(nextTabs);
  }

  /** Groups tabs for organization (e.g. "Work", "Research") — purely a display/organization label, doesn't affect the conversation itself. */
  function setTabCategory(id: string) {
    const current = tabs.find((t) => t.id === id);
    if (!current) return;
    const next = window.prompt('Group/category for this tab (blank = ungrouped):', current.category ?? '');
    if (next === null) return;
    const nextTabs = tabs.map((t) => (t.id === id ? { ...t, category: next.trim() || null } : t));
    setTabs(nextTabs);
    saveTabs(nextTabs);
  }

  function updateSettings(updates: Partial<ConversationState['settings']>) {
    // Excludes "topic" — it fires on every keystroke while typing, which
    // would flood the log with meaningless per-character diffs.
    const { topic: prevTopic, ...prevRest } = state.settings;
    const { topic: nextTopic, ...nextRest } = { ...state.settings, ...updates };
    logFieldChanges('settings', 'Conversation Settings', prevRest, nextRest);
    setState((prev) => ({ ...prev, settings: { ...prev.settings, ...updates } }));
  }

  const exchangesField = useInfinityField(state.settings.maxExchanges, (v) =>
    updateSettings({ maxExchanges: v })
  );
  const tokensField = useInfinityField(state.settings.maxTokens, (v) =>
    updateSettings({ maxTokens: v })
  );

  /**
   * Propagates the agent roster — identity fields AND which LLM connection
   * each agent is assigned — to every OTHER open tab's persisted
   * conversation. `active` (which agents are participating) is the one
   * thing that stays per-tab: activating/deactivating an agent in one tab
   * must not flip its participation everywhere else, so each target tab's
   * own `active` value is preserved rather than overwritten. Fire-and-
   * forget — never blocks the caller, never touches `archives` (an archive
   * is a frozen historical snapshot, not a live tab).
   */
  async function syncAgentIdentityAcrossTabs(nextAgents: Agent[]) {
    const nextNumber = state.nextAgentNumber;
    for (const tab of tabs) {
      if (tab.id === state.id) continue;
      const loaded = await loadConversation(tab.id);
      if (!loaded) continue;
      // UNION merge — never a replacement. Previously this mapped over the
      // current tab's agents only, which meant any agent that existed in the
      // target tab but NOT in the current one (e.g. the current tab's
      // in-memory roster was stale and predated an agent added elsewhere) was
      // silently overwritten and erased the moment any agent edit/reorder/
      // add/delete ran here. Reported as agents "disappearing without being
      // deleted". Now: keep target-tab agents that aren't in the source
      // (unchanged), apply the source's shared identity to agents present in
      // both while preserving the target tab's OWN `active` flag (active is
      // per-tab by design), and append source agents that are new to target.
      const sourceById = new Map(nextAgents.map((a) => [a.id, a]));
      const seen = new Set<string>();
      const mergedAgents: Agent[] = loaded.agents.map((existing) => {
        seen.add(existing.id);
        const src = sourceById.get(existing.id);
        // active is shared roster identity (comes from src); participant is
        // per-conversation (who joins THIS tab's rounds) so preserve the
        // target tab's own value.
        return src ? { ...src, participant: existing.participant } : existing;
      });
      for (const src of nextAgents) {
        if (!seen.has(src.id)) mergedAgents.push({ ...src });
      }
      await saveConversation({
        ...loaded,
        agents: mergedAgents,
        nextAgentNumber: Math.max(loaded.nextAgentNumber, nextNumber),
      });
    }
  }

  function saveAgent(id: string, updates: Partial<Agent>) {
    const before = state.agents.find((a) => a.id === id);
    if (before) {
      logFieldChanges('agent', `${before.refNumber} ${before.name}`, before, {
        ...before,
        ...updates,
      });
    }
    const nextAgents = state.agents.map((a) => (a.id === id ? { ...a, ...updates } : a));
    setState((prev) => ({
      ...prev,
      agents: prev.agents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    }));
    void syncAgentIdentityAcrossTabs(nextAgents);
    const updated = { ...state.agents.find((a) => a.id === id), ...updates } as Agent;
    // Renaming must update the existing library entry in place — upserting
    // straight under the new name would create a fresh entry and silently
    // orphan the old one along with its assigned categories.
    if (before && updates.name && updates.name !== before.name) {
      renameCustomAgent(before.name, updated.name);
    }
    const existingCategories =
      loadCustomAgents().find((p) => p.name.trim().toLowerCase() === updated.name.trim().toLowerCase())
        ?.categories ?? [];
    upsertCustomAgent({
      name: updated.name,
      role: updated.role,
      instructions: updated.instructions,
      color: updated.color,
      categories: existingCategories,
    });
    showToast('✅ Agent settings saved!');
  }

  function updateAgentsBulk(nextAgents: Agent[]) {
    setState((prev) => ({ ...prev, agents: nextAgents }));
    void syncAgentIdentityAcrossTabs(nextAgents);
  }

  /** Reorders agents and renumbers Agt## sequentially to match the new order. */
  function reorderAgents(nextAgents: Agent[]) {
    const renumbered = nextAgents.map((a, i) => ({ ...a, refNumber: `Agt${i + 1}` }));
    setState((prev) => ({ ...prev, agents: renumbered }));
    void syncAgentIdentityAcrossTabs(renumbered);
  }

  function addAgent() {
    const refNumber = `Agt${state.nextAgentNumber}`;
    const newAgent: Agent = {
      id: generateId(),
      refNumber,
      name: `Agent ${state.agents.length + 1}`,
      role: '',
      instructions: '',
      identity: '',
      skills: '',
      loopGuidance: '',
      description: '',
      color: '#8e44ad',
      llmProvider: 'openai',
      connectionId: null,
      active: true, participant: true,
      pinnedToAllConversations: false,
      webSearchEnabled: false, chartEnabled: false,
      voiceURI: null,
      googleVoiceName: null,
      traits: {},
    };
    setState((prev) => ({
      ...prev,
      agents: [...prev.agents, newAgent],
      nextAgentNumber: prev.nextAgentNumber + 1,
    }));
    void syncAgentIdentityAcrossTabs([...state.agents, newAgent]);
    setCurrentAgentId(newAgent.id);
    upsertCustomAgent({
      name: newAgent.name,
      role: newAgent.role,
      instructions: newAgent.instructions,
      color: newAgent.color,
    });
    showToast(`➕ New agent added (${refNumber})`);
  }

  /** One-click duplicate: deep-clones an agent with a fresh id/refNumber and a
   * "(copy)" name suffix, inserted right after the original. Shares the same
   * connection/identity/traits so it's immediately usable, then the user can
   * tweak. `active` starts true so the duplicate joins the current roster. */
  function duplicateAgent(id: string) {
    const src = state.agents.find((a) => a.id === id);
    if (!src) return;
    // Strip any existing " #N" suffix to find the root name, then number the
    // clone as the next in the series (Maya → Maya #2 → Maya #3 …) so each
    // duplicate is distinct and traceable to its original.
    const base = src.name.replace(/\s*#\d+$/, '').trim() || src.name;
    const existingCount = state.agents.filter((a) => {
      const b = a.name.replace(/\s*#\d+$/, '').trim() || a.name;
      return b === base;
    }).length;
    const refNumber = `Agt${state.nextAgentNumber}`;
    const clone: Agent = {
      ...src,
      id: generateId(),
      refNumber,
      name: `${base} #${existingCount + 1}`,
      traits: { ...src.traits },
      active: true, participant: true,
    };
    const insertAt = state.agents.findIndex((a) => a.id === id);
    const nextAgents =
      insertAt === -1
        ? [...state.agents, clone]
        : [...state.agents.slice(0, insertAt + 1), clone, ...state.agents.slice(insertAt + 1)];
    setState((prev) => ({
      ...prev,
      agents: nextAgents,
      nextAgentNumber: prev.nextAgentNumber + 1,
    }));
    void syncAgentIdentityAcrossTabs(nextAgents);
    setCurrentAgentId(clone.id);
    showToast(`⧉ Duplicated “${base}” → ${clone.name} (${refNumber})`);
  }

  function addAgentFromPreset(preset: AgentPreset) {
    const refNumber = `Agt${state.nextAgentNumber}`;
    const newAgent: Agent = {
      id: generateId(),
      refNumber,
      name: preset.name,
      role: preset.role,
      instructions: preset.instructions,
      identity: '',
      skills: '',
      loopGuidance: '',
      description: '',
      color: preset.color,
      llmProvider: 'openai',
      connectionId: null,
      active: true, participant: true,
      pinnedToAllConversations: false,
      webSearchEnabled: false, chartEnabled: false,
      voiceURI: null,
      googleVoiceName: null,
      traits: {},
    };
    setState((prev) => ({
      ...prev,
      agents: [...prev.agents, newAgent],
      nextAgentNumber: prev.nextAgentNumber + 1,
    }));
    void syncAgentIdentityAcrossTabs([...state.agents, newAgent]);
    setCurrentAgentId(newAgent.id);
    upsertCustomAgent(preset);
    showToast(`➕ Added ${preset.name} (${refNumber})`);
  }

  function deleteAgent(id: string) {
    if (state.agents.length <= 1) return;
    // The agent roster is shared across tabs (see syncAgentIdentityAcrossTabs)
    // — deleting here removes it from every open tab, not just this one.
    // Its definition still stays in the agent library (custom-agents.ts) so
    // it can be re-added later.
    const nextAgents = state.agents.filter((a) => a.id !== id);
    setState((prev) => ({ ...prev, agents: prev.agents.filter((a) => a.id !== id) }));
    void syncAgentIdentityAcrossTabs(nextAgents);
    if (currentAgentId === id) {
      setCurrentAgentId(state.agents.find((a) => a.id !== id)?.id ?? '');
    }
    showToast('🗑️ Agent deleted');
  }

  function agentById(id: string): Agent | undefined {
    return state.agents.find((a) => a.id === id);
  }

  function messageById(id: string): Message | undefined {
    return allMessages.find((m) => m.id === id);
  }

  function authorLabel(agentId: string): string {
    if (agentId === 'user') return 'You';
    const agent = agentById(agentId);
    return agent ? `${agent.refNumber} · ${agent.name}` : 'Unknown';
  }

  // Derived notifications — recomputed every render, so they auto-clear the
  // moment the underlying issue is fixed (e.g. a Wiki Keeper gets picked).
  // Each carries a deep-link action that opens Settings straight to the
  // relevant tab.
  type AppNotification = {
    id: string;
    icon: string;
    title: string;
    body: string;
    openTab: 'agent' | 'llm' | 'audio' | 'display' | 'wiki' | 'archives' | 'log' | 'account';
  };
  const notifications: AppNotification[] = useMemo(() => {
    const list: AppNotification[] = [];
    if (state.settings.wikiEnabled && !state.settings.wikiKeeperConnectionId) {
      list.push({
        id: 'wiki-no-keeper',
        icon: '📚',
        title: 'Wiki has no Keeper',
        body: 'The shared wiki is on but no connection generates it — pick a Wiki Keeper so agents can reference past conversations.',
        openTab: 'wiki',
      });
    }
    const unconnectedActive = state.agents.filter(
      (a) => a.active && !a.connectionId && !connections.some((c) => c.id === a.connectionId)
    );
    if (unconnectedActive.length > 0) {
      list.push({
        id: 'agents-no-llm',
        icon: '🔌',
        title: `${unconnectedActive.length} active agent${unconnectedActive.length === 1 ? '' : 's'} ha${unconnectedActive.length === 1 ? 's' : 've'} no LLM`,
        body: 'These agents can’t speak live until a connection is assigned.',
        openTab: 'llm',
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.settings.wikiEnabled, state.settings.wikiKeeperConnectionId, state.agents, connections]);

  function openSettingsToTab(tab: AppNotification['openTab']) {
    setSettingsInitialTab(tab);
    setModalReturnTo(null);
    setActiveModal('settings');
    setNotificationsOpen(false);
  }

  return (
    <div className="app-shell">
      <div className="conversation-tabs-bar" {...devRef('s24')}>
        <button
          className={`icon-btn params-toggle ${topPanelOpen ? 'active' : ''}`}
          {...devRef('b5')}
          onClick={() => setTopPanelOpen((v) => !v)}
          title={topPanelOpen ? 'Close parameters (topic/search/participants/controls)' : 'Open parameters (topic/search/participants/controls)'}
        >
          ☰
        </button>
        <div className="conversation-tabs-list">
          {(() => {
            // Cluster tabs by group/category (ungrouped last), inserting a
            // small label divider whenever the group changes — purely a
            // display grouping, doesn't reorder anything persisted beyond
            // this render pass.
            const grouped = [...tabs].sort((a, b) => {
              const ca = a.category ?? '';
              const cb = b.category ?? '';
              if (ca === cb) return 0;
              if (!ca) return 1;
              if (!cb) return -1;
              return ca.localeCompare(cb);
            });
            let lastCategory: string | null | undefined;
            return grouped.map((t, ti) => {
              const showDivider = t.category !== lastCategory;
              lastCategory = t.category;
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center' }}>
                  {showDivider && (
                    <span className="conversation-tab-group-label">{t.category ?? 'Ungrouped'}</span>
                  )}
                  <div
                    className={`conversation-tab ${t.id === state.id ? 'active' : ''}`}
                    {...devRef('b69', ti)}
                    onClick={() => switchTab(t.id)}
                    onDoubleClick={() => renameTab(t.id)}
                    title={`${t.title}${t.category ? ` (${t.category})` : ''} — double-click to rename`}
                  >
                    <span className="conversation-tab-title">{t.title}</span>
                    <button
                      className="conversation-tab-group-btn"
                      {...devRef('b76', ti)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setTabCategory(t.id);
                      }}
                      title="Set this tab's group/category"
                    >
                      🏷️
                    </button>
                    <button
                      className="conversation-tab-close"
                      {...devRef('b70', ti)}
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(t.id);
                      }}
                      title="Close this conversation tab"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            });
          })()}
          <button className="conversation-tab-add" {...devRef('b68')} onClick={addTab} title="New conversation tab">
            +
          </button>
        </div>

        <div className="conversation-tabs-icons" {...devRef('s1')}>
          <button
            className="icon-btn"
            {...devRef('b67')}
            onClick={() => {
              saveConversation(state);
              showToast('💾 Conversation saved');
            }}
            title="Save conversation now"
          >
            💾
          </button>
          {state.settings.maxExchanges != null &&
            (() => {
              const latestThread = state.threads[state.threads.length - 1];
              const remaining = latestThread
                ? Math.max(state.settings.maxExchanges! - agentExchangeCount(latestThread), 0)
                : state.settings.maxExchanges;
              return (
                <>
                  <span className="icon-badge" title="Agent replies remaining before the exchange limit is hit">
                    🔢 {remaining}
                  </span>
                  <button
                    className="icon-badge"
                    {...devRef('b63')}
                    title="Extend the exchange limit by 10, even mid-conversation"
                    onClick={() => extendExchanges(10)}
                  >
                    ➕10
                  </button>
                </>
              );
            })()}
          <button
            className={`icon-btn ${freezeScroll ? 'active' : ''}`}
            {...devRef('b62')}
            title={
              freezeScroll
                ? 'Scroll is frozen — new messages will not pull the view down'
                : 'Freeze scroll position so new incoming messages do not auto-scroll the view'
            }
            onClick={() => setFreezeScroll((v) => !v)}
          >
            {freezeScroll ? '🧊' : '❄️'}
          </button>
          <button
            className={`icon-btn ${sceneViewOpen ? 'active' : ''}`}
            {...devRef('b55')}
            title={sceneViewOpen ? 'Back to Thread View' : 'Open Scene View'}
            onClick={() => setSceneViewOpen((v) => !v)}
          >
            🎬
          </button>
          <button
            className={`icon-btn ${searchBarOpen ? 'active' : ''}`}
            {...devRef('b87')}
            onClick={() => setSearchBarOpen((v) => !v)}
            title={searchBarOpen ? 'Hide search' : 'Search this discussion'}
          >
            🔎
          </button>
          <button
            className="icon-btn"
            {...devRef('b1')}
            onClick={() => setShowAudioRail((v) => !v)}
            title="Toggle audio rail"
          >
            🔊
          </button>
          <button
            className="icon-btn"
            {...devRef('b2')}
            onClick={cycleTheme}
            title={`Theme: ${theme} (click to cycle)`}
          >
            {THEME_ICONS[theme]}
          </button>
          <button
            className={`icon-btn ${devMode ? 'active' : ''}`}
            {...devRef('b3')}
            onClick={() => setDevMode((v) => !v)}
            title="Dev Mode: show a unique reference code on every section/feature/button/field"
          >
            🛠️
          </button>
          <div className="notifications-wrap" ref={notificationsMenuRef}>
            <button
              className={`icon-btn notifications-btn ${notifications.length > 0 ? 'has-notifs' : ''} ${notificationsOpen ? 'active' : ''}`}
              onClick={() => setNotificationsOpen((v) => !v)}
              title="Notifications"
            >
              🔔
              {notifications.length > 0 && (
                <span className="notif-badge">{notifications.length}</span>
              )}
            </button>
            {notificationsOpen && (
              <div className="notifications-dropdown">
                <div className="notifications-header">Notifications</div>
                {notifications.length === 0 ? (
                  <div className="notifications-empty">You’re all caught up ✅</div>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      className="notif-row"
                      onClick={() => openSettingsToTab(n.openTab)}
                    >
                      <span className="notif-icon">{n.icon}</span>
                      <span className="notif-text">
                        <span className="notif-title">{n.title}</span>
                        <span className="notif-body">{n.body}</span>
                        <span className="notif-action">Take me there →</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <button
            className="icon-btn"
            {...devRef('b4')}
            onClick={() => {
              setSettingsInitialTab(null);
              setModalReturnTo(null);
              setActiveModal('settings');
            }}
            title="Settings (Agents, LLMs, Audio, Archives, Account)"
          >
            ⚙️
          </button>
          <span
            className="app-version"
            title={`Built from commit ${BUILD_COMMIT} (#${BUILD_COMMIT_COUNT})${BUILD_VERSION ? ` · v${BUILD_VERSION}` : ''}`}
          >
            v{BUILD_VERSION} · {BUILD_COMMIT}
          </span>
        </div>
      </div>

      {/* Rendered right at the top, outside `.top-panel-collapsible`, so
          search stays reachable even when Parameters is collapsed. */}
      {searchBarOpen && (
        <div className="search-bar" {...devRef('s4')}>
          <input
            type="text"
            className="select-input"
            {...devRef('i3')}
            style={{ flex: 1 }}
            autoFocus
            placeholder="🔎 Search discussion... (filters live as you type)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {(searchQuery || filterStarredOnly || filterCategory) && (
            <span className="search-result-count" {...devRef('s26')}>
              {visibleThreads.reduce((n, t) => n + t.messages.length, 0)} found
            </span>
          )}
          <label className="control-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="checkbox"
              {...devRef('ck2')}
              checked={filterStarredOnly}
              onChange={(e) => setFilterStarredOnly(e.target.checked)}
            />
            ⭐ Starred only
          </label>
          <select
            className="select-input"
            {...devRef('dr1')}
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {messageCategories.map((c) => (
              <option key={c} value={c}>
                🏷️ {c}
              </option>
            ))}
          </select>
          {(searchQuery || filterStarredOnly || filterCategory) && (
            <button
              className="btn-icon"
              {...devRef('b14')}
              onClick={() => {
                setSearchQuery('');
                setFilterStarredOnly(false);
                setFilterCategory('');
              }}
              title="Clear filters"
            >
              ×
            </button>
          )}
        </div>
      )}

      {closingTabId && (
        <div className="modal-overlay active" onClick={() => setClosingTabId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <span className="modal-title">
                Close &quot;{tabs.find((t) => t.id === closingTabId)?.title ?? 'this conversation'}&quot;?
              </span>
              <button className="modal-close" {...devRef('b77')} onClick={() => setClosingTabId(null)}>
                ×
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn-primary" {...devRef('b71')} onClick={() => finishCloseTab(closingTabId, 'save')}>
                💾 Save & Close
              </button>
              <button
                className="btn-secondary"
                {...devRef('b72')}
                onClick={() => finishCloseTab(closingTabId, 'discard')}
              >
                🗑️ Discard & Close
              </button>
              <button className="btn-secondary" {...devRef('b73')} onClick={() => setClosingTabId(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {topPanelOpen && (
        <div className="top-panel-backdrop" {...devRef('s9')} onClick={() => setTopPanelOpen(false)} />
      )}
      <div className={`top-panel-collapsible ${topPanelOpen ? 'open' : ''}`}>
      <div className="top-panel-inner">
      <div className="header" {...devRef('s3')}>
        <div className="header-left">
          <div className="topic-field-wrap">
            {topicExpanded ? (
              <textarea
                className="select-input topic-textarea"
                {...devRef('t1')}
                placeholder="Discussion topic (e.g. Should AI regulation be global?)"
                value={state.settings.topic}
                onChange={(e) => updateSettings({ topic: e.target.value })}
              />
            ) : (
              <input
                type="text"
                className="select-input"
                {...devRef('i1')}
                style={{ minWidth: 220, flex: 1 }}
                placeholder="Discussion topic (e.g. Should AI regulation be global?)"
                value={state.settings.topic}
                onChange={(e) => updateSettings({ topic: e.target.value })}
              />
            )}
            <button
              type="button"
              className="btn-icon"
              {...devRef('b6')}
              title={topicExpanded ? 'Collapse' : 'Expand to full text'}
              onClick={() => setTopicExpanded((v) => !v)}
            >
              {topicExpanded ? '🗕' : '🗖'}
            </button>
          </div>
          {/* Agent communication mode — Natural language vs Structured A2A,
              with a secondary Display control (Readable/Raw) when A2A is on.
              Persists globally + per-conversation. Accessible (labelled,
              keyboard-operable <select>s are used inside). */}
          <div className="moods-menu-wrap" ref={commMenuRef}>
            <button
              className="control-btn"
              aria-haspopup="true"
              aria-expanded={commMenuOpen}
              onClick={() => setCommMenuOpen((v) => !v)}
              title="How agents communicate and how it's displayed"
            >
              {effectiveCommunicationMode(state.settings.communicationMode) === 'a2a' ? '🧬 A2A' : '💬 NL'} ▾
            </button>
            {commMenuOpen && (
              <div
                className="moods-menu comm-menu"
                role="group"
                aria-label="Agent communication"
                style={(() => {
                  const rect = commMenuRef.current?.getBoundingClientRect();
                  if (!rect) return undefined;
                  return {
                    position: 'fixed' as const,
                    top: rect.bottom + 4,
                    left: rect.left,
                  };
                })()}
              >
                <label className="comm-menu-row">
                  <span>Agent communication</span>
                  <select
                    aria-label="Agent communication mode"
                    value={effectiveCommunicationMode(state.settings.communicationMode)}
                    onChange={(e) => {
                      const mode = e.target.value as 'natural_language' | 'a2a';
                      saveGlobalCommunicationMode(mode);
                      updateSettings({ communicationMode: mode });
                    }}
                  >
                    <option value="natural_language">💬 Natural language</option>
                    <option value="a2a">🧬 Structured A2A</option>
                  </select>
                </label>
                {effectiveCommunicationMode(state.settings.communicationMode) === 'a2a' && (
                  <label className="comm-menu-row">
                    <span>Display</span>
                    <select
                      aria-label="A2A display mode"
                      value={effectiveA2ADisplayMode(state.settings.a2aDisplayMode)}
                      onChange={(e) => {
                        const d = e.target.value as 'natural_language' | 'a2a_readable' | 'a2a_raw';
                        saveGlobalA2ADisplayMode(d);
                        updateSettings({ a2aDisplayMode: d });
                      }}
                    >
                      <option value="a2a_readable">Readable</option>
                      <option value="a2a_raw">Raw protocol</option>
                      <option value="natural_language">Natural language only</option>
                    </select>
                  </label>
                )}
                <p className="comm-menu-hint">
                  Internal mode controls how agents exchange messages. Display controls what you see.
                </p>
              </div>
            )}
          </div>
          <div className="moods-menu-wrap" ref={moodsMenuRef}>
            <button
              className="control-btn"
              {...devRef('b7')}
              onClick={() => {
                // Reload on open (not just once on mount) so moods added in
                // another tab/session appear here without a page reload, and
                // so the catalog never silently desyncs from localStorage.
                setCustomMoods(loadCustomMoods());
                setMoodsMenuOpen((v) => !v);
              }}
              title="Select one or more discussion moods to blend"
            >
              🎭 Moods ({state.settings.moods.length}) ▾
            </button>
            {moodsMenuOpen && (
              <div
                className="moods-menu"
                // Fixed + viewport-anchored (not the default absolute-under-wrap)
                // so this popover isn't clipped when it's opened from inside the
                // parameters drawer, which scrolls its own overflow.
                style={(() => {
                  const rect = moodsMenuRef.current?.getBoundingClientRect();
                  if (!rect) return undefined;
                  return {
                    position: 'fixed' as const,
                    top: rect.bottom + 4,
                    left: rect.left,
                    maxHeight: Math.max(160, window.innerHeight - rect.bottom - 16),
                  };
                })()}
              >
                <input
                  type="text"
                  className="control-input"
                  {...devRef('i2')}
                  autoFocus
                  placeholder="Filter or add a new mood…"
                  value={moodFilter}
                  onChange={(e) => setMoodFilter(e.target.value)}
                />
                {(() => {
                  const allMoods: { key: string; name: string; custom: CustomMood | null }[] = [
                    ...BUILTIN_MOODS.map((name) => ({ key: name, name, custom: null })),
                    ...customMoods.map((m) => ({ key: m.id, name: m.name, custom: m })),
                  ];
                  // Reconcile orphan selections: a mood name present in this
                  // conversation's settings.moods but NOT in the catalog
                  // (carried over from a legacy single-mood migration, or from
                  // a custom mood that was since deleted) used to be COUNTED in
                  // the header "(N)" badge but never rendered as a row — so it
                  // couldn't be unchecked. Fold those names in here so every
                  // selected mood is visible and removable.
                  const seenNames = new Set(allMoods.map((m) => m.name.toLowerCase()));
                  for (const name of state.settings.moods) {
                    if (!seenNames.has(name.toLowerCase())) {
                      allMoods.push({ key: `orphan:${name}`, name, custom: null });
                      seenNames.add(name.toLowerCase());
                    }
                  }
                  const q = moodFilter.trim().toLowerCase();
                  const filtered = allMoods.filter((m) => !q || m.name.toLowerCase().includes(q));
                  const exactMatch = allMoods.some((m) => m.name.toLowerCase() === q);
                  return (
                    <>
                      <div className="moods-menu-list">
                        {filtered.map((m) => (
                          <div key={m.key} className="moods-menu-row">
                            <label>
                              <input
                                type="checkbox"
                                {...devRef('ck1')}
                                checked={state.settings.moods.includes(m.name)}
                                onChange={() => {
                                  const has = state.settings.moods.includes(m.name);
                                  updateSettings({
                                    moods: has
                                      ? state.settings.moods.filter((x) => x !== m.name)
                                      : [...state.settings.moods, m.name],
                                  });
                                }}
                              />
                              {m.name}
                            </label>
                            {m.custom && (
                              <span className="moods-menu-actions">
                                <button
                                  className="btn-icon"
                                  {...devRef('b8')}
                                  title="Rename"
                                  onClick={() => {
                                    const next = window.prompt('Rename mood:', m.name);
                                    if (!next?.trim() || next.trim() === m.name) return;
                                    const oldName = m.name;
                                    const trimmedNext = next.trim();
                                    setCustomMoods(renameCustomMood(m.custom!.id, trimmedNext));
                                    if (state.settings.moods.includes(oldName)) {
                                      updateSettings({
                                        moods: state.settings.moods.map((x) =>
                                          x === oldName ? trimmedNext : x
                                        ),
                                      });
                                    }
                                  }}
                                >
                                  ✏️
                                </button>
                                <button
                                  className="btn-icon delete"
                                  {...devRef('b9')}
                                  title="Delete"
                                  onClick={() => {
                                    setCustomMoods(deleteCustomMood(m.custom!.id));
                                    if (state.settings.moods.includes(m.name)) {
                                      updateSettings({
                                        moods: state.settings.moods.filter((x) => x !== m.name),
                                      });
                                    }
                                  }}
                                >
                                  🗑️
                                </button>
                              </span>
                            )}
                          </div>
                        ))}
                        {filtered.length === 0 && (
                          <div className="moods-menu-empty">No moods match.</div>
                        )}
                      </div>
                      {q && !exactMatch && (
                        <button
                          className="control-btn"
                          {...devRef('b10')}
                          onClick={() => {
                            setCustomMoods(addCustomMood(q));
                            updateSettings({ moods: [...state.settings.moods, moodFilter.trim()] });
                            setMoodFilter('');
                          }}
                        >
                          + Add "{moodFilter.trim()}" as a new mood
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
        <div className="header-right">
          <button
            className="icon-btn"
            {...devRef('b11')}
            onClick={() => {
              setModalReturnTo(null);
              setActiveModal('library');
            }}
          >
            📚 Library
          </button>
          <button className="icon-btn" {...devRef('b12')} onClick={() => setActiveModal('analytics')}>
            📊 Analytics
          </button>
          <button className="icon-btn" {...devRef('b13')} onClick={() => setActiveModal('export')}>
            📥 Export
          </button>
        </div>
      </div>

      <div className="participants-bar" {...devRef('s5')}>
        <span className="control-label">Participants:</span>
        {noActiveParticipants ? (
          <>
            <span style={{ opacity: 0.8, fontSize: 13 }}>Pick a category to activate its agents:</span>
            {[...new Set([...AGENT_LIBRARY.map((c) => c.name), ...participantsCustomCategories.map((c) => c.name)])].map(
              (category, ci) => {
                const count = state.agents.filter((a) => categoriesForParticipant(a.name).includes(category)).length;
                if (count === 0) return null;
                return (
                  <button
                    key={category}
                    className="control-btn"
                    {...devRef('b88', ci)}
                    onClick={() =>
                      setState((prev) => ({
                        ...prev,
                        agents: prev.agents.map((a) =>
                          categoriesForParticipant(a.name).includes(category) ? { ...a, active: true } : a
                        ),
                      }))
                    }
                    title={`Activate every agent in "${category}" — everyone else stays out of this conversation`}
                  >
                    🏷️ {category} ({count})
                  </button>
                );
              }
            )}
          </>
        ) : (
          state.agents
          .filter((agent) => chipBarShowAll || agent.participant)
          .map((agent) => {
            const connected = agentIsConnected(agent);
            return (
              <button
                key={agent.id}
                {...devRef('b15', agent.id)}
                // Every agent always renders here, in stable state.agents
                // order — only styling (not presence/position) reflects
                // participant/connected, so toggling one never reflows/reorders
                // its neighbors.
                className={`participant-chip ${connected ? 'active' : 'disconnected'} ${
                  !agent.participant ? 'inactive' : ''
                }`}
                style={{ borderColor: agent.color }}
                onClick={() => {
                  if (chipClickTimeoutRef.current) {
                    clearTimeout(chipClickTimeoutRef.current);
                    chipClickTimeoutRef.current = null;
                    return;
                  }
                  chipClickTimeoutRef.current = setTimeout(() => {
                    toggleAgentActive(agent.id);
                    chipClickTimeoutRef.current = null;
                  }, 250);
                }}
                onDoubleClick={() => {
                  if (chipClickTimeoutRef.current) {
                    clearTimeout(chipClickTimeoutRef.current);
                    chipClickTimeoutRef.current = null;
                  }
                  setCurrentAgentId(agent.id);
                  setModalReturnTo(null);
                  setActiveModal('settings');
                }}
                title={
                  !connected
                    ? `${agent.refNumber} has no LLM connected — assign one in 🔌 LLMs (double-click to open Settings)`
                    : agent.participant
                    ? 'Click to remove from this conversation, double-click to open Settings'
                    : 'Click to add to this conversation, double-click to open Settings'
                }
              >
                <span className="participant-dot" style={{ background: agent.color }} />
                {agent.refNumber} {agent.name}
                {!connected && ' ⚠'}
              </button>
            );
          })
        )}
        {!noActiveParticipants && state.agents.some((a) => !a.participant) && (
          <button
            className="control-btn"
            {...devRef('b86')}
            onClick={() => setChipBarShowAll((v) => !v)}
            title={chipBarShowAll ? 'Collapse to active participants only' : 'Show deactivated agents too'}
          >
            {chipBarShowAll
              ? '▲ Active only'
              : `▼ +${state.agents.filter((a) => !a.participant).length} inactive`}
          </button>
        )}
        <button
          className="control-btn"
          {...devRef('b75')}
          onClick={() =>
            setState((prev) => ({ ...prev, agents: prev.agents.map((a) => ({ ...a, participant: false })) }))
          }
          title="Remove every agent from this conversation's rounds"
        >
          🚫 Remove All
        </button>
        <div className="participants-menu-wrap" ref={participantsMenuRef}>
          <button
            className="control-btn"
            {...devRef('b16')}
            onClick={() => setParticipantsMenuOpen((v) => !v)}
            title="Manage which agents are active in this session"
          >
            👥 Manage ({state.agents.filter((a) => a.participant).length}/{state.agents.length}) ▾
          </button>
          {participantsMenuOpen && (
            <div
              className="participants-menu"
              {...devRef('dr2')}
              // Fixed + viewport-anchored so this popover escapes the parameters
              // drawer's own scroll clipping instead of getting cut off by it.
              style={(() => {
                const rect = participantsMenuRef.current?.getBoundingClientRect();
                if (!rect) return undefined;
                return {
                  position: 'fixed' as const,
                  top: rect.bottom + 4,
                  left: rect.left,
                  maxHeight: Math.max(200, window.innerHeight - rect.bottom - 16),
                };
              })()}
            >
              <input
                type="text"
                className="control-input"
                autoFocus
                placeholder="Filter by name, role, category…"
                value={participantFilter}
                onChange={(e) => setParticipantFilter(e.target.value)}
                {...devRef('i4')}
              />
              {(() => {
                const allCategoryNames = [
                  ...AGENT_LIBRARY.map((c) => c.name),
                  ...participantsCustomCategories.map((c) => c.name),
                ];
                const q = participantFilter.trim().toLowerCase();
                // Only hide inactive agents when there's at least one active
                // one to show instead — a brand-new tab starts with nobody
                // active (see freshConversationWithCurrentAgents), and
                // filtering THAT down to active-only would show a
                // confusingly empty list instead of the full roster.
                const hasAnyActiveAgent = state.agents.some((a) => a.participant);
                const filtered = state.agents.filter((a) => {
                  if (!showInactiveParticipants && hasAnyActiveAgent && !a.participant) return false;
                  const categories = categoriesForParticipant(a.name);
                  if (
                    participantCategoryFilters.size > 0 &&
                    !categories.some((c) => participantCategoryFilters.has(c))
                  ) {
                    return false;
                  }
                  if (!q) return true;
                  return (
                    a.name.toLowerCase().includes(q) ||
                    a.role.toLowerCase().includes(q) ||
                    a.refNumber.toLowerCase().includes(q) ||
                    categories.some((c) => c.toLowerCase().includes(q))
                  );
                });
                return (
                  <>
                    {allCategoryNames.length > 0 && (
                      <div className="participants-menu-list" style={{ maxHeight: 100 }}>
                        {allCategoryNames.map((name, ci) => (
                          <label key={name} className="participants-menu-row" {...devRef('30b', ci)}>
                            <input
                              type="checkbox"
                              checked={participantCategoryFilters.has(name)}
                              onChange={() =>
                                setParticipantCategoryFilters((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(name)) next.delete(name);
                                  else next.add(name);
                                  return next;
                                })
                              }
                            />
                            <span>🏷️ {name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    <div className="participants-menu-actions">
                      <button
                        className="control-btn"
                        {...devRef('b17')}
                        onClick={() =>
                          setState((prev) => ({
                            ...prev,
                            agents: prev.agents.map((a) =>
                              filtered.some((f) => f.id === a.id) ? { ...a, active: true } : a
                            ),
                          }))
                        }
                      >
                        Activate all filtered
                      </button>
                      <button
                        className="control-btn"
                        {...devRef('b18')}
                        onClick={() =>
                          setState((prev) => ({
                            ...prev,
                            agents: prev.agents.map((a) =>
                              filtered.some((f) => f.id === a.id) ? { ...a, active: false } : a
                            ),
                          }))
                        }
                      >
                        Deactivate all filtered
                      </button>
                    </div>
                    <div className="participants-menu-actions">
                      <select
                        className="control-input"
                        {...devRef('32b')}
                        value={manageBulkConnectionId}
                        onChange={(e) => setManageBulkConnectionId(e.target.value)}
                      >
                        <option value="">Set LLM for filtered...</option>
                        {connections.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <button
                        className="control-btn"
                        {...devRef('32c')}
                        onClick={() => {
                          const connection = connections.find((c) => c.id === manageBulkConnectionId);
                          if (!connection) {
                            showToast('Pick an LLM to apply first.');
                            return;
                          }
                          setState((prev) => ({
                            ...prev,
                            agents: prev.agents.map((a) =>
                              filtered.some((f) => f.id === a.id)
                                ? { ...a, connectionId: connection.id, llmProvider: connection.provider }
                                : a
                            ),
                          }));
                          showToast(`Applied ${connection.label} to ${filtered.length} filtered agent(s).`);
                        }}
                      >
                        Apply
                      </button>
                    </div>
                    <div className="participants-menu-actions">
                      <button
                        className="control-btn"
                        {...devRef('b85')}
                        onClick={() => setShowInactiveParticipants((v) => !v)}
                      >
                        {showInactiveParticipants ? 'Show active only' : `Show all (${state.agents.length})`}
                      </button>
                    </div>
                    <div className="participants-menu-list">
                      {filtered.map((agent, fi) => {
                        const connected = agentIsConnected(agent);
                        return (
                          <label key={agent.id} className="participants-menu-row" {...devRef('32d', fi)}>
                            <input
                              type="checkbox"
                              checked={agent.participant}
                              onChange={() => toggleAgentActive(agent.id)}
                            />
                            <span
                              title={connected ? 'Connected to an LLM' : 'No LLM connected'}
                              style={{
                                display: 'inline-block',
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: connected ? '#2ecc71' : '#e74c3c',
                                flexShrink: 0,
                              }}
                            />
                            <span className="participant-dot" style={{ background: agent.color }} />
                            <span>
                              {agent.refNumber} {agent.name}
                            </span>
                          </label>
                        );
                      })}
                      {filtered.length === 0 && (
                        <div className="participants-menu-empty">No agents match that filter.</div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      <div className="controls-panel" {...devRef('s6')}>
        <div className="control-group">
          <span className="control-label">Response Style:</span>
          <select
            className="control-input"
            {...devRef('dr3')}
            style={{ width: 'auto' }}
            value={state.settings.responseStyle}
            onChange={(e) => updateSettings({ responseStyle: e.target.value as ResponseStyle })}
          >
            <option value="bullets">Bullet Points</option>
            <option value="sentences">N Sentences</option>
            <option value="detailed">More Detail</option>
            <option value="mindmap">Mind Map Outline</option>
          </select>
        </div>
        <div className="control-group">
          <span className="control-label">Interaction:</span>
          <select
            className="control-input"
            {...devRef('dr4')}
            style={{ width: 'auto' }}
            value={state.settings.interactionStyle}
            onChange={(e) => updateSettings({ interactionStyle: e.target.value as InteractionStyle })}
            title="Monologue: agents each deliver their own standalone statement. Dialogue: agents address and react to each other directly."
          >
            <option value="monologue">🗣️ Monologue</option>
            <option value="dialogue">💬 Engaging Dialogue</option>
          </select>
        </div>
        {state.settings.responseStyle === 'sentences' && (
          <div className="control-group">
            <span className="control-label">Sentences:</span>
            <input
              type="number"
              className="control-input"
              {...devRef('i5')}
              min={1}
              max={10}
              value={state.settings.maxSentences}
              onChange={(e) => updateSettings({ maxSentences: Number(e.target.value) || 1 })}
            />
          </div>
        )}
        {state.settings.responseStyle === 'bullets' && (
          <div className="control-group">
            <span className="control-label">Bullets:</span>
            <input
              type="number"
              className="control-input"
              {...devRef('i8')}
              min={1}
              max={10}
              title="How many bullet points each reply should have — stays at this value until you change it"
              value={state.settings.bulletCount}
              onChange={(e) => updateSettings({ bulletCount: Number(e.target.value) || 1 })}
            />
          </div>
        )}
        <div className="control-group">
          <span className="control-label">Exchanges:</span>
          <input
            type="text"
            inputMode="numeric"
            className="control-input"
            {...devRef('i6')}
            {...exchangesField}
          />
          {state.settings.maxExchanges != null && (
            <button
              className="control-btn"
              {...devRef('b19')}
              title="Extend the exchange limit by 10, even mid-conversation"
              onClick={() => extendExchanges(10)}
            >
              +10
            </button>
          )}
        </div>
        <div className="control-group">
          <span className="control-label">Tokens:</span>
          <input
            type="text"
            inputMode="numeric"
            className="control-input"
            {...devRef('i7')}
            {...tokensField}
          />
        </div>
        <div className="control-group">
          <input
            type="checkbox"
            id="orchestrator"
            {...devRef('ck3')}
            checked={state.settings.orchestratorEnabled}
            onChange={(e) => updateSettings({ orchestratorEnabled: e.target.checked })}
          />
          <label htmlFor="orchestrator" className="control-label">
            🔁 Auto Mode
          </label>
        </div>
        <div className="control-group">
          <input
            type="checkbox"
            id="repetitionGuard"
            checked={state.settings.repetitionGuardEnabled}
            onChange={(e) => updateSettings({ repetitionGuardEnabled: e.target.checked })}
          />
          <label htmlFor="repetitionGuard" className="control-label" title="If an agent's draft restates recent points, it's re-prompted once to elaborate on the same subject differently.">
            ↻ No-repeat guard
          </label>
        </div>
        <div className="control-group">
          <input
            type="checkbox"
            id="pauseOnTabSwitch"
            {...devRef('ck12')}
            checked={state.settings.pauseOnTabSwitch}
            onChange={(e) => updateSettings({ pauseOnTabSwitch: e.target.checked })}
          />
          <label htmlFor="pauseOnTabSwitch" className="control-label" title="When off, a tab you switch away from keeps generating in the background — its reply lands once it finishes, even after you've moved on.">
            ⏸️ Pause on tab switch
          </label>
        </div>
        <div className="control-group">
          {state.status === 'running' ? (
            <button className="control-btn" {...devRef('b20')} onClick={pauseConversation}>
              ⏸️ Pause
            </button>
          ) : (
            <button className="control-btn" {...devRef('b21')} onClick={playConversation}>
              ▶️ Play
            </button>
          )}
          <button className="control-btn" {...devRef('b22')} onClick={stopConversation}>
            ⏹️ Stop
          </button>
          <button className="control-btn" {...devRef('b23')} onClick={resetConversation}>
            🔄 Reset
          </button>
        </div>
        <div className="control-group">
          <span className="stats-badge">{allMessages.length} messages</span>
        </div>
        <div className="control-group">
          <span
            className="stats-badge"
            style={{
              background: liveMode ? '#d4f7dc' : liveMode === false ? '#fff3cd' : '#f0f0f0',
            }}
          >
            {liveMode === null
              ? 'Mode: not started'
              : liveMode
              ? '⚡ Live LLM replies'
              : '⚠️ No responses yet — connect an LLM'}
          </span>
        </div>
      </div>
      </div>
      </div>

      {/* One button, three states: idle/stopped -> Play (green), running -> Pause (amber), paused -> Stop (red). Each click advances to the next state. */}
      <button
        className={`floating-play-btn ${state.status === 'paused' ? 'stop-state' : state.status === 'running' ? 'pause-state' : ''}`}
        {...devRef('b78')}
        onClick={
          state.status === 'running'
            ? pauseConversation
            : state.status === 'paused'
            ? stopConversation
            : playConversation
        }
        title={
          state.status === 'running'
            ? 'Pause conversation'
            : state.status === 'paused'
            ? 'End conversation'
            : 'Play/resume conversation'
        }
      >
        {state.status === 'running' ? '⏸️' : state.status === 'paused' ? '⏹️' : '▶️'}
      </button>
      {/* "+10 exchanges" floating button — appears beside Resume when the
          exchange limit has been reached (messages "used up"), so the user
          can extend AND resume in one click. Always extends then resumes. */}
      {state.settings.maxExchanges != null
        && !withinLimits(state.threads[state.threads.length - 1])
        && state.status !== 'running'
        && (
          <button
            className="floating-play-btn extend-btn"
            {...devRef('b95')}
            title="Extend the exchange limit by 10 and resume"
            onClick={() => {
              const current = settingsRef.current.maxExchanges ?? 0;
              updateSettings({ maxExchanges: current + 10 });
              playConversation();
            }}
          >
            ➕10
          </button>
        )}

      {allMessages.length > 0 && !sceneViewOpen && (
        <div className="selection-action-bar" {...devRef('r1')}>
          {selectedMessageIds.length > 0 && <span>{selectedMessageIds.length} selected</span>}
          <button className="control-btn" {...devRef('b94')} onClick={toggleSelectAllMessages}>
            {selectedMessageIds.length > 0 &&
            visibleThreads.flatMap((t) => t.messages).every((m) => selectedMessageIds.includes(m.id))
              ? '☐ Deselect All'
              : '☑️ Select All'}
          </button>
          {selectedMessageIds.length > 0 && (
            <>
              <button className="control-btn" {...devRef('b79')} onClick={copySelectedMessages}>
                📋 Copy
              </button>
              <button className="control-btn" onClick={downloadSelectedMessages} title="Download the selected messages as a text file">
                📥 Download Selected
              </button>
              <button className="control-btn" {...devRef('b80')} onClick={shareSelectedToWhatsApp}>
                💬 Share to WhatsApp
              </button>
              <button className="control-btn" {...devRef('b81')} onClick={() => setSelectedMessageIds([])}>
                ✕ Clear
              </button>
            </>
          )}
          <button className="control-btn" onClick={downloadConversation} title="Download the whole conversation as a text file">
            📥 Download Conversation
          </button>
        </div>
      )}

      <div className="conversation-body" {...devRef('s7')}>
        {showAudioRail && (
          <>
            <div className="audio-rail-backdrop" onClick={() => setShowAudioRail(false)} />
            <AudioRail
              agents={state.agents}
              messages={allMessages}
              speakingMessageId={speaking?.messageId ?? null}
              onPlayFrom={playFromMessage}
              onStop={stopSpeaking}
            />
          </>
        )}
      {sceneViewOpen && (
        <SceneView
          agents={state.agents}
          traitDefs={traitDefs}
          messages={allMessages}
          thinking={new Map(Array.from(visibleThinking.entries()).map(([id, v]) => [id, v.threadId]))}
          postSpeechDelayMs={postSpeechDelayMs}
          onChangePostSpeechDelay={setPostSpeechDelayMs}
          onFeedback={(message, type) => handleFeedback(message.threadId, message.id, type)}
          onReaction={(message, type) => handleReaction(message.threadId, message, type)}
          onReply={(message) => setReplyingTo(message)}
          onToggleStarred={(message) => toggleStarred(message.threadId, message.id)}
          onSetCategory={(message) => setMessageCategory(message.threadId, message.id)}
          onShareWhatsApp={(message) => shareToWhatsApp(message.content)}
          spokenRange={speaking}
          onPlayFromMessageId={(id, charOffset) => {
            const idx = allMessages.findIndex((m) => m.id === id);
            if (idx >= 0) playFromMessage(idx, charOffset);
          }}
          onStopSpeaking={stopSpeaking}
          onClose={() => setSceneViewOpen(false)}
          defaultTextSize={state.settings.textSize}
        />
      )}
      <div
        className={`conversation-area text-${state.settings.textSize}`}
        ref={conversationAreaRef}
        {...devRef('s8')}
        style={sceneViewOpen ? { display: 'none' } : undefined}
      >
        {state.threads.length === 0 && (
          <div className="start-discussion">
            <button {...devRef('b82')} onClick={startDiscussion}>▶️ Start New Discussion</button>
          </div>
        )}

        {Array.from(visibleThinking.entries())
          .filter(([, v]) => v.threadId === 'pending')
          .map(([agentId, v]) => {
            const agent = agentById(agentId);
            return (
              <div className="thinking-indicator" key={agentId}>
                <span className="avatar" style={{ background: agent?.color ?? '#999' }}>
                  {(agent?.name ?? '?').charAt(0).toUpperCase()}
                </span>
                <span>
                  {agent ? `${agent.refNumber} ${agent.name}` : 'Agent'} is thinking
                  <span className="thinking-dots">
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                  </span>
                  <ElapsedTimer startedMs={v.startedMs} prefix=" · " />
                </span>
              </div>
            );
          })}

        {(searchQuery || filterStarredOnly || filterCategory) && visibleThreads.length === 0 && (
          <div className="empty-state">No messages match the current filters.</div>
        )}

        {visibleThreads.map((thread) => {
          const owner = agentById(thread.agentId);
          return (
            <div className="message-thread" key={thread.id}>
              <div className="thread-header">
                <div className="avatar" style={{ background: owner?.color ?? '#999' }}>
                  {(owner?.name ?? '?').charAt(0).toUpperCase()}
                </div>
                <div className="thread-info">
                  <div className="thread-title">
                    {owner ? `${owner.refNumber} · ${owner.name}` : 'Unknown agent'}
                  </div>
                  <div className="thread-timestamp">
                    Started {new Date(thread.createdAt).toLocaleString()}
                  </div>
                </div>
                <button className="control-btn" {...devRef('b83', thread.id)} onClick={() => handleNewThread(thread.agentId)}>
                  + New Thread
                </button>
              </div>

              {(() => {
                let shiftToggle = false;
                return thread.messages.map((msg, msgIndex) => {
                  if (msgIndex > 0 && thread.messages[msgIndex - 1].agentId !== msg.agentId) {
                    shiftToggle = !shiftToggle;
                  }
                  const isUser = msg.agentId === 'user';
                  const author = isUser ? null : agentById(msg.agentId);
                  const quoted = msg.replyToId ? messageById(msg.replyToId) : undefined;
                  const globalIndex = allMessages.findIndex((m) => m.id === msg.id);
                  const msgNumber = `Msg${String(globalIndex + 1).padStart(3, '0')}`;
                  const bubbleColor = isUser ? '#95ec69' : author?.color ?? '#999';
                  return (
                <div
                  className={`bubble-wrapper ${isUser ? 'user' : ''} ${shiftToggle ? 'speaker-shift' : ''} ${selectedMessageIds.includes(msg.id) ? 'selected' : ''} ${speaking?.messageId === msg.id ? 'speaking' : ''}`}
                  data-message-id={msg.id}
                  key={msg.id}
                >
                    <input
                      type="checkbox"
                      className="bubble-select-checkbox"
                      title="Select for bulk copy/share"
                      checked={selectedMessageIds.includes(msg.id)}
                      onChange={() => toggleMessageSelected(msg.id)}
                    />
                    <div
                      className="avatar"
                      style={{ background: bubbleColor }}
                    >
                      {isUser ? 'Y' : (author?.name ?? '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="bubble-content">
                      <div className="bubble-name">
                        {isUser ? 'You' : author ? `${author.refNumber} · ${author.name}` : 'Unknown'}
                        <span className="msg-number">{msgNumber}</span>
                        {!isUser &&
                          (() => {
                            const usedWeb = !!(msg.webSearches?.length || msg.webBrowses?.length);
                            // 🌐 = answer drew on real internet content;
                            // 🌐❌ = agent tried web access but it failed, so
                            // this answer is from training knowledge instead.
                            if (usedWeb)
                              return (
                                <span className="web-source-tag ok" title="Answer used live web content">
                                  🌐
                                </span>
                              );
                            if (msg.webAccessFailed)
                              return (
                                <span
                                  className="web-source-tag failed"
                                  title="Tried the web but it failed — answered from training knowledge"
                                >
                                  🌐❌
                                </span>
                              );
                            return null;
                          })()}
                        <span className="msg-timestamp">
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {msg.timing?.totalDurationMs != null && (
                          <span
                            className="msg-duration"
                            title={
                              msg.timing.firstTokenAt
                                ? `Time to first token: ${formatDuration(msg.timing.timeToFirstTokenMs)}\nGeneration: ${formatDuration(msg.timing.generationDurationMs)}\nTotal: ${formatDuration(msg.timing.totalDurationMs)}`
                                : `Total: ${formatDuration(msg.timing.totalDurationMs)}`
                            }
                          >
                            {msg.timing.failedAt ? 'failed in ' : '⏱ '}
                            {formatDuration(msg.timing.totalDurationMs)}
                          </span>
                        )}
                      </div>
                      {quoted && (
                        <div className="quoted-reply">
                          <span className="quoted-author">{authorLabel(quoted.agentId)}</span>
                          <span className="quoted-snippet">{quoted.content.slice(0, 80)}</span>
                        </div>
                      )}
                      <div
                        className="bubble-text"
                        style={{ borderLeft: `4px solid ${bubbleColor}` }}
                        onContextMenu={(e) => handleMessageContextMenu(e, msg.content)}
                        title="Right-click to copy, right-click again to paste"
                      >
                        <button
                          className="bubble-copy-btn"
                          {...devRef('b84', msg.id)}
                          title="Copy (selected text, or the whole message)"
                          onClick={() => copyMessageText(msg.content)}
                        >
                          📋
                        </button>
                        {msg.starred && <span className="bubble-star">⭐</span>}
                        {msg.category && <span className="bubble-category">🏷️ {msg.category}</span>}
                        {msg.webBrowses && msg.webBrowses.length > 0 && (
                          <div className="bubble-search-evidence" {...devRef('s31', msg.id)}>
                            <button
                              className="bubble-search-evidence-toggle"
                              onClick={() =>
                                setExpandedSearchMessageId((prev) => (prev === msg.id ? null : msg.id))
                              }
                            >
                              🌐 browsed {msg.webBrowses.length} page{msg.webBrowses.length === 1 ? '' : 's'}
                            </button>
                            {expandedSearchMessageId === msg.id && (
                              <div className="bubble-search-evidence-detail">
                                {msg.webBrowses.map((b, bi) => (
                                  <a
                                    key={bi}
                                    href={b.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="bubble-search-evidence-source"
                                    title={`Browsed at ${new Date(b.browsedAt).toLocaleTimeString()}`}
                                  >
                                    {b.url}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <MessageContent
                          content={msg.content}
                          spokenRange={
                            speaking?.messageId === msg.id
                              ? { charIndex: speaking.charIndex, charLength: speaking.charLength }
                              : null
                          }
                          searchQuery={searchQuery}
                        />
                        {/* Structured A2A rendering — driven by the user-facing
                            display mode and whether an envelope exists. NL-only
                            or old messages always render normally above. */}
                        {msg.a2aError && (
                          <div className="a2a-error" title="The structured envelope failed validation; the natural-language text is preserved.">
                            ⚠️ A2A envelope rejected: {msg.a2aError}
                          </div>
                        )}
                        {msg.a2aEnvelope && effectiveA2ADisplayMode(state.settings.a2aDisplayMode) !== 'natural_language' && (
                          <A2AReadableCard envelope={msg.a2aEnvelope} agentName={agentById(msg.agentId)?.name} />
                        )}
                        {msg.a2aEnvelope && effectiveA2ADisplayMode(state.settings.a2aDisplayMode) === 'a2a_raw' && (
                          <details className="a2a-raw">
                            <summary>Raw protocol envelope</summary>
                            <pre>{JSON.stringify(msg.a2aEnvelope, null, 2)}</pre>
                          </details>
                        )}
                        {msg.charts && msg.charts.length > 0 && (
                          <div className="bubble-charts">
                            {msg.charts.map((spec, ci) => (
                              <ChartRenderer key={ci} spec={spec} />
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="feedback-controls">
                        {(() => {
                          let n = 0;
                          const badge = () => ++n;
                          const isSpeaking = speaking !== null;
                          const isLoadingAudio = ttsLoadingMessageId === msg.id;
                          return (
                            <>
                              <button
                                className="feedback-btn"
                                title={
                                  isLoadingAudio
                                    ? `r${badge()}: Generating audio…`
                                    : isSpeaking
                                    ? `r${badge()}: Pause reading`
                                    : `r${badge()}: Read aloud from here`
                                }
                                onClick={() =>
                                  isSpeaking || isLoadingAudio
                                    ? stopSpeaking()
                                    : playFromMessage(allMessages.findIndex((m) => m.id === msg.id))
                                }
                              >
                                {isLoadingAudio ? '⏳' : isSpeaking ? '⏸️' : '▶️'}
                                <span className="reaction-badge">r{n}</span>
                              </button>
                              {(['like', 'dislike', 'clarify'] as Feedback[]).map((type) => (
                                <button
                                  key={type}
                                  className={`feedback-btn ${msg.feedback === type ? `active ${type}` : ''}`}
                                  title={`r${badge()}: ${type}`}
                                  onClick={() => handleFeedback(thread.id, msg.id, type)}
                                >
                                  {type === 'like' ? '👍' : type === 'dislike' ? '👎' : '🤔'}
                                  <span className="reaction-badge">r{n}</span>
                                </button>
                              ))}
                              <button
                                className="feedback-btn"
                                title={`r${badge()}: Reply to this message`}
                                onClick={() => setReplyingTo(msg)}
                              >
                                ↩️<span className="reaction-badge">r{n}</span>
                              </button>
                              {!isUser &&
                                AGENT_REACTIONS.map((r) => (
                                  <button
                                    key={r.type}
                                    className="feedback-btn"
                                    title={`r${badge()}: ${r.tooltip}`}
                                    onClick={() => handleReaction(thread.id, msg, r.type)}
                                  >
                                    {r.icon}
                                    <span className="reaction-badge">r{n}</span>
                                  </button>
                                ))}
                              {UNIVERSAL_REACTIONS.map((r) => (
                                <button
                                  key={r.type}
                                  className="feedback-btn"
                                  title={`r${badge()}: ${r.tooltip}`}
                                  onClick={() => handleReaction(thread.id, msg, r.type)}
                                >
                                  {r.icon}
                                  <span className="reaction-badge">r{n}</span>
                                </button>
                              ))}
                              <button
                                className={`feedback-btn ${msg.starred ? 'active' : ''}`}
                                title={`r${badge()}: Star for filtering`}
                                onClick={() => toggleStarred(thread.id, msg.id)}
                              >
                                {msg.starred ? '⭐' : '☆'}
                                <span className="reaction-badge">r{n}</span>
                              </button>
                              <button
                                className="feedback-btn"
                                title={`r${badge()}: Tag with a category`}
                                onClick={() => setMessageCategory(thread.id, msg.id)}
                              >
                                🏷️
                                <span className="reaction-badge">r{n}</span>
                              </button>
                              <button
                                className="feedback-btn"
                                title={`r${badge()}: Share (selected text, or the whole message) to WhatsApp`}
                                onClick={() => shareToWhatsApp(msg.content)}
                              >
                                💬📱
                                <span className="reaction-badge">r{n}</span>
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                  );
                });
              })()}
              {Array.from(visibleThinking.entries())
                .filter(([, v]) => v.threadId === thread.id)
                .map(([agentId, v]) => {
                  const agent = agentById(agentId);
                  return (
                    <div className="thinking-indicator" key={agentId}>
                      <span className="avatar" style={{ background: agent?.color ?? '#999' }}>
                        {(agent?.name ?? '?').charAt(0).toUpperCase()}
                      </span>
                      <span>
                        {agent ? `${agent.refNumber} ${agent.name}` : 'Agent'} is thinking
                        <span className="thinking-dots">
                          <span>.</span>
                          <span>.</span>
                          <span>.</span>
                        </span>
                        <ElapsedTimer startedMs={v.startedMs} prefix=" · " />
                      </span>
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
      </div>

      {replyingTo && (
        <div className="reply-preview">
          <div className="reply-preview-text">
            <span className="quoted-author">Replying to {authorLabel(replyingTo.agentId)}</span>
            <span className="quoted-snippet">{replyingTo.content.slice(0, 80)}</span>
          </div>
          <button className="btn-icon" onClick={() => setReplyingTo(null)}>
            ×
          </button>
        </div>
      )}

      <div className="quick-action-bar" {...devRef('s30')}>
        <button
          className="control-btn"
          {...devRef('b91')}
          onClick={nextSubject}
          disabled={state.status === 'stopped'}
          title="Move the discussion to a new subject"
        >
          🔀 Next Subject
        </button>
        <button
          className="control-btn"
          {...devRef('b92')}
          onClick={changeDirection}
          disabled={state.status === 'stopped'}
          title="Tell the agents you don't like the current direction and to change approach"
        >
          🚫 Change Direction
        </button>
        <button
          className="control-btn"
          {...devRef('b93')}
          onClick={continueElaborate}
          disabled={state.status === 'stopped'}
          title="Ask the agents to continue and go deeper on the current subject"
        >
          ▶️ Continue / Elaborate
        </button>
      </div>

      <div className="input-area" {...devRef('s9')}>
        <textarea
          ref={messageInputRef}
          className="message-input"
          rows={1}
          {...devRef('t2')}
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="Type message... (@Agt2 to ask only that agent — Shift+Enter for a new line)"
          disabled={state.status === 'stopped'}
        />
        <button
          className={`btn-icon mic-btn ${isListening ? 'listening' : ''}`}
          {...devRef('b24')}
          onClick={toggleDictation}
          disabled={state.status === 'stopped'}
          title={
            isListening
              ? 'Stop listening and send the transcribed message'
              : `Speak to dictate (recognized as ${state.settings.ttsLang}) — click again to stop and send`
          }
        >
          {isListening ? '🔴' : '🎤'}
        </button>
        <button className="send-btn" {...devRef('b25')} onClick={() => sendMessage()} disabled={state.status === 'stopped'}>
          Send
        </button>
      </div>

      <div className={`toast ${toastVisible ? 'show' : ''}`}>{toast}</div>

      {activeModal === 'settings' && (
        <SettingsModal
          agents={state.agents}
          currentAgentId={currentAgentId}
          initialTab={settingsInitialTab ?? undefined}
          connections={connections}
          onSelectAgent={setCurrentAgentId}
          onSave={saveAgent}
          onAdd={addAgent}
          onDelete={deleteAgent}
          onDuplicateAgent={duplicateAgent}
          onOpenLibrary={openLibraryFromSettings}
          onClose={() => {
            setSettingsInitialTab(null);
            setActiveModal(null);
          }}
          onToast={showToast}
          onChangeConnections={updateConnections}
          onUpdateAgentsBulk={updateAgentsBulk}
          onReorderAgents={reorderAgents}
          threads={state.threads}
          ttsRate={state.settings.ttsRate}
          ttsLang={state.settings.ttsLang}
          ttsProvider={state.settings.ttsProvider}
          googleTtsModel={state.settings.googleTtsModel}
          onUpdateTts={(updates) => updateSettings(updates)}
          archives={archives}
          onRestoreArchive={restoreArchive}
          onDeleteArchive={deleteArchive}
          onUpdateArchiveMeta={updateArchiveMeta}
          whatsappNumber={state.settings.whatsappNumber}
          onUpdateWhatsappNumber={(number) => updateSettings({ whatsappNumber: number })}
          guidelines={guidelines}
          onGuidelinesChange={setGuidelines}
          traitDefs={traitDefs}
          onTraitDefsChange={setTraitDefs}
          onUpdateAgentTraits={(id, traits) => {
            const nextAgents = state.agents.map((a) => (a.id === id ? { ...a, traits } : a));
            setState((prev) => ({
              ...prev,
              agents: prev.agents.map((a) => (a.id === id ? { ...a, traits } : a)),
            }));
            void syncAgentIdentityAcrossTabs(nextAgents);
          }}
          wikiEnabled={state.settings.wikiEnabled}
          wikiKeeperConnectionId={state.settings.wikiKeeperConnectionId ?? loadGlobalWikiKeeper()}
          wikiRefreshInterval={state.settings.wikiRefreshInterval}
          wikiDigest={state.settings.wikiDigest}
          wikiUpdatedAt={state.settings.wikiUpdatedAt}
          wikiHistory={state.settings.wikiHistory}
          onUpdateWiki={(updates) => {
            // Persist the keeper choice globally too, so it survives refresh
            // and applies to new conversations without re-picking.
            if (Object.prototype.hasOwnProperty.call(updates, 'wikiKeeperConnectionId')) {
              saveGlobalWikiKeeper(updates.wikiKeeperConnectionId ?? null);
            }
            updateSettings(updates);
          }}
          onRefreshWikiNow={refreshWikiDigest}
          onOpenMindmap={openMindmapFromSettings}
          textSize={state.settings.textSize}
          onUpdateTextSize={(size) => updateSettings({ textSize: size })}
          maxTokens={state.settings.maxTokens}
          onUpdateMaxTokens={(v) => updateSettings({ maxTokens: v })}
          onOpenAnalytics={() => {
            setSettingsInitialTab(null);
            setActiveModal('analytics');
          }}
        />
      )}
      {activeModal === 'library' && (
        <AgentLibraryModal
          onAdd={addAgentFromPreset}
          onClose={closeSubModal}
          currentAgentNames={state.agents.map((a) => a.name)}
        />
      )}
      {activeModal === 'analytics' && (
        <AnalyticsModal
          agents={state.agents}
          threads={state.threads}
          connections={connections}
          archives={archives}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal === 'export' && (
        <ExportModal
          state={
            searchQuery || filterStarredOnly || filterCategory
              ? { ...state, threads: visibleThreads }
              : state
          }
          onClose={() => setActiveModal(null)}
          onToast={showToast}
          onOpenMindmap={(markdown, title) => {
            setMindmapData({ markdown, title });
            setActiveModal('mindmap');
          }}
        />
      )}
      {activeModal === 'mindmap' && mindmapData && (
        <MindmapModal
          markdown={mindmapData.markdown}
          title={mindmapData.title}
          onClose={closeSubModal}
        />
      )}
    </div>
  );
}
