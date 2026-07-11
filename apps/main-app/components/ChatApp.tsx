'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Agent,
  ArchivedConversation,
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
import { AgentPreset } from '@/lib/agent-library';
import { upsertCustomAgent } from '@/lib/custom-agents';
import { generateId } from '@/lib/id';
import { fetchAgentReply, reactionInstruction } from '@/lib/llm-client';
import {
  loadConnections,
  loadConnectionsFromSupabase,
  saveConnections,
  syncConnectionsToSupabase,
} from '@/lib/llm-connections';
import { getSession, onAuthStateChange } from '@/lib/auth';
import { loadConversation, saveConversation } from '@/lib/storage';
import { buildArchiveTitle, loadArchives, saveArchives } from '@/lib/archives';
import { buildMessageMindmapMarkdown } from '@/lib/mindmap';
import { Theme, applyTheme, loadTheme } from '@/lib/theme';
import { addCustomMood, loadCustomMoods } from '@/lib/moods';
import { getCurrentConversationId, setCurrentConversationId } from '@/lib/admin';
import { logFieldChanges } from '@/lib/changelog';
import { SettingsModal } from './SettingsModal';
import { AudioModal } from './AudioModal';
import { AudioRail } from './AudioRail';
import { MessageContent } from './MessageContent';
import { AnalyticsModal } from './AnalyticsModal';
import { ExportModal } from './ExportModal';
import { LLMProvidersModal } from './LLMProvidersModal';
import { AgentLibraryModal } from './AgentLibraryModal';
import { MindmapModal } from './MindmapModal';
import { ArchivesModal } from './ArchivesModal';

const CONVERSATION_ID_KEY = 'multi-agent-conversation-id';
const DEFAULT_WHATSAPP_NUMBER = '212661320000';

interface ReactionDef {
  type: ReactionType;
  icon: string;
  label: string;
  tooltip: string;
}

// Requires the message's author to be a connected agent — triggers a real follow-up reply.
const AGENT_REACTIONS: ReactionDef[] = [
  { type: 'elaborate', icon: '🔎', label: 'Elaborate', tooltip: 'Ask this agent to elaborate with more depth' },
  { type: 'explainFurther', icon: '💬', label: 'Explain Further', tooltip: 'Ask this agent to explain further, more simply' },
  { type: 'why', icon: '❓', label: 'Why?', tooltip: 'Ask this agent why it said that' },
  { type: 'sources', icon: '📚', label: 'Sources', tooltip: 'Ask this agent for its sources/reasoning' },
  { type: 'bullets', icon: '•', label: 'Bullet Points', tooltip: 'Ask this agent to restate as bullet points' },
  { type: 'suggest', icon: '💡', label: 'Suggest', tooltip: 'Suggest a logical follow-up question or response' },
];

// Work on any message (agent or user) — no LLM call needed.
const UNIVERSAL_REACTIONS: ReactionDef[] = [
  { type: 'mindmap', icon: '🗺️', label: 'Mind Map', tooltip: 'Turn this message into a mind map' },
  { type: 'youtube', icon: '📺', label: 'YouTube', tooltip: 'Search YouTube for related videos' },
  { type: 'tiktok', icon: '🎵', label: 'TikTok', tooltip: 'Search TikTok for related videos' },
];

