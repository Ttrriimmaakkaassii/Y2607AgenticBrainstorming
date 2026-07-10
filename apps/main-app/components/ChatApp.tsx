'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Agent, ConversationState, Feedback, LLMConnection, Message, Mood, Thread } from '@/lib/types';
import { AgentPreset } from '@/lib/agent-library';
import { generateId } from '@/lib/id';
import { generateAgentReply } from '@/lib/response-generator';
import { fetchAgentReply } from '@/lib/llm-client';
import { loadConnections, saveConnections } from '@/lib/llm-connections';
import { loadConversation, saveConversation } from '@/lib/storage';
import { SettingsModal } from './SettingsModal';
import { AudioModal } from './AudioModal';
import { AnalyticsModal } from './AnalyticsModal';
import { ExportModal } from './ExportModal';
import { LLMProvidersModal } from './LLMProvidersModal';
import { AgentLibraryModal } from './AgentLibraryModal';

const CONVERSATION_ID_KEY = 'multi-agent-conversation-id';

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
    },
    status: 'idle',
    updatedAt: Date.now(),
    nextAgentNumber: 4,
  };
}

/** Backfills refNumber/nextAgentNumber for conversations saved before this feature existed. */
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
  return { ...state, agents, nextAgentNumber: Math.max(maxSeen + 1, state.nextAgentNumber ?? 0) };
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
  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [activeModal, setActiveModal] = useState<
    'settings' | 'audio' | 'analytics' | 'export' | 'llmProviders' | 'library' | null
  >(null);
  const [hydrated, setHydrated] = useState(false);
  const [liveMode, setLiveMode] = useState<boolean | null>(null);
  const [connections, setConnections] = useState<LLMConnection[]>([]);
  const conversationAreaRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setConnections(loadConnections());
  }, []);

  function updateConnections(next: LLMConnection[]) {
    setConnections(next);
    saveConnections(next);
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
    toastTimer.current = setTimeout(() => setToastVisible(false), 2000);
  }

  const allMessages = useMemo(() => state.threads.flatMap((t) => t.messages), [state.threads]);

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
      });
    }
    return thread;
  }

  async function getReply(agent: Agent, precedingMessages: Message[]): Promise<string> {
    const live = await fetchAgentReply(
      agent,
      connections,
      state.settings.mood,
      state.settings.topic,
      precedingMessages,
      state.agents,
      state.settings.maxSentences
    );
    if (live) {
      setLiveMode(true);
      return live;
    }
    setLiveMode((prev) => (prev === true ? prev : false));
    return generateAgentReply(
      agent,
      state.settings.mood,
      precedingMessages,
      state.settings.maxSentences,
      state.settings.topic
    );
  }

  async function runAgentRound(thread: Thread, respondingAgents: Agent[]) {
    let updatedThread = thread;
    for (const agent of respondingAgents) {
      if (!withinLimits(updatedThread)) break;
      const reply = await getReply(agent, updatedThread.messages);
      const message: Message = {
        id: generateId(),
        threadId: updatedThread.id,
        agentId: agent.id,
        content: reply,
        timestamp: Date.now(),
        feedback: null,
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
    if (activeAgents.length === 0) {
      showToast('Select at least one participating agent first.');
      return;
    }
    const [opener, ...responders] = activeAgents;
    const openingLine = await getReply(opener, []);
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
    const openingLine = await getReply(agent, []);
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
    };
    appendMessage(targetThread.id, userMessage);
    setInputMessage('');

    if (state.settings.orchestratorEnabled && state.status !== 'paused') {
      const threadWithUserMsg = { ...targetThread, messages: [...targetThread.messages, userMessage] };
      runAgentRound(threadWithUserMsg, state.agents.filter((a) => a.active));
    }
  }

  function toggleAgentActive(id: string) {
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
    setState((prev) => ({ ...prev, threads: [], status: 'idle' }));
    showToast('🔄 Conversation reset');
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
          <button className="icon-btn" onClick={() => setActiveModal('settings')}>
            ⚙️ Settings
          </button>
        </div>
      </div>

      <div className="participants-bar">
        <span className="control-label">Participants:</span>
        {state.agents.map((agent) => (
          <button
            key={agent.id}
            className={`participant-chip ${agent.active ? 'active' : ''}`}
            style={{ borderColor: agent.color }}
            onClick={() => toggleAgentActive(agent.id)}
            title={agent.active ? 'Click to remove from discussion' : 'Click to include in discussion'}
          >
            <span className="participant-dot" style={{ background: agent.color }} />
            {agent.refNumber} {agent.name}
          </button>
        ))}
      </div>

      <div className="controls-panel">
        <div className="control-group">
          <span className="control-label">Max Sentences:</span>
          <input
            type="number"
            className="control-input"
            min={1}
            max={10}
            value={state.settings.maxSentences}
            onChange={(e) => updateSettings({ maxSentences: Number(e.target.value) || 1 })}
          />
        </div>
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
            title={
              liveMode === false
                ? 'No LLM API key configured server-side — add OPENAI_API_KEY / ANTHROPIC_API_KEY / GOOGLE_API_KEY as Cloudflare secrets to enable live replies.'
                : undefined
            }
          >
            {liveMode === null
              ? 'Mode: not started'
              : liveMode
              ? '⚡ Live LLM replies'
              : '🤖 Simulated replies (no API key)'}
          </span>
        </div>
      </div>

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
                <button
                  className="control-btn"
                  onClick={() => handleNewThread(thread.agentId)}
                >
                  + New Thread
                </button>
              </div>

              {thread.messages.map((msg) => {
                const isUser = msg.agentId === 'user';
                const author = isUser ? null : agentById(msg.agentId);
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
                      <div className="bubble-text">{msg.content}</div>
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
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

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
        <ExportModal state={state} onClose={() => setActiveModal(null)} onToast={showToast} />
      )}
    </div>
  );
}
