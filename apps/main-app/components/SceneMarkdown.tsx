'use client';

import { Fragment, ReactNode } from 'react';

/** Bold, italic, and inline code within a single line — no external markdown dependency needed for this scope. */
function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="scene-inline-code">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

interface Block {
  type: 'code' | 'list' | 'text';
  content: string[];
}

function parseBlocks(content: string): Block[] {
  const lines = content.split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence
      blocks.push({ type: 'code', content: codeLines });
      continue;
    }
    if (/^[-*•]\s+/.test(line.trim())) {
      const listLines: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        listLines.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'list', content: listLines });
      continue;
    }
    const textLines: string[] = [];
    while (i < lines.length && !lines[i].trim().startsWith('```') && !/^[-*•]\s+/.test(lines[i].trim())) {
      textLines.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: 'text', content: textLines });
  }
  return blocks;
}

export function SceneMarkdown({ content }: { content: string }) {
  const blocks = parseBlocks(content);
  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === 'code') {
          return (
            <pre key={i} className="scene-code-block">
              <code>{block.content.join('\n')}</code>
            </pre>
          );
        }
        if (block.type === 'list') {
          return (
            <ul key={i} className="scene-list">
              {block.content.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        const text = block.content.join('\n').trim();
        if (!text) return null;
        return (
          <p key={i} className="scene-paragraph">
            {renderInline(text)}
          </p>
        );
      })}
    </>
  );
}