const DEFAULT_AGENTS: Agent[] = [
  {
    id: generateId(),
    refNumber: 'Agt1',
    name: 'Agent A',
    role: 'Researcher',
    instructions: 'Research recent developments and gather supporting evidence.',
    color: '#3b99fc',
    llmProvider: 'openai',
    connectionId: null,
    active: true,
  },
  {
    id: generateId(),
    refNumber: 'Agt2',
    name: 'Agent B',
    role: 'Analyst',
    instructions: 'Weigh tradeoffs and challenge assumptions with data.',
    color: '#2ecc71',
    llmProvider: 'anthropic',
    connectionId: null,
    active: true,
  },
  {
    id: generateId(),
    refNumber: 'Agt3',
    name: 'Agent C',
    role: 'Moderator',
    instructions: 'Keep the discussion balanced and summarize consensus.',
    color: '#f39c12',
    llmProvider: 'google',
    connectionId: null,
    active: true,
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
      maxExchanges: null,
      maxTokens: null,
      orchestratorEnabled: true,
      mood: 'debate',
      responseStyle: 'sentences',
      interactionStyle: 'dialogue',
      ttsRate: 1,
      ttsLang: 'en-US',
      whatsappNumber: '',
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
    let refNumber = agent.refNumber;
    if (!refNumber) {
      refNumber = `Agt${maxSeen + 1}`;
    }
    const match = /Agt(\d+)/.exec(refNumber);
    if (match) maxSeen = Math.max(maxSeen, Number(match[1]));
    return { ...agent, refNumber, active };
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
      responseStyle: state.settings.responseStyle ?? 'sentences',
      interactionStyle: state.settings.interactionStyle ?? 'dialogue',
      ttsRate: state.settings.ttsRate ?? 1,
      ttsLang: state.settings.ttsLang ?? 'en-US',
      whatsappNumber: state.settings.whatsappNumber ?? '',
    },
    nextAgentNumber: Math.max(maxSeen + 1, state.nextAgentNumber ?? 0),
  };
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
  const [state, setState] = useState<ConversationState>(defaultState);
  const [currentAgentId, setCurrentAgentId] = useState<string>(DEFAULT_AGENTS[0].id);
  const [inputMessage, setInputMessage] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStarredOnly, setFilterStarredOnly] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');
  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [activeModal, setActiveModal] = useState<
    'settings' | 'analytics' | 'export' | 'library' | 'mindmap' | null
  >(null);
  // When opening the Library from inside Settings, remember to return there
  // on close instead of dropping the user out with no modal open at all.
  const [modalReturnTo, setModalReturnTo] = useState<typeof activeModal>(null);
  const [participantsMenuOpen, setParticipantsMenuOpen] = useState(false);
  const [participantFilter, setParticipantFilter] = useState('');
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [topPanelOpen, setTopPanelOpen] = useState(true);
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
  const [hydrated, setHydrated] = useState(false);
  const [liveMode, setLiveMode] = useState<boolean | null>(null);
  const [connections, setConnections] = useState<LLMConnection[]>([]);
  const [archives, setArchives] = useState<ArchivedConversation[]>([]);
  const [speaking, setSpeaking] = useState<{
    messageId: string;
    charIndex: number;
    charLength: number;
  } | null>(null);
  const speakingCancelledRef = useRef(false);
  const statusRef = useRef(state.status);
  useEffect(() => {
    statusRef.current = state.status;
  }, [state.status]);
  const settingsRef = useRef(state.settings);
  useEffect(() => {
    settingsRef.current = state.settings;
  }, [state.settings]);
  const [showAudioRail, setShowAudioRail] = useState(true);
  const [theme, setTheme] = useState<Theme>('light');
  const [customMoods, setCustomMoods] = useState<string[]>([]);

  useEffect(() => {
    setCustomMoods(loadCustomMoods());
  }, []);
  const [devMode, setDevMode] = useState(false);
  /** agentId -> threadId, for every agent currently awaiting an LLM reply. */
  const [thinking, setThinking] = useState<Map<string, string>>(new Map());

  function startThinking(agentId: string, threadId: string) {
    setThinking((prev) => new Map(prev).set(agentId, threadId));
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

  useEffect(() => {
    document.body.classList.toggle('dev-mode', devMode);
  }, [devMode]);

  /** In Dev Mode, every tagged element shows this code as a small badge (CSS ::after). */
  function devRef(code: string): { 'data-devref'?: string } {
    return devMode ? { 'data-devref': code } : {};
  }
  const conversationAreaRef = useRef<HTMLDivElement>(null);
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
      if (loaded) {
        setState(migrateState(loaded));
        setCurrentAgentId(loaded.agents[0]?.id ?? DEFAULT_AGENTS[0].id);
      } else {
        setState((prev) => ({ ...prev, id: conversationId }));
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
    conversationAreaRef.current?.scrollTo({
      top: conversationAreaRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [state.threads]);

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

  function agentIsConnected(agent: Agent): boolean {
    return !!agent.connectionId && connections.some((c) => c.id === agent.connectionId);
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

  function createThread(agentId: string, seedContent?: string): Thread {
    const thread: Thread = {
      id: generateId(),
      agentId,
      createdAt: Date.now(),
      messages: [],
    };
    if (seedContent) {
      thread.messages.push({
        id: generateId(),
        threadId: thread.id,
        agentId,
        content: seedContent,
        timestamp: Date.now(),
        feedback: null,
        replyToId: null,
        starred: false,
        category: null,
      });
    }
    return thread;
  }

  /** Never falls back to a simulated/mock message — returns null if the agent has no working LLM. */
  async function getReply(
    agent: Agent,
    precedingMessages: Message[],
    extraInstruction?: string
  ): Promise<string | null> {
    if (!agentIsConnected(agent)) return null;
    // Reads live settings via the ref (not the closured `state`) so changes
    // like mood/topic made mid-conversation apply immediately, even while
    // a long auto-loop round is already in flight.
    const live = settingsRef.current;
    const reply = await fetchAgentReply(
      agent,
      connections,
      live.mood,
      live.topic,
      precedingMessages,
      state.agents,
      live.responseStyle,
      live.maxSentences,
      live.interactionStyle,
      extraInstruction
    );
    if (reply) {
      setLiveMode(true);
    } else {
      setLiveMode((prev) => (prev === true ? prev : false));
    }
    return reply;
  }

  /**
   * Runs one round-robin pass over `respondingAgents`. When a finite
   * maxExchanges is set, keeps cycling through them (agent1, agent2,
   * agent1, agent2, ...) until that many agent messages exist in the
   * thread, rather than stopping after a single pass — so "20 exchanges,
   * 2 agents" actually plays out as ~10 messages each, autonomously.
   */
  async function runAgentRound(thread: Thread, respondingAgents: Agent[]) {
    const connected = respondingAgents.filter(agentIsConnected);
    const skipped = respondingAgents.filter((a) => !agentIsConnected(a));
    if (skipped.length > 0) {
      showToast(`Skipped ${skipped.map((a) => a.refNumber).join(', ')} — no LLM connected.`);
    }
    if (connected.length === 0) return;

    const hasLimit = () => settingsRef.current.maxExchanges != null;
    const isRunnable = () => {
      const s: string = statusRef.current;
      return s !== 'paused' && s !== 'stopped';
    };
    let updatedThread = thread;
    let turn = 0;
    let consecutiveFailures = 0;

    do {
      if (!withinLimits(updatedThread)) break;
      if (!isRunnable()) break;

      const agent = connected[turn % connected.length];
      turn += 1;
      startThinking(agent.id, updatedThread.id);
      const reply = await getReply(agent, updatedThread.messages);
      stopThinking(agent.id);
      if (!reply) {
        showToast(`⚠️ ${agent.refNumber} failed to respond — check its LLM connection.`);
        consecutiveFailures += 1;
        // Only abort the whole round once every agent in rotation has failed
        // back-to-back — one agent's bad key/CORS issue shouldn't silence
        // the others.
        if (consecutiveFailures >= connected.length) break;
        continue;
      }
      consecutiveFailures = 0;
      const message: Message = {
        id: generateId(),
        threadId: updatedThread.id,
        agentId: agent.id,
        content: reply,
        timestamp: Date.now(),
        feedback: null,
        replyToId: null,
        starred: false,
        category: null,
      };
      updatedThread = { ...updatedThread, messages: [...updatedThread.messages, message] };
      setState((prev) => ({
        ...prev,
        threads: prev.threads.map((t) => (t.id === thread.id ? updatedThread : t)),
        updatedAt: Date.now(),
      }));
    } while (hasLimit() && withinLimits(updatedThread) && isRunnable());
  }

  async function startDiscussion() {
    const activeAgents = state.agents.filter((a) => a.active);
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
    startThinking(opener.id, 'pending');
    const openingLine = await getReply(opener, []);
    stopThinking(opener.id);
    if (!openingLine) {
      showToast(`⚠️ ${opener.refNumber} failed to respond — check its LLM connection.`);
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
    startThinking(agent.id, 'pending');
    const openingLine = await getReply(agent, []);
    stopThinking(agent.id);
    if (!openingLine) {
      showToast(`⚠️ ${agent.refNumber} failed to respond — check its LLM connection.`);
      return;
    }
    const thread = createThread(agentId, openingLine);
    setState((prev) => ({ ...prev, threads: [...prev.threads, thread], updatedAt: Date.now() }));
    showToast(`🧵 New thread started with ${agent.name}`);
  }

  async function sendMessage() {
    const content = inputMessage.trim();
    if (!content || state.status === 'stopped') return;

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

    if (state.settings.orchestratorEnabled && state.status !== 'paused') {
      const threadWithUserMsg = { ...targetThread, messages: [...targetThread.messages, userMessage] };
      runAgentRound(threadWithUserMsg, state.agents.filter((a) => a.active));
    }
  }

  async function handleReaction(threadId: string, message: Message, type: ReactionType) {
    if (type === 'mindmap') {
      const markdown = buildMessageMindmapMarkdown(state.agents, message);
      const author = state.agents.find((a) => a.id === message.agentId);
      setMindmapData({ markdown, title: `${author ? author.refNumber : 'Message'} Mind Map` });
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

    startThinking(author.id, threadId);
    const reply = await getReply(author, precedingMessages, instruction);
    stopThinking(author.id);
    if (!reply) {
      showToast(`⚠️ ${author.refNumber} failed to respond — check its LLM connection.`);
      return;
    }

    if (type === 'suggest') {
      setInputMessage(reply);
      showToast('💡 Suggestion added to the composer — edit and send, or discard.');
      return;
    }

    appendMessage(threadId, {
      id: generateId(),
      threadId,
      agentId: author.id,
      content: reply,
      timestamp: Date.now(),
      feedback: null,
      replyToId: message.id,
      starred: false,
      category: null,
    });
  }

  function stopSpeaking() {
    speakingCancelledRef.current = true;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(null);
  }

  /**
   * Splits text into sentence-ish chunks with their offset in the original
   * string. Android Chrome's Web Speech API truncates long utterances after
   * a couple of seconds, so long messages must be spoken as a queue of short
   * per-sentence utterances rather than one utterance for the whole message.
   */
  function splitIntoSentences(text: string): { text: string; offset: number }[] {
    const re = /[^.!?\n]+[.!?]+(\s+|$)|[^.!?\n]+$|\n+/g;
    const parts: { text: string; offset: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m[0].trim()) parts.push({ text: m[0], offset: m.index });
    }
    return parts.length > 0 ? parts : [{ text, offset: 0 }];
  }

  function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find((v) => v.lang === lang) ||
      voices.find((v) => v.lang.startsWith(lang.split('-')[0]))
    );
  }

  function playFromMessage(startIndex: number) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      showToast('Speech synthesis is not supported in this browser.');
      return;
    }
    window.speechSynthesis.cancel();
    speakingCancelledRef.current = false;

    // Chrome silently drops boundary/word events if speak() is called in
    // the same tick as cancel(), and can stall on long utterances unless
    // periodically nudged with pause()/resume() — both are long-standing
    // Web Speech API quirks, not bugs in this app's logic.
    const keepAlive = setInterval(() => {
      if (window.speechSynthesis.speaking) {
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
      const sentences = splitIntoSentences(msg.content);
      let sentenceIdx = 0;

      function speakSentence() {
        if (speakingCancelledRef.current) {
          setSpeaking(null);
          clearInterval(keepAlive);
          return;
        }
        if (sentenceIdx >= sentences.length) {
          speakAt(index + 1);
          return;
        }
        const { text, offset } = sentences[sentenceIdx];
        sentenceIdx += 1;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = state.settings.ttsRate;
        utterance.lang = state.settings.ttsLang;
        const voice = pickVoice(state.settings.ttsLang);
        if (voice) utterance.voice = voice;
        utterance.onstart = () => setSpeaking({ messageId: msg.id, charIndex: offset, charLength: 0 });
        utterance.onboundary = (e) => {
          if (e.name && e.name !== 'word') return;
          let charLength = (e as any).charLength;
          if (!charLength) {
            const rest = text.slice(e.charIndex);
            const match = /^\S+/.exec(rest);
            charLength = match ? match[0].length : 1;
          }
          setSpeaking({ messageId: msg.id, charIndex: offset + e.charIndex, charLength });
        };
        utterance.onend = () => speakSentence();
        utterance.onerror = () => speakSentence();
        window.speechSynthesis.speak(utterance);
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
    if (!agent.active && !agentIsConnected(agent)) {
      showToast(`${agent.refNumber} has no LLM connected — assign one in 🔌 LLMs first.`);
      return;
    }
    setState((prev) => ({
      ...prev,
      agents: prev.agents.map((a) => (a.id === id ? { ...a, active: !a.active } : a)),
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
    const connectedActive = state.agents.filter((a) => a.active && agentIsConnected(a));
    if (connectedActive.length === 0) {
      showToast('No connected, participating agents to resume with.');
      return;
    }
    statusRef.current = 'running';
    setState((prev) => ({ ...prev, status: 'running' }));
    if (!withinLimits(lastThread)) {
      showToast('Already at the exchange limit — use +10 to extend it first.');
      return;
    }
    runAgentRound(lastThread, connectedActive);
    showToast('▶️ Resumed');
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
    const userTitle = window.prompt('Give this conversation a title before archiving it:', '');
    if (userTitle === null) return;
    const title = buildArchiveTitle(userTitle.trim(), state);
    const archive: ArchivedConversation = {
      id: generateId(),
      title,
      archivedAt: Date.now(),
      state,
    };
    const nextArchives = [...archives, archive];
    setArchives(nextArchives);
    saveArchives(nextArchives);
    setState((prev) => ({ ...prev, threads: [], status: 'idle' }));
    showToast(`🗄️ Archived as "${title}" and reset`);
  }

  function restoreArchive(archive: ArchivedConversation) {
    const restored = migrateState(archive.state);
    setState(restored);
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
    showToast(`♻️ Restored "${archive.title}"`);
  }

  function deleteArchive(id: string) {
    const next = archives.filter((a) => a.id !== id);
    setArchives(next);
    saveArchives(next);
    showToast('🗑️ Archive deleted');
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

  function saveAgent(id: string, updates: Partial<Agent>) {
    const before = state.agents.find((a) => a.id === id);
    if (before) {
      logFieldChanges('agent', `${before.refNumber} ${before.name}`, before, {
        ...before,
        ...updates,
      });
    }
    setState((prev) => ({
      ...prev,
      agents: prev.agents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    }));
    const updated = { ...state.agents.find((a) => a.id === id), ...updates } as Agent;
    upsertCustomAgent({
      name: updated.name,
      role: updated.role,
      instructions: updated.instructions,
      color: updated.color,
    });
    showToast('✅ Agent settings saved!');
  }

  function updateAgentsBulk(nextAgents: Agent[]) {
    setState((prev) => ({ ...prev, agents: nextAgents }));
  }

  function addAgent() {
    const refNumber = `Agt${state.nextAgentNumber}`;
    const newAgent: Agent = {
      id: generateId(),
      refNumber,
      name: `Agent ${state.agents.length + 1}`,
      role: 'Contributor',
      instructions: 'Share a distinct perspective on the topic.',
      color: '#8e44ad',
      llmProvider: 'openai',
      connectionId: null,
      active: true,
    };
    setState((prev) => ({
      ...prev,
      agents: [...prev.agents, newAgent],
      nextAgentNumber: prev.nextAgentNumber + 1,
    }));
    setCurrentAgentId(newAgent.id);
    upsertCustomAgent({
      name: newAgent.name,
      role: newAgent.role,
      instructions: newAgent.instructions,
      color: newAgent.color,
    });
    showToast(`➕ New agent added (${refNumber})`);
  }

  function addAgentFromPreset(preset: AgentPreset) {
    const refNumber = `Agt${state.nextAgentNumber}`;
    const newAgent: Agent = {
      id: generateId(),
      refNumber,
      name: preset.name,
      role: preset.role,
      instructions: preset.instructions,
      color: preset.color,
      llmProvider: 'openai',
      connectionId: null,
      active: true,
    };
    setState((prev) => ({
      ...prev,
      agents: [...prev.agents, newAgent],
      nextAgentNumber: prev.nextAgentNumber + 1,
    }));
    setCurrentAgentId(newAgent.id);
    upsertCustomAgent(preset);
    showToast(`➕ Added ${preset.name} (${refNumber})`);
  }

  function deleteAgent(id: string) {
    if (state.agents.length <= 1) return;
    // Only removed from this conversation — its definition stays in the
    // agent library (custom-agents.ts) so it can be re-added later.
    setState((prev) => ({ ...prev, agents: prev.agents.filter((a) => a.id !== id) }));
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

  return (
    <div className="app-shell">
      <div className="header">
        <div className="header-left">
          <input
            type="text"
            className="select-input"
            style={{ minWidth: 220, flex: 1 }}
            placeholder="Discussion topic (e.g. Should AI regulation be global?)"
            value={state.settings.topic}
            onChange={(e) => updateSettings({ topic: e.target.value })}
          />
          <select
            className="select-input"
            value={currentAgentId}
            onChange={(e) => setCurrentAgentId(e.target.value)}
          >
            {state.agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.refNumber} · {agent.name} ({agent.role})
              </option>
            ))}
          </select>
          <select
            className="select-input"
            value={state.settings.mood}
            onChange={(e) => updateSettings({ mood: e.target.value })}
          >
            <option value="debate">🗣️ Debate</option>
            <option value="complementary">💡 Complementary</option>
            <option value="research">🔍 Research</option>
            {customMoods.map((m) => (
              <option key={m} value={m}>
                🎭 {m}
              </option>
            ))}
          </select>
          <button
            className="icon-btn"
            title="Add a custom discussion mood"
            onClick={() => {
              const mood = window.prompt('Name a new discussion mood (e.g. "brainstorm", "socratic"):', '');
              if (!mood?.trim()) return;
              setCustomMoods(addCustomMood(mood));
              updateSettings({ mood: mood.trim() });
            }}
          >
            +
          </button>
        </div>
        <div className="header-right">
          <button className="icon-btn" {...devRef('a1')} onClick={() => setShowAudioRail((v) => !v)}>
            🎙️ Rail
          </button>
          <button
            className="icon-btn"
            {...devRef('a2')}
            onClick={() => {
              setModalReturnTo(null);
              setActiveModal('library');
            }}
          >
            📚 Library
          </button>
          <button className="icon-btn" {...devRef('a5')} onClick={() => setActiveModal('analytics')}>
            📊 Analytics
          </button>
          <button className="icon-btn" {...devRef('a6')} onClick={() => setActiveModal('export')}>
            📥 Export
          </button>
          <select
            className="icon-btn"
            value={theme}
            onChange={(e) => changeTheme(e.target.value as Theme)}
            title="Theme"
          >
            <option value="light">☀️ Light</option>
            <option value="dark">🌙 Dark</option>
            <option value="ascii">🟢 ASCII</option>
          </select>
          <button
            className={`icon-btn ${devMode ? 'active' : ''}`}
            onClick={() => setDevMode((v) => !v)}
            title="Dev Mode: show a unique reference code on every section/feature/button/field"
          >
            🛠️ Dev
          </button>
        </div>
      </div>

      <button
        className="settings-gear-btn"
        {...devRef('a8')}
        onClick={() => {
          setModalReturnTo(null);
          setActiveModal('settings');
        }}
        title="Settings (Agents, LLMs, Audio, Archives)"
      >
        ⚙️
      </button>

      <div className="top-panel-toggle-row">
        <button
          className="control-btn top-panel-toggle-btn"
          {...devRef('tp1')}
          onClick={() => setTopPanelOpen((v) => !v)}
          title={topPanelOpen ? 'Collapse search/participants/controls' : 'Show search/participants/controls'}
        >
          {topPanelOpen ? '▲ Hide parameters' : '▼ Show parameters'}
        </button>
      </div>

      <div className={`top-panel-collapsible ${topPanelOpen ? 'open' : 'closed'}`}>
      <div className="top-panel-inner">
      <div className="search-bar">
        <input
          type="text"
          className="select-input"
          style={{ flex: 1 }}
          placeholder="🔎 Search discussion... (filters live as you type)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <label className="control-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="checkbox"
            checked={filterStarredOnly}
            onChange={(e) => setFilterStarredOnly(e.target.checked)}
          />
          ⭐ Starred only
        </label>
        <select
          className="select-input"
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

      <div className="participants-bar" {...devRef('p1')}>
        <span className="control-label">Participants:</span>
        {state.agents
          .filter((agent) => agent.active)
          .map((agent, agentIndex) => {
            const connected = agentIsConnected(agent);
            return (
              <button
                key={agent.id}
                {...devRef(`p${agentIndex + 2}`)}
                className={`participant-chip ${connected ? 'active' : ''} ${!connected ? 'disconnected' : ''}`}
                style={{ borderColor: agent.color }}
                onClick={() => toggleAgentActive(agent.id)}
                onDoubleClick={() => {
                  setCurrentAgentId(agent.id);
                  setModalReturnTo(null);
                  setActiveModal('settings');
                }}
                title={
                  !connected
                    ? `${agent.refNumber} has no LLM connected — assign one in 🔌 LLMs (double-click to open Settings)`
                    : 'Click to deactivate, double-click to open Settings'
                }
              >
                <span className="participant-dot" style={{ background: agent.color }} />
                {agent.refNumber} {agent.name}
                {!connected && ' ⚠'}
              </button>
            );
          })}
        <div className="participants-menu-wrap">
          <button
            className="control-btn"
            {...devRef('p1a')}
            onClick={() => setParticipantsMenuOpen((v) => !v)}
            title="Manage which agents are active in this session"
          >
            👥 Manage ({state.agents.filter((a) => a.active).length}/{state.agents.length}) ▾
          </button>
          {participantsMenuOpen && (
            <div className="participants-menu" {...devRef('p1b')}>
              <input
                type="text"
                className="control-input"
                placeholder="Filter by name, role, category…"
                value={participantFilter}
                onChange={(e) => setParticipantFilter(e.target.value)}
                {...devRef('p1c')}
              />
              {(() => {
                const q = participantFilter.trim().toLowerCase();
                const filtered = state.agents.filter((a) => {
                  if (!q) return true;
                  return (
                    a.name.toLowerCase().includes(q) ||
                    a.role.toLowerCase().includes(q) ||
                    a.refNumber.toLowerCase().includes(q)
                  );
                });
                return (
                  <>
                    <div className="participants-menu-actions">
                      <button
                        className="control-btn"
                        {...devRef('p1d')}
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
                        {...devRef('p1e')}
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
                    <div className="participants-menu-list">
                      {filtered.map((agent) => (
                        <label key={agent.id} className="participants-menu-row">
                          <input
                            type="checkbox"
                            checked={agent.active}
                            onChange={() => toggleAgentActive(agent.id)}
                          />
                          <span className="participant-dot" style={{ background: agent.color }} />
                          <span>
                            {agent.refNumber} {agent.name}
                            {!agentIsConnected(agent) && ' ⚠'}
                          </span>
                        </label>
                      ))}
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

      <div className="controls-panel">
        <div className="control-group">
          <span className="control-label">Response Style:</span>
          <select
            className="control-input"
            {...devRef('c1')}
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
            {...devRef('c1b')}
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
              {...devRef('c2')}
              min={1}
              max={10}
              value={state.settings.maxSentences}
              onChange={(e) => updateSettings({ maxSentences: Number(e.target.value) || 1 })}
            />
          </div>
        )}
        <div className="control-group">
          <span className="control-label">Exchanges:</span>
          <input
            type="text"
            inputMode="numeric"
            className="control-input"
            {...devRef('c3')}
            {...exchangesField}
          />
          {state.settings.maxExchanges != null && (
            <button
              className="control-btn"
              {...devRef('c4')}
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
            {...devRef('c5')}
            {...tokensField}
          />
        </div>
        <div className="control-group">
          <input
            type="checkbox"
            id="orchestrator"
            {...devRef('c8')}
            checked={state.settings.orchestratorEnabled}
            onChange={(e) => updateSettings({ orchestratorEnabled: e.target.checked })}
          />
          <label htmlFor="orchestrator" className="control-label">
            🔁 Auto Mode
          </label>
        </div>
        <div className="control-group">
          {state.status === 'running' ? (
            <button className="control-btn" {...devRef('c9')} onClick={pauseConversation}>
              ⏸️ Pause
            </button>
          ) : (
            <button className="control-btn" {...devRef('c9')} onClick={playConversation}>
              ▶️ Play
            </button>
          )}
          <button className="control-btn" {...devRef('c11')} onClick={stopConversation}>
            ⏹️ Stop
          </button>
          <button className="control-btn" {...devRef('c12')} onClick={resetConversation}>
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

      <button
        className="floating-play-btn"
        onClick={state.status === 'running' ? pauseConversation : playConversation}
        title={state.status === 'running' ? 'Pause conversation' : 'Play/resume conversation'}
      >
        {state.status === 'running' ? '⏸️' : '▶️'}
      </button>

      {selectedMessageIds.length > 0 && (
        <div className="selection-action-bar" {...devRef('sel1')}>
          <span>{selectedMessageIds.length} selected</span>
          <button className="control-btn" onClick={copySelectedMessages}>
            📋 Copy
          </button>
          <button className="control-btn" onClick={shareSelectedToWhatsApp}>
            💬 Share to WhatsApp
          </button>
          <button className="control-btn" onClick={() => setSelectedMessageIds([])}>
            ✕ Clear
          </button>
        </div>
      )}

      <div className="conversation-body">
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
      <div className="conversation-area" ref={conversationAreaRef}>
        {state.threads.length === 0 && (
          <div className="start-discussion">
            <button onClick={startDiscussion}>▶️ Start New Discussion</button>
          </div>
        )}

        {Array.from(thinking.entries())
          .filter(([, threadId]) => threadId === 'pending')
          .map(([agentId]) => {
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
                <button className="control-btn" onClick={() => handleNewThread(thread.agentId)}>
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
                  className={`bubble-wrapper ${isUser ? 'user' : ''} ${shiftToggle ? 'speaker-shift' : ''} ${selectedMessageIds.includes(msg.id) ? 'selected' : ''}`}
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
                      >
                        <button
                          className="bubble-copy-btn"
                          title="Copy (selected text, or the whole message)"
                          onClick={() => copyMessageText(msg.content)}
                        >
                          📋
                        </button>
                        {msg.starred && <span className="bubble-star">⭐</span>}
                        {msg.category && <span className="bubble-category">🏷️ {msg.category}</span>}
                        <MessageContent
                          content={msg.content}
                          spokenRange={
                            speaking?.messageId === msg.id
                              ? { charIndex: speaking.charIndex, charLength: speaking.charLength }
                              : null
                          }
                        />
                      </div>
                      <div className="feedback-controls">
                        {(() => {
                          let n = 0;
                          const badge = () => ++n;
                          const isSpeaking = speaking !== null;
                          return (
                            <>
                              <button
                                className="feedback-btn"
                                title={
                                  isSpeaking
                                    ? `r${badge()}: Pause reading`
                                    : `r${badge()}: Read aloud from here`
                                }
                                onClick={() =>
                                  isSpeaking
                                    ? stopSpeaking()
                                    : playFromMessage(allMessages.findIndex((m) => m.id === msg.id))
                                }
                              >
                                {isSpeaking ? '⏸️' : '▶️'}
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
              {Array.from(thinking.entries())
                .filter(([, threadId]) => threadId === thread.id)
                .map(([agentId]) => {
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

      <div className="input-area" {...devRef('i1')}>
        <input
          type="text"
          className="message-input"
          {...devRef('i2')}
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') sendMessage();
          }}
          placeholder="Type message... (@Agt2 to ask only that agent)"
          disabled={state.status === 'stopped'}
        />
        <button className="send-btn" {...devRef('i3')} onClick={sendMessage} disabled={state.status === 'stopped'}>
          Send
        </button>
      </div>

      <div className={`toast ${toastVisible ? 'show' : ''}`}>{toast}</div>

      {activeModal === 'settings' && (
        <SettingsModal
          agents={state.agents}
          currentAgentId={currentAgentId}
          connections={connections}
          onSelectAgent={setCurrentAgentId}
          onSave={saveAgent}
          onAdd={addAgent}
          onDelete={deleteAgent}
          onOpenLibrary={openLibraryFromSettings}
          onClose={() => setActiveModal(null)}
          onToast={showToast}
          onChangeConnections={updateConnections}
          onUpdateAgentsBulk={updateAgentsBulk}
          threads={state.threads}
          ttsRate={state.settings.ttsRate}
          ttsLang={state.settings.ttsLang}
          onUpdateTts={(updates) => updateSettings(updates)}
          archives={archives}
          onRestoreArchive={restoreArchive}
          onDeleteArchive={deleteArchive}
          whatsappNumber={state.settings.whatsappNumber}
          onUpdateWhatsappNumber={(number) => updateSettings({ whatsappNumber: number })}
        />
      )}
      {activeModal === 'library' && (
        <AgentLibraryModal onAdd={addAgentFromPreset} onClose={closeSubModal} />
      )}
      {activeModal === 'analytics' && (
        <AnalyticsModal
          agents={state.agents}
          threads={state.threads}
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
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  );
}
