export type Feedback = 'like' | 'dislike' | 'clarify';
/** Built-in suggestions are 'debate' | 'complementary' | 'research', but users can add their own. */
export type Mood = string;
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
/** How agents relate to each other's messages: standalone statements vs. actively engaging back-and-forth. */
export type InteractionStyle = 'monologue' | 'dialogue';
export type ReactionType =
  | 'elaborate'
  | 'explainFurther'
  | 'why'
  | 'sources'
  | 'mindmap'
  | 'bullets'
  | 'suggest'
  | 'youtube'
  | 'tiktok';

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
  /** Explicit TTS voice override (SpeechSynthesisVoice.voiceURI). Null = auto-assigned. */
  voiceURI: string | null;
  /** Explicit Google Cloud TTS voice override (e.g. "en-US-Neural2-A"). Null = auto-assigned. */
  googleVoiceName: string | null;
  /** TraitDef.id -> 0-100. Missing key = unset, treated as 50 (neutral midpoint) at read time. */
  traits: Record<string, number>;
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
  starred: boolean;
  category: string | null;
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
  /** All selected moods are blended simultaneously. */
  moods: Mood[];
  responseStyle: ResponseStyle;
  interactionStyle: InteractionStyle;
  ttsRate: number;
  ttsLang: string;
  /** 'google' requires a saved Google Cloud TTS API key; falls back to 'browser' when absent. */
  ttsProvider: 'browser' | 'google';
  /** Digits only, international format without leading 00/+ (e.g. "212661320000"). */
  whatsappNumber: string;
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
