import { Agent, Message, Thread } from './types';

const PICTOS = ['🔹', '🔸', '✨', '🔷', '💡', '🎯', '📌', '🧩'];

function picto(index: number): string {
  return PICTOS[index % PICTOS.length];
}

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
    lines.push(`## ${picto(i)} Thread ${i + 1}: ${authorLabel(agents, thread.agentId)}`);
    thread.messages.forEach((msg, j) => {
      lines.push(`### ${authorLabel(agents, msg.agentId)}`);
      lines.push(`- ${picto(j)} ${j + 1}. ${msg.content}`);
    });
  });
  return lines.join('\n');
}

/** Builds a focused mind map for a single message (used by the "Mindmap" reaction). */
export function buildMessageMindmapMarkdown(agents: Agent[], message: Message): string {
  const lines = [`# ${authorLabel(agents, message.agentId)}`];
  const sentences = message.content.match(/[^.!?]+[.!?]*/g) || [message.content];
  sentences.forEach((sentence, i) => {
    const trimmed = sentence.trim();
    if (trimmed) lines.push(`- ${picto(i)} ${i + 1}. ${trimmed}`);
  });
  return lines.join('\n');
}

/**
 * Builds a mind map from an arbitrary free-text field (an agent's Identity /
 * Instructions / Skills / Loops). If the text already has line/bullet
 * structure, each line becomes a node; otherwise each sentence does. Empty
 * text yields a single root node so the view still opens cleanly.
 */
export function buildTextFieldMindmapMarkdown(title: string, text: string): string {
  const root = title.trim() || 'Field';
  const body = text.trim();
  if (!body) return `# ${root}`;
  let chunks: string[];
  if (/\n/.test(body) || /^\s*[-*]\s/m.test(body)) {
    chunks = body
      .split(/\n+/)
      .map((l) => l.replace(/^\s*[-*]\s+/, '').replace(/^\s*\d+[.)]\s+/, '').trim())
      .filter(Boolean);
  } else {
    chunks = (body.match(/[^.!?]+[.!?]*/g) || [body]).map((s) => s.trim()).filter(Boolean);
  }
  const lines = [`# ${root}`];
  chunks.forEach((c, i) => lines.push(`- ${picto(i)} ${c}`));
  return lines.join('\n');
}
