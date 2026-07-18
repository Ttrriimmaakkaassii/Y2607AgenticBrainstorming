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
  /** User-assigned importance weight (0-100). Null = equal/unset. Used by the
   * moderator to decide who to hear most. Excludes moderator agents. */
  importance?: number | null;
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

// --- Configurable agent-to-agent (A2A) communication ---------------------
// Adapted to this app's conventions. NOT a verified implementation of Google
// A2A or any external standard — names/shapes are project-local.

export type AgentCommunicationMode = 'natural_language' | 'a2a';
/** How structured A2A envelopes are shown to the user. */
export type AgentCommunicationDisplay = 'natural_language' | 'a2a_readable' | 'a2a_raw';

export type A2APhase =
  | 'objective' | 'planning' | 'evidence_collection' | 'analysis'
  | 'decision' | 'execution' | 'review' | 'complete' | 'error';
export type A2AIntent =
  | 'delegate' | 'request' | 'respond' | 'submit_evidence' | 'challenge'
  | 'approve' | 'reject' | 'handoff' | 'status' | 'final';
export type A2AConfidence = 'high' | 'medium' | 'low' | 'insufficient_evidence';
export type A2AClaimClassification =
  | 'verified' | 'unverified' | 'inference' | 'hypothesis' | 'assumption';
export type A2AStatus = 'queued' | 'thinking' | 'streaming' | 'complete' | 'failed';

export interface A2AClaim {
  claimId: string;
  text: string;
  classification: A2AClaimClassification;
  evidenceRefs: string[];
  allowedInFinalAnswer: boolean;
}

/** Structured envelope agents exchange in A2A mode. The raw envelope stays in
 * the background; the UI renders a readable NL view derived from its fields. */
