'use client';

import { useEffect, useRef } from 'react';
import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';

const transformer = new Transformer();

/**
 * Compact inline markmap renderer — the same engine as MindmapModal, but sized
 * to sit beside/under a message in "mindmap mode" (#38). Renders a small SVG
 * from the given markdown (already generated — no LLM call here). Shows a
 * placeholder while markdown is empty (still generating).
 */
export function InlineMindmap({ markdown }: { markdown: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const markmapRef = useRef<Markmap | null>(null);

  useEffect(() => {
    if (!svgRef.current || !markdown) return;
    try {
      const { root } = transformer.transform(markdown);
      if (!markmapRef.current) {
        markmapRef.current = Markmap.create(svgRef.current, { maxWidth: 220 }, root);
      } else {
        markmapRef.current.setData(root);
      }
      markmapRef.current.fit();
    } catch {
      /* malformed markdown — leave the placeholder */
    }
    return () => {
      markmapRef.current?.destroy();
      markmapRef.current = null;
    };
  }, [markdown]);

  if (!markdown) {
    return <div className="inline-mindmap inline-mindmap-loading">🧠 generating…</div>;
  }
  return (
    <div className="inline-mindmap">
      <svg ref={svgRef} style={{ width: '100%', height: 180 }} />
    </div>
  );
}
