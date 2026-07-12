import { ReactionType } from './types';

export interface ReactionDef {
  type: ReactionType;
  icon: string;
  label: string;
  tooltip: string;
}

// Requires the message's author to be a connected agent — triggers a real follow-up reply.
export const AGENT_REACTIONS: ReactionDef[] = [
  { type: 'elaborate', icon: '🔎', label: 'Elaborate', tooltip: 'Ask this agent to elaborate with more depth' },
  { type: 'explainFurther', icon: '💬', label: 'Explain Further', tooltip: 'Ask this agent to explain further, more simply' },
  { type: 'why', icon: '❓', label: 'Why?', tooltip: 'Ask this agent why it said that' },
  { type: 'sources', icon: '📚', label: 'Sources', tooltip: 'Ask this agent for its sources/reasoning' },
  { type: 'bullets', icon: '•', label: 'Bullet Points', tooltip: 'Ask this agent to restate as bullet points' },
  { type: 'suggest', icon: '💡', label: 'Suggest', tooltip: 'Suggest a logical follow-up question or response' },
];

// Work on any message (agent or user) — no LLM call needed.
export const UNIVERSAL_REACTIONS: ReactionDef[] = [
  { type: 'mindmap', icon: '🗺️', label: 'Mind Map', tooltip: 'Turn this message into a mind map' },
  { type: 'youtube', icon: '📺', label: 'YouTube', tooltip: 'Search YouTube for related videos' },
  { type: 'tiktok', icon: '🎵', label: 'TikTok', tooltip: 'Search TikTok for related videos' },
];
