export type Feedback = 'like' | 'dislike' | 'clarify';
/** Built-in suggestions are 'debate' | 'complementary' | 'research', but users can add their own. */
export type Mood = string;

/** Chart types a Chart-expert agent can emit as its reply (lib/chart-render.tsx renders each). */
export type ChartType = 'bar' | 'line' | 'multiAxis' | 'heatmap';
export interface ChartSeries {
  name: string;
  data: number[];
  /** For multiAxis only: which y-axis (0=left, 1=right) this series binds to. */
  axis?: 0 | 1;
  color?: string;
}
export interface ChartSpec {
  type: ChartType;
  title?: string;
  xLabel?: string;
  yLabel?: string;
  /** X-axis category labels (bar/line/multiAxis). */
  categories?: string[];
  /** Data series (bar/line/multiAxis). Omitted for heatmaps (which use rows/cols/values). */
  series?: ChartSeries[];
  /** Heatmap only: row labels, column labels, and values[row][col]. */
  rows?: string[];
  cols?: string[];
  values?: number[][];
}
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
  /** Persona/voice/background — the "who you are" block in the prompt. Free text. Empty = omitted from the prompt. */
  identity: string;
  /** Areas of expertise / capabilities — the "what you're good at" block. Empty = omitted from the prompt. */
  skills: string;
  /** How this agent participates in & paces the discussion loop, incl. how to avoid repeating itself. Empty = a sensible anti-repeat fallback is used. */
  loopGuidance: string;
  /** Free-text description used as input for the ✨ Auto-populate buttons. Never read by the prompt itself. */
  description: string;
  color: string;
  llmProvider: LLMProvider;
  connectionId: string | null;
  /** Whether this agent is enabled/on. Active agents feed the background moderator (see lib/orchestrator + ChatApp's advisor polling); they do NOT necessarily speak in the rounds — that's `participant`. */
  active: boolean;
  /** Whether this agent joins the visible discussion rounds. participant implies active (participant ⇒ active); an active agent that is NOT a participant is a background "advisor" that only feeds the moderator. */
  participant: boolean;
  /** When true, this agent starts active by default in every brand-new tab/conversation, instead of needing a category pick or manual activation each time. */
  pinnedToAllConversations: boolean;
  /** When true, this agent gets a real web_search tool (see lib/llm-client.ts's runWithTools) instead of just being told it can't browse the web. */
  webSearchEnabled: boolean;
  /** When true, this agent gets a generate_chart tool and may emit charts (bar/line/multiAxis/heatmap) as its reply — a "Chart expert". */
  chartEnabled: boolean;
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
  /** One entry per successful web_search tool call made while generating this reply — finds candidate URLs from a query, doesn't fetch full content (see webBrowses for that). Absent for agents without web access enabled, or replies that didn't need to search. */
  webSearches?: {
    query: string;
    resultCount: number;
    sources: { title: string; url: string }[];
    searchedAt: string;
  }[];
  /** One entry per successful browse_url tool call made while generating this reply — full content of one already-known URL. Absent for agents without web access enabled, or replies that didn't need to browse anything. */
  webBrowses?: {
    url: string;
    contentLength: number;
    browsedAt: string;
  }[];
  /** True if the agent attempted a web call this turn but it failed (so the answer came from training knowledge, not the web). Absent/undefined = no web attempt was made at all. Drives the 🌐❌ vs 🌐 indicator. */
  webAccessFailed?: boolean;
  /** Charts the agent emitted this turn via its generate_chart tool (Chart-expert agents). Rendered inline in the bubble by lib/chart-render.tsx. */
  charts?: ChartSpec[];
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
  /** How many bullet points to ask for when Response Style is "Bullet Points". Persisted so it stays put as the default until the user changes it. */
  bulletCount: number;
  maxExchanges: number | null;
  maxTokens: number | null;
  orchestratorEnabled: boolean;
  /** When true, each agent's drafted reply is checked by the orchestrator repetition judge (lib/orchestrator.ts): if it restates recent points, the agent is re-prompted once to elaborate on the same subject differently. Independent of orchestratorEnabled (Auto Mode). */
  repetitionGuardEnabled: boolean;
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
  /** Text size for message bubbles in Thread View — also the default for Scene View's central bubble text size. */
  textSize: 'xs' | 'sm' | 'md' | 'lg';
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
