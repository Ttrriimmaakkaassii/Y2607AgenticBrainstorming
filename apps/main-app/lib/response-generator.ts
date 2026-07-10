import { Agent, Message, Mood } from './types';

const MOOD_OPENERS: Record<Mood, string[]> = {
  debate: [
    'I have to push back on that.',
    "Here's the counterpoint worth considering.",
    "I'm not fully convinced yet.",
  ],
  complementary: [
    'Building on that idea,',
    'To add another angle,',
    "That's a great point, and",
  ],
  research: [
    'Looking at the evidence,',
    'Worth digging into further:',
    'One data point to consider:',
  ],
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function limitSentences(content: string, maxSentences: number): string {
  const sentences = content.match(/[^.!?]+[.!?]+/g) || [content];
  return sentences.slice(0, maxSentences).join(' ').trim();
}

export function generateAgentReply(
  agent: Agent,
  mood: Mood,
  precedingMessages: Message[],
  maxSentences: number,
  topic?: string
): string {
  const opener = pick(MOOD_OPENERS[mood]);
  const last = precedingMessages[precedingMessages.length - 1];
  const subject = last
    ? last.content.replace(/[.!?]+$/, '')
    : topic?.trim() || 'the topic at hand';

  const body = `${opener} As ${agent.role.toLowerCase()}, my take on "${subject.slice(
    0,
    80
  )}" is that it deserves closer attention given ${agent.instructions
    .toLowerCase()
    .slice(0, 60)}. Let's keep unpacking this.`;

  return limitSentences(body, maxSentences);
}
