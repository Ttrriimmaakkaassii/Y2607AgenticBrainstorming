export type Feedback = 'like' | 'dislike' | 'clarify';
export type Mood = 'debate' | 'complementary' | 'research';
export type LLMProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'zhipu'
  | 'moonshot'
  | 'xai'
  | 'mistral';
export type Effort = 'low' | 'medium' | 'high';
export type ResponseStyle = 'bullets' | 'sentences' | 'detailed' | 'mindmap';
export type ReactionType = 'elaborate' | 'explainFurther' | 'why' | 'sources' | 'mindmap' | 'bullets';

export interface Agent {
  id: string;
  /** Auto-assigned, immutable reference like "Agt1" — never reused, unlike name/role. */
  refNumber: string;
  name: string;
  role: string;
  instructions: string;
  color: string;
  llmProvider: LLMProvider;
  connectionId: string | null;
  /** Whether this agent participates in new discussion rounds. */
  active: boolean;
}

/**
 * A user-supplied provider credential + model choice. Lives only in
 * localStorage (see lib/llm-connections.ts) — never included in
 * ConversationState, since that gets synced to Supabase under a
 * public-read policy.
 */
export interface LLMConnection {
  id: string;
  provider: LLMProvider;
  model: string;
  effort: Effort;
  apiKey: string;
  label: string;
}

export interface Message {
  id: string;
  threadId: string;
  agentId: string | 'user';
  content: string;
  timestamp: number;
  feedback: Feedback | null;
  /** Id of another message this one is replying to (WhatsApp-style quote reply). */
  replyToId: string | null;
}

export interface Thread {
  id: string;
  agentId: string;
  createdAt: number;
  messages: Message[];
}

export interface ConversationSettings {
  topic: string;
  maxSentences: number;
  maxExchanges: number | null;
  maxTokens: number | null;
  orchestratorEnabled: boolean;
  mood: Mood;
  responseStyle: ResponseStyle;
  ttsRate: number;
  ttsLang: string;
}

export interface ConversationState {
  id: string;
  agents: Agent[];
  threads: Thread[];
  settings: ConversationSettings;
  status: 'idle' | 'running' | 'paused' | 'stopped';
  updatedAt: number;
  /** Counter for the next Agt<N> reference number — never decreases, so numbers aren't reused. */
  nextAgentNumber: number;
}

export interface ArchivedConversation {
  id: string;
  title: string;
  archivedAt: number;
  state: ConversationState;
}
