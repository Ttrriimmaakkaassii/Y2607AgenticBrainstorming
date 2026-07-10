'use client';

const PICTOS = ['🔹', '🔸', '✨', '🔷', '💡', '🎯', '📌', '🧩'];

interface SpokenRange {
  charIndex: number;
  charLength: number;
}

interface MessageContentProps {
  content: string;
  spokenRange: SpokenRange | null;
}

function renderWithHighlight(text: string, spokenRange: SpokenRange | null) {
  if (!spokenRange) return text;
  const { charIndex, charLength } = spokenRange;
  if (charIndex < 0 || charIndex >= text.length) return text;
  const before = text.slice(0, charIndex);
  const word = text.slice(charIndex, charIndex + charLength);
  const after = text.slice(charIndex + charLength);
  return (
    <>
      {before}
      <span className="spoken-word">{word}</span>
      {after}
    </>
  );
}

interface BulletLine {
  text: string;
  /** Start offset of `text` within the original content string, for aligning spokenRange. */
  offset: number;
}

function parseBullets(content: string): BulletLine[] | null {
  const rawLines = content.split('\n');
  const bulletLines: BulletLine[] = [];
  let cursor = 0;
  let nonEmptyCount = 0;

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (trimmed) {
      nonEmptyCount += 1;
      const match = /^[-*•]\s+/.exec(trimmed);
      if (match) {
        const lineStartInContent = content.indexOf(rawLine, cursor);
        const textStartInLine = rawLine.indexOf(trimmed) + match[0].length;
        bulletLines.push({
          text: trimmed.slice(match[0].length),
          offset: lineStartInContent + textStartInLine,
        });
      }
    }
    cursor += rawLine.length + 1;
  }

  if (bulletLines.length < 2 || bulletLines.length < nonEmptyCount * 0.6) return null;
  return bulletLines;
}

export function MessageContent({ content, spokenRange }: MessageContentProps) {
  const bullets = parseBullets(content);

  if (bullets) {
    return (
      <ol className="bullet-response">
        {bullets.map((line, i) => {
          const localRange =
            spokenRange &&
            spokenRange.charIndex >= line.offset &&
            spokenRange.charIndex < line.offset + line.text.length
              ? { charIndex: spokenRange.charIndex - line.offset, charLength: spokenRange.charLength }
              : null;
          return (
            <li key={i}>
              <span className="bullet-picto">{PICTOS[i % PICTOS.length]}</span>
              <span className="bullet-number">{i + 1}.</span>
              <span>{renderWithHighlight(line.text, localRange)}</span>
            </li>
          );
        })}
      </ol>
    );
  }

  return <>{renderWithHighlight(content, spokenRange)}</>;
}
