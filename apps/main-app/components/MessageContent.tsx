'use client';

const PICTOS = ['🔹', '🔸', '✨', '🔷', '💡', '🎯', '📌', '🧩'];

interface SpokenRange {
  charIndex: number;
  charLength: number;
}

interface MessageContentProps {
  content: string;
  spokenRange: SpokenRange | null;
  /** Case-insensitive substring to highlight (from the search bar), or empty/undefined for none. */
  searchQuery?: string;
}

/** Wraps every case-insensitive occurrence of `query` in `text` with a <mark>. */
function highlightSearchMatches(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let matchAt = lower.indexOf(q, cursor);
  let key = 0;
  while (matchAt !== -1) {
    if (matchAt > cursor) parts.push(text.slice(cursor, matchAt));
    parts.push(
      <mark key={key++} className="search-match">
        {text.slice(matchAt, matchAt + q.length)}
      </mark>
    );
    cursor = matchAt + q.length;
    matchAt = lower.indexOf(q, cursor);
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.length > 0 ? parts : text;
}

function renderWithHighlight(text: string, spokenRange: SpokenRange | null, searchQuery: string) {
  if (!spokenRange) return highlightSearchMatches(text, searchQuery);
  const { charIndex, charLength } = spokenRange;
  if (charIndex < 0 || charIndex >= text.length) return highlightSearchMatches(text, searchQuery);
  const before = text.slice(0, charIndex);
  const word = text.slice(charIndex, charIndex + charLength);
  const after = text.slice(charIndex + charLength);
  return (
    <>
      {highlightSearchMatches(before, searchQuery)}
      <span className="spoken-word">{word}</span>
      {highlightSearchMatches(after, searchQuery)}
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

export function MessageContent({ content, spokenRange, searchQuery }: MessageContentProps) {
  const bullets = parseBullets(content);
  const query = searchQuery?.trim() ?? '';

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
              <span>{renderWithHighlight(line.text, localRange, query)}</span>
            </li>
          );
        })}
      </ol>
    );
  }

  return <>{renderWithHighlight(content, spokenRange, query)}</>;
}
