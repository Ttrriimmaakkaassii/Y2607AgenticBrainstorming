import { Agent, Message, Thread } from './types';

function authorLabel(agents: Agent[], agentId: string): string {
  if (agentId === 'user') return 'You';
  const agent = agents.find((a) => a.id === agentId);
  return agent ? `${agent.refNumber} ${agent.name}` : 'Unknown';
}

/** Builds markmap-flavored markdown (heading levels become mind map depth) for a whole conversation. */
export function buildConversationMindmapMarkdown(
  agents: Agent[],
  threads: Thread[],
  topic: string
): string {
  const lines = [`# ${topic || 'Conversation'}`];
  threads.forEach((thread, i) => {
    lines.push(`## Thread ${i + 1}: ${authorLabel(agents, thread.agentId)}`);
    thread.messages.forEach((msg) => {
      lines.push(`### ${authorLabel(agents, msg.agentId)}`);
      lines.push(`- ${msg.content}`);
    });
  });
  return lines.join('\n');
}

/** Builds a focused mind map for a single message (used by the "Mindmap" reaction). */
export function buildMessageMindmapMarkdown(agents: Agent[], message: Message): string {
  const lines = [`# ${authorLabel(agents, message.agentId)}`];
  const sentences = message.content.match(/[^.!?]+[.!?]*/g) || [message.content];
  sentences.forEach((sentence) => {
    const trimmed = sentence.trim();
    if (trimmed) lines.push(`- ${trimmed}`);
  });
  return lines.join('\n');
}