export interface A2AMessage {
  version: 1;
  messageId: string;
  conversationId: string;
  taskId?: string;
  parentMessageId?: string;
  fromAgent: string;
  toAgent: string | string[];
  phase: A2APhase;
  intent: A2AIntent;
  claims?: A2AClaim[];
  evidenceRefs?: string[];
  decisions?: string[];
  openQuestions?: string[];
  requestedAction?: string;
  naturalLanguageSummary: string;
  confidence?: A2AConfidence;
  status: A2AStatus;
  createdAt: string;
  startedAt?: string;
  firstTokenAt?: string;
  completedAt?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

/** Per-execution timing captured by the application (NOT text generated by the
 * model). Non-streaming providers set firstTokenAt = completedAt. */
export interface AgentTiming {
  executionId: string;
  queuedAt?: string;
  startedAt: string;
  firstTokenAt?: string;
  completedAt?: string;
  failedAt?: string;
  queueDurationMs?: number;
  timeToFirstTokenMs?: number;
  generationDurationMs?: number;
  totalDurationMs?: number;
}

/** Canonical shared state for a conversation — authoritative; agents reference
 * stored claims/evidence by stable id instead of copying full content. */
export interface VerifiedFact { id: string; text: string; evidenceRefs: string[]; updatedAt: string; }
export interface PendingClaim { id: string; text: string; classification: A2AClaimClassification; evidenceRefs: string[]; updatedAt: string; }
export interface RejectedClaim { id: string; text: string; reason: string; updatedAt: string; }

export interface SharedAgentState {
  revision: number;
  conversationId: string;
  objective?: string;
  activePhase?: A2APhase;
  activeTaskId?: string;
  assignedSpeaker?: string;
  verifiedFacts: Record<string, VerifiedFact>;
  pendingClaims: Record<string, PendingClaim>;
  rejectedClaims: Record<string, RejectedClaim>;
  decisions: string[];
  openQuestions: string[];
  completedTasks: string[];
  updatedAt: string;
}

/** Delta applied to SharedAgentState (revision-bumped). */
export interface AgentStateDelta {
  baseRevision: number;
  nextRevision: number;
  addFacts?: VerifiedFact[];
  updateClaims?: PendingClaim[];
  rejectClaims?: { id: string; reason: string }[];
  addDecisions?: string[];
  closeQuestions?: string[];
  setPhase?: A2APhase;
  setAssignedSpeaker?: string;
}

/** Speaker-gating verdict — only permitted agents are invoked. */
export interface SpeakerPermission {
  isAssignedSpeaker: boolean;
  isDirectlyAddressed: boolean;
  isAllowedInCurrentPhase: boolean;
  upstreamRequirementsComplete: boolean;
  allowed: boolean;
  reason?: string;
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
  /** Stable id for this agent execution — used for idempotent appends and to correlate streaming/timing events. Absent on old messages. */
  executionId?: string;
  /** Application-captured timing for this reply (non-streaming: firstTokenAt = completedAt). Absent on old/user messages — never fabricated. */
  timing?: AgentTiming;
  /** Structured A2A envelope, present only in A2A communication mode and only when validation passed. Absent on old/NL messages. */
  a2aEnvelope?: A2AMessage;
  /** Concise, safe error when an A2A envelope failed validation (envelope rejected; NL content preserved). */
  a2aError?: string;
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
  /** How agents communicate internally: natural language or structured A2A envelopes. A global default (lib/communication-mode.ts) is the fallback when this is unset. */
  communicationMode?: AgentCommunicationMode;
  /** How structured A2A envelopes are rendered to the user (NL / readable card / raw JSON). */
  a2aDisplayMode?: AgentCommunicationDisplay;
  /** Canonical shared conversation state (verified facts, claims, decisions). Authoritative; agents reference entries by stable id. */
  sharedState?: SharedAgentState;
  /** The user's confirmed objective — persists across turns, prevents repeated questions. */
  objective?: ObjectiveRecord;
  /** First-class tasks with lifecycle + acceptance gates. */
  tasks?: AgentTask[];
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

/** Lifecycle of one agent execution. COMPLETE means the required deliverable
 * was produced and persisted; a tool call yields waiting_for_tool, not
 * completed. SKIPPED/CANCELLED are non-terminal-for-the-round outcomes that
 * must NOT produce a message or consume tokens. */
export type ExecutionStatus =
  | 'queued'
  | 'running'
  | 'waiting_for_tool'
  | 'processing_tool_result'
  | 'submitting'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'skipped';

/** Internal conversation events — DISTINCT from Message. Tool executions,
 * scheduling decisions (skipped agents), state transitions, and system
 * status are recorded here, NEVER as assistant messages. Bounded ring buffer. */
export type ConversationEvent =
  | { kind: 'tool_execution'; at: string; executionId?: string; agentId: string; tool: string; ok: boolean }
  | { kind: 'state_transition'; at: string; from?: string; to: string; reason?: string }
  | { kind: 'agent_skipped'; at: string; agentId: string; reason: string }
  | { kind: 'system_status'; at: string; status: ExecutionStatus | ConversationState['status']; message: string };

export interface ConversationState {
  id: string;
  agents: Agent[];
  threads: Thread[];
  settings: ConversationSettings;
  /** 'awaiting_user' suspends the scheduler until a new user message arrives —
   * prevents a Moderator timeout or phase drift from continuing autonomously. */
  status: 'idle' | 'running' | 'paused' | 'stopped' | 'awaiting_user';
  updatedAt: number;
  /** Counter for the next Agt<N> reference number — never decreases, so numbers aren't reused. */
  nextAgentNumber: number;
  /** Bounded internal event log (newest last). Tool calls / skips / transitions
   * live here, separate from Message — they never appear as assistant messages. */
  events?: ConversationEvent[];
  /** When true, the scheduler may continue across phases/tasks without waiting
   * for the user. DEFAULT FALSE — autonomous continuation must be explicit. */
  autonomousMode?: boolean;
}

// =====================================================================
// DETERMINISTIC ORCHESTRATION TYPES (Phases 1–4)
// The application runtime — NOT the LLM — controls all of these.
// =====================================================================

// --- Phase 1: Objective record ---------------------------------------

export interface ObjectiveRecord {
  objectiveId: string;
  summary: string;
  /** Key → value (e.g. { minimumAreaM2: '20000', assetType: 'land' }). */
  confirmedFacts: Record<string, string>;
  constraints: Record<string, string>;
  preferences: Record<string, string>;
  /** Fields the system still needs from the user (may be empty). */
  unresolvedFields: string[];
  /** Older objective ids this one supersedes (on correction / objective change). */
  supersededObjectiveIds: string[];
  createdAt: string;
  updatedAt: string;
}

// --- Phase 2: Task system --------------------------------------------

export type AgentTaskStatus =
  | 'queued'
  | 'assigned'
  | 'running'
  | 'waiting_for_tool'
  | 'processing'
  | 'deliverable_submitted'
  | 'accepted'
  | 'rejected'
  | 'failed'
  | 'cancelled';

export type DeliverableType = 'research_evidence' | 'comparison' | 'recommendation' | 'general';

export interface AgentTask {
  taskId: string;
  conversationId: string;
  taskType: string;
  objective: string;
  exactQuestions: string[];
  assignedAgentId?: string;
  allowedAgentIds: string[];
  prerequisites: string[];
  requiredDeliverableType: DeliverableType;
  acceptanceCriteria: string[];
  status: AgentTaskStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface DeliverableResult {
  accepted: boolean;
  reasons: string[];
}

// --- Phase 3: Claims / Evidence / Corrections ------------------------

export type ClaimStatus =
  | 'verified'
  | 'unverified'
  | 'seller_claim'
  | 'inference'
  | 'hypothesis'
  | 'assumption'
  | 'rejected'
  | 'conflicting_evidence';

export type ClaimMateriality = 'critical' | 'high' | 'medium' | 'low';

export interface ClaimRecord {
  claimId: string;
  conversationId: string;
  taskId?: string;
  text: string;
  status: ClaimStatus;
  evidenceIds: string[];
  createdByAgentId: string;
  materiality: ClaimMateriality;
  allowedInRecommendation: boolean;
  allowedInFinalAnswer: boolean;
  createdAt: string;
  updatedAt: string;
}

export type EvidenceSourceType = 'official' | 'primary' | 'secondary' | 'commercial' | 'informal' | 'user_provided';

export interface EvidenceRecord {
  evidenceId: string;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceType: EvidenceSourceType;
  publicationDate?: string;
  retrievedAt: string;
  excerpt?: string;
  supportsClaimIds: string[];
  quality: 'high' | 'medium' | 'low';
  limitations: string[];
}

export interface CorrectionRecord {
  correctionId: string;
  originalClaimId: string;
  reason: string;
  correctedClaimId?: string;
  createdAt: string;
}

// --- Phase 3: Chart-data validation ----------------------------------

export interface ChartDataPoint {
  label: string;
  value: number;
  unit: string;
  claimId?: string;
  evidenceIds?: string[];
  status: 'verified' | 'estimate';
}

// --- Phase 4: Formal state-transition events -------------------------

export type EngineConversationEvent =
  | { type: 'USER_MESSAGE_RECEIVED'; messageId: string }
  | { type: 'OBJECTIVE_CONFIRMED'; objectiveId: string }
  | { type: 'TASK_CREATED'; taskId: string }
  | { type: 'AGENT_ASSIGNED'; taskId: string; agentId: string }
  | { type: 'AGENT_STARTED'; executionId: string; agentId: string }
  | { type: 'TOOL_REQUESTED'; executionId: string; toolCallId: string }
  | { type: 'TOOL_RESULT_RECEIVED'; executionId: string; toolCallId: string }
  | { type: 'DELIVERABLE_SUBMITTED'; taskId: string }
  | { type: 'DELIVERABLE_ACCEPTED'; taskId: string }
  | { type: 'DELIVERABLE_REJECTED'; taskId: string; reasons: string[] }
  | { type: 'USER_INPUT_REQUIRED'; requestId: string }
  | { type: 'AGENT_FAILED'; executionId: string; errorCode: string }
  | { type: 'CONVERSATION_COMPLETED' };

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
