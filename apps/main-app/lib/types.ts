export type Feedback = 'like' | 'dislike' | 'clarify';
export type Mood = 'debate' | 'complementary' | 'research';
export type LLMProvider = 'openai' | 'anthropic' | 'google';

export interface Agent {
  id: string;
  name: string;
  role: string;
  instructions: string;
  color: string;
  llmProvider: LLMProvider;
}

export interface Message {
  id: string;
  threadId: string;
  agentId: string | 'user';
  content: string;
  timestamp: number;
  feedback: Feedback | null;
}

export interface Thread {
  id: string;
  agentId: string;
  createdAt: number;
  messages: Message[];
}

export interface ConversationSettings {
  maxSentences: number;
  maxExchanges: number | null;
  maxTokens: number | null;
  orchestratorEnabled: boolean;
  mood: Mood;
}

export interface ConversationState {
  id: string;
  agents: Agent[];
  threads: Thread[];
  settings: ConversationSettings;
  status: 'idle' | 'running' | 'paused' | 'stopped';
  updatedAt: number;
}
