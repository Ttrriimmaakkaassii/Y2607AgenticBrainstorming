'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Agent,
  ArchivedConversation,
  ConversationState,
  Feedback,
  LLMConnection,
  Message,
  Mood,
  ReactionType,
  ResponseStyle,
  Thread,
} from '@/lib/types';
import { AgentPreset } from '@/lib/agent-library';
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

const REACTIONS: { type: ReactionType; icon: string; label: string; tooltip: string }[] = [
  { type: 'elaborate', icon: '🔎', label: 'Elaborate', tooltip: 'Ask this agent to elaborate with more depth' },
  { type: 'explainFurther', icon: '💬', label: 'Explain Further', tooltip: 'Ask this agent to explain further, more simply' },
  { type: 'why', icon: '❓', label: 'Why?', tooltip: 'Ask this agent why it said that' },
  { type: 'sources', icon: '📚', label: 'Sources', tooltip: 'Ask this agent for its sources/reasoning' },
  { type: 'bullets', icon: '•', label: 'Bullet Points', tooltip: 'Ask this agent to restate as bullet points' },
  { type: 'mindmap', icon: '🗺️', label: 'Mind Map', tooltip: 'Turn this message into a mind map' },
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
      ttsRate: 1,
      ttsLang: 'en-US',
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
    messages: t.messages.map((m) => ({ ...m, replyToId: m.replyToId ?? null })),
  }));
  return {
    ...state,
    agents,
    threads,
    settings: {
      ...state.settings,
      responseStyle: state.settings.responseStyle ?? 'sentences',
      ttsRate: state.settings.ttsRate ?? 1,
      ttsLang: state.settings.ttsLang ?? 'en-US',
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

export function ChatApp() {
  const [state, setState] = useState<ConversationState>(defaultState);
  const [currentAgentId, setCurrentAgentId] = useState<string>(DEFAULT_AGENTS[0].id);
  const [inputMessage, setInputMessage] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [activeModal, setActiveModal] = useState<
    'settings' | 'audio' | 'analytics' | 'export' | 'llmProviders' | 'library' | 'mindmap' | 'archives' | null
  >(null);
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
  const [showAudioRail, setShowAudioRail] = useState(true);
  const conversationAreaRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    setConnections(loadConnections());
    setArchives(loadArchives());

    getSession().then((session) => {
      if (session) setUserId(session.user.id);
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
    const conversationId = getOrCreateConversationId();
    loadConversation(conversationId).then((loaded) => {
      if (loaded) {
        setState(migrateState(loaded));
        setCurrentAgentId(loaded.agents[0]?.id ?? DEFAULT_AGENTS[0].id);
      } else {
        setState((prev) => ({ ...prev, id: conversationId }));
      }
      setHydrated(true);
    });
  }, []);

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

  function agentIsConnected(agent: Agent): boolean {
    return !!agent.connectionId && connections.some((c) => c.id === agent.connectionId);
  }

  function agentExchangeCount(thread: Thread): number {
    return thread.messages.filter((m) => m.agentId !== 'user').length;
  }

  function withinLimits(thread: Thread): boolean {
    if (state.settings.maxExchanges == null) return true;
    return agentExchangeCount(thread) < state.settings.maxExchanges;
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
    const reply = await fetchAgentReply(
      agent,
      connections,
      state.settings.mood,
      state.settings.topic,
      precedingMessages,
      state.agents,
      state.settings.responseStyle,
      state.settings.maxSentences,
      extraInstruction
    );
    if (reply) {
      setLiveMode(true);
    } else {
      setLiveMode((prev) => (prev === true ? prev : false));
    }
    return reply;
  }

  async function runAgentRound(thread: Thread, respondingAgents: Agent[]) {
    const connected = respondingAgents.filter(agentIsConnected);
    const skipped = respondingAgents.filter((a) => !agentIsConnected(a));
    if (skipped.length > 0) {
      showToast(`Skipped ${skipped.map((a) => a.refNumber).join(', ')} — no LLM connected.`);
    }

    let updatedThread = thread;
    for (const agent of connected) {
      if (!withinLimits(updatedThread)) break;
      const reply = await getReply(agent, updatedThread.messages);
      if (!reply) {
        showToast(`⚠️ ${agent.refNumber} failed to respond — check its LLM connection.`);
        continue;
      }
      const message: Message = {
        id: generateId(),
        threadId: updatedThread.id,
        agentId: agent.id,
        content: reply,
        timestamp: Date.now(),
        feedback: null,
        replyToId: null,
      };
      updatedThread = { ...updatedThread, messages: [...updatedThread.messages, message] };
      setState((prev) => ({
        ...prev,
        threads: prev.threads.map((t) => (t.id === thread.id ? updatedThread : t)),
        updatedAt: Date.now(),
      }));
    }
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
    const openingLine = await getReply(opener, []);
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
    const openingLine = await getReply(agent, []);
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
    };
    appendMessage(targetThread.id, userMessage);
    setInputMessage('');
    setReplyingTo(null);

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

    const instruction =
      type === 'bullets'
        ? reactionInstruction('bullets')
        : reactionInstruction(type);

    const reply = await getReply(author, precedingMessages, instruction);
    if (!reply) {
      showToast(`⚠️ ${author.refNumber} failed to respond — check its LLM connection.`);
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
    });
  }

  function stopSpeaking() {
    speakingCancelledRef.current = true;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(null);
  }

  function playFromMessage(startIndex: number) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      showToast('Speech synthesis is not supported in this browser.');
      return;
    }
    window.speechSynthesis.cancel();
    speakingCancelledRef.current = false;

    function speakAt(index: number) {
      if (speakingCancelledRef.current || index >= allMessages.length) {
        setSpeaking(null);
        return;
      }
      const msg = allMessages[index];
      const utterance = new SpeechSynthesisUtterance(msg.content);
      utterance.rate = state.settings.ttsRate;
      utterance.lang = state.settings.ttsLang;
      utterance.onstart = () => setSpeaking({ messageId: msg.id, charIndex: 0, charLength: 0 });
      utterance.onboundary = (e) => {
        if (e.name && e.name !== 'word') return;
        let charLength = (e as any).charLength;
        if (!charLength) {
          const rest = msg.content.slice(e.charIndex);
          const match = /^\S+/.exec(rest);
          charLength = match ? match[0].length : 1;
        }
        setSpeaking({ messageId: msg.id, charIndex: e.charIndex, charLength });
      };
      utterance.onend = () => speakAt(index + 1);
      utterance.onerror = () => speakAt(index + 1);
      window.speechSynthesis.speak(utterance);
    }

    speakAt(startIndex);
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

  function pauseConversation() {
    setState((prev) => ({ ...prev, status: 'paused' }));
    showToast('⏸️ Conversation paused');
  }

  function stopConversation() {
    setState((prev) => ({ ...prev, status: 'stopped' }));
    showToast('⏹️ Conversation stopped');
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
    setState(migrateState(archive.state));
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
    setState((prev) => ({ ...prev, settings: { ...prev.settings, ...updates } }));
  }

  function saveAgent(id: string, updates: Partial<Agent>) {
    setState((prev) => ({
      ...prev,
      agents: prev.agents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    }));
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
    showToast(`➕ Added ${preset.name} (${refNumber})`);
  }

  function deleteAgent(id: string) {
    if (state.agents.length <= 1) return;
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
            onChange={(e) => updateSettings({ mood: e.target.value as Mood })}
          >
            <option value="debate">🗣️ Debate</option>
            <option value="complementary">💡 Complementary</option>
            <option value="research">🔍 Research</option>
          </select>
        </div>
        <div className="header-right">
          <button className="icon-btn" onClick={() => setShowAudioRail((v) => !v)}>
            🎙️ Rail
          </button>
          <button className="icon-btn" onClick={() => setActiveModal('library')}>
            📚 Library
          </button>
          <button className="icon-btn" onClick={() => setActiveModal('llmProviders')}>
            🔌 LLMs
          </button>
          <button className="icon-btn" onClick={() => setActiveModal('audio')}>
            🎧 Audio
          </button>
          <button className="icon-btn" onClick={() => setActiveModal('analytics')}>
            📊 Analytics
          </button>
          <button className="icon-btn" onClick={() => setActiveModal('export')}>
            📥 Export
          </button>
          <button className="icon-btn" onClick={() => setActiveModal('archives')}>
            🗄️ Archives
          </button>
          <button className="icon-btn" onClick={() => setActiveModal('settings')}>
            ⚙️ Settings
          </button>
        </div>
      </div>

      <div className="participants-bar">
        <span className="control-label">Participants:</span>
        {state.agents.map((agent) => {
          const connected = agentIsConnected(agent);
          return (
            <button
              key={agent.id}
              className={`participant-chip ${agent.active && connected ? 'active' : ''} ${!connected ? 'disconnected' : ''}`}
              style={{ borderColor: agent.color }}
              onClick={() => toggleAgentActive(agent.id)}
              title={
                !connected
                  ? `${agent.refNumber} has no LLM connected — assign one in 🔌 LLMs`
                  : agent.active
                  ? 'Click to remove from discussion'
                  : 'Click to include in discussion'
              }
            >
              <span className="participant-dot" style={{ background: agent.color }} />
              {agent.refNumber} {agent.name}
              {!connected && ' ⚠'}
            </button>
          );
        })}
      </div>

      <div className="controls-panel">
        <div className="control-group">
          <span className="control-label">Response Style:</span>
          <select
            className="control-input"
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
        {state.settings.responseStyle === 'sentences' && (
          <div className="control-group">
            <span className="control-label">Sentences:</span>
            <input
              type="number"
              className="control-input"
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
            className="control-input"
            value={state.settings.maxExchanges ?? '∞'}
            onChange={(e) => {
              const v = e.target.value.trim();
              updateSettings({ maxExchanges: v === '' || v === '∞' ? null : Number(v) || null });
            }}
          />
        </div>
        <div className="control-group">
          <span className="control-label">Tokens:</span>
          <input
            type="text"
            className="control-input"
            value={state.settings.maxTokens ?? '∞'}
            onChange={(e) => {
              const v = e.target.value.trim();
              updateSettings({ maxTokens: v === '' || v === '∞' ? null : Number(v) || null });
            }}
          />
        </div>
        <div className="control-group">
          <span className="control-label">Voice Speed:</span>
          <input
            type="number"
            className="control-input"
            min={0.5}
            max={2}
            step={0.1}
            value={state.settings.ttsRate}
            onChange={(e) => updateSettings({ ttsRate: Number(e.target.value) || 1 })}
          />
        </div>
        <div className="control-group">
          <span className="control-label">Voice Language:</span>
          <select
            className="control-input"
            style={{ width: 'auto' }}
            value={state.settings.ttsLang}
            onChange={(e) => updateSettings({ ttsLang: e.target.value })}
          >
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="es-ES">Spanish</option>
            <option value="fr-FR">French</option>
            <option value="de-DE">German</option>
            <option value="pt-BR">Portuguese (BR)</option>
            <option value="it-IT">Italian</option>
            <option value="zh-CN">Chinese (Mandarin)</option>
            <option value="ja-JP">Japanese</option>
            <option value="hi-IN">Hindi</option>
            <option value="ar-SA">Arabic</option>
          </select>
        </div>
        <div className="control-group">
          <input
            type="checkbox"
            id="orchestrator"
            checked={state.settings.orchestratorEnabled}
            onChange={(e) => updateSettings({ orchestratorEnabled: e.target.checked })}
          />
          <label htmlFor="orchestrator" className="control-label">
            Orchestrator
          </label>
        </div>
        <div className="control-group">
          <button className="control-btn" onClick={pauseConversation}>
            ⏸️ Pause
          </button>
          <button className="control-btn" onClick={stopConversation}>
            ⏹️ Stop
          </button>
          <button className="control-btn" onClick={resetConversation}>
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

        {state.threads.map((thread) => {
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

              {thread.messages.map((msg) => {
                const isUser = msg.agentId === 'user';
                const author = isUser ? null : agentById(msg.agentId);
                const quoted = msg.replyToId ? messageById(msg.replyToId) : undefined;
                return (
                  <div className={`bubble-wrapper ${isUser ? 'user' : ''}`} key={msg.id}>
                    <div
                      className="avatar"
                      style={{ background: isUser ? '#95ec69' : author?.color ?? '#999' }}
                    >
                      {isUser ? 'Y' : (author?.name ?? '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="bubble-content">
                      <div className="bubble-name">
                        {isUser ? 'You' : author ? `${author.refNumber} · ${author.name}` : 'Unknown'}
                      </div>
                      {quoted && (
                        <div className="quoted-reply">
                          <span className="quoted-author">{authorLabel(quoted.agentId)}</span>
                          <span className="quoted-snippet">{quoted.content.slice(0, 80)}</span>
                        </div>
                      )}
                      <div className="bubble-text">
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
                        {(['like', 'dislike', 'clarify'] as Feedback[]).map((type) => (
                          <button
                            key={type}
                            className={`feedback-btn ${msg.feedback === type ? `active ${type}` : ''}`}
                            onClick={() => handleFeedback(thread.id, msg.id, type)}
                          >
                            {type === 'like' ? '👍' : type === 'dislike' ? '👎' : '🤔'}
                          </button>
                        ))}
                        <button
                          className="feedback-btn"
                          title="Reply to this message"
                          onClick={() => setReplyingTo(msg)}
                        >
                          ↩️
                        </button>
                        {!isUser &&
                          REACTIONS.map((r) => (
                            <button
                              key={r.type}
                              className="feedback-btn"
                              title={r.tooltip}
                              onClick={() => handleReaction(thread.id, msg, r.type)}
                            >
                              {r.icon}
                            </button>
                          ))}
                        {isUser && (
                          <button
                            className="feedback-btn"
                            title="Turn this message into a mind map"
                            onClick={() => handleReaction(thread.id, msg, 'mindmap')}
                          >
                            🗺️
                          </button>
                        )}
                      </div>
                    </div>
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

      <div className="input-area">
        <input
          type="text"
          className="message-input"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') sendMessage();
          }}
          placeholder="Type message..."
          disabled={state.status === 'stopped'}
        />
        <button className="send-btn" onClick={sendMessage} disabled={state.status === 'stopped'}>
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
          onOpenLLMProviders={() => setActiveModal('llmProviders')}
          onOpenLibrary={() => setActiveModal('library')}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal === 'llmProviders' && (
        <LLMProvidersModal
          connections={connections}
          onChange={updateConnections}
          agents={state.agents}
          onUpdateAgents={updateAgentsBulk}
          onClose={() => setActiveModal(null)}
          onToast={showToast}
        />
      )}
      {activeModal === 'library' && (
        <AgentLibraryModal onAdd={addAgentFromPreset} onClose={() => setActiveModal(null)} />
      )}
      {activeModal === 'audio' && (
        <AudioModal
          agents={state.agents}
          threads={state.threads}
          onClose={() => setActiveModal(null)}
          onToast={showToast}
        />
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
          state={state}
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
      {activeModal === 'archives' && (
        <ArchivesModal
          archives={archives}
          onRestore={restoreArchive}
          onDelete={deleteArchive}
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  );
}
