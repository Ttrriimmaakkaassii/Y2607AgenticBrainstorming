import { Agent, Message, Mood } from './types';

interface ChatApiResponse {
  content?: string;
  error?: string;
}

function buildSystemPrompt(agent: Agent, mood: Mood, maxSentences: number): string {
  return `You are ${agent.name}, acting as a ${agent.role} in a multi-agent discussion. Instructions: ${agent.instructions} The discussion mood is "${mood}". Reply in at most ${maxSentences} sentences, in character, without restating your name.`;
}

function buildUserPrompt(topic: string, history: Message[], agents: Agent[]): string {
  const transcript = history
    .slice(-8)
    .map((m) => {
      const author = m.agentId === 'user' ? 'User' : agents.find((a) => a.id === m.agentId)?.name ?? 'Agent';
      return `${author}: ${m.content}`;
    })
    .join('\n');

  if (!transcript) {
    return `Start a discussion on: ${topic || 'a topic of your choosing'}`;
  }
  return `Topic: ${topic || '(unspecified)'}\n\nConversation so far:\n${transcript}\n\nContinue the discussion with your next message.`;
}

/**
 * Calls the /api/chat Pages Function for a real LLM reply.
 * Returns null if no provider key is configured server-side or the call fails,
 * so callers can fall back to the simulated response generator.
 */
export async function fetchAgentReply(
  agent: Agent,
  mood: Mood,
  topic: string,
  history: Message[],
  agents: Agent[],
  maxSentences: number
): Promise<string | null> {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: agent.llmProvider,
        systemPrompt: buildSystemPrompt(agent, mood, maxSentences),
        userPrompt: buildUserPrompt(topic, history, agents),
      }),
    });

    if (!res.ok) return null;
    const data: ChatApiResponse = await res.json();
    return data.content?.trim() || null;
  } catch {
    return null;
  }
}
