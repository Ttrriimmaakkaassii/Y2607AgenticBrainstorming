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
  /** Token usage snapshot from whichever LLM connection generated this message — absent for user-authored messages and for messages sent before this was tracked. */
  inputTokens?: number;
  outputTokens?: number;
  /** Provider/model snapshotted at send time, independent of the LLMConnection's current (possibly edited/deleted) state. */
  provider?: LLMProvider;
  model?: string;
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
  /**
   * 'google' requires a saved Gemini API key; 'custom' requires a saved
   * base URL + API key for a BYO TTS HTTP service. Both fall back to
   * 'browser' when their credentials are absent.
   */
  ttsProvider: 'browser' | 'google' | 'custom';
  /** Gemini TTS model id, e.g. "gemini-2.5-flash-preview-tts". */
  googleTtsModel: string;
  /** Digits only, international format without leading 00/+ (e.g. "212661320000"). */
  whatsappNumber: string;
  /** Whether every agent's prompt gets a cross-thread "shared wiki" digest injected — auto-on for every conversation; still needs a Wiki Keeper connection picked to actually generate anything. */
  wikiEnabled: boolean;
  /** Which LLMConnection generates/refreshes the wiki digest. Null = no keeper chosen yet. */
  wikiKeeperConnectionId: string | null;
  /** Regenerate the digest after this many new messages (across all threads) since the last refresh. */
  wikiRefreshInterval: number;
  /** LLM-authored rolling summary of facts/decisions/open questions across ALL threads — the only cross-thread memory agents get. */
  wikiDigest: string;
  wikiUpdatedAt: number;
  /** Total message count (across all threads) at the time of the last digest refresh — used to compute the "N new messages" trigger. */
  wikiMessageCountAtLastUpdate: number;
  /** Past digest snapshots, newest first, capped to a bounded length — lets the user browse how the wiki evolved. */
  wikiHistory: { digest: string; updatedAt: number; messageCount: number }[];
  /** Whether switching conversation tabs auto-pauses a tab that's actively generating a reply (default true). */
  pauseOnTabSwitch: boolean;
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
  /** User-assigned tag for organizing historic conversations. Null = uncategorized. */
  category: string | null;
  /** User-assigned color (hex) for quick visual scanning in the Archives list. Null = no color set. */
  color: string | null;
  state: ConversationState;
}
