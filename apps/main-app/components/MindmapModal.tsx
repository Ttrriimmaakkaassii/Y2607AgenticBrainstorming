'use client';

import { useEffect, useRef } from 'react';
import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';

interface MindmapModalProps {
  markdown: string;
  title: string;
  onClose: () => void;
}

const transformer = new Transformer();

export function MindmapModal({ markdown, title, onClose }: MindmapModalProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const markmapRef = useRef<Markmap | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    const { root } = transformer.transform(markdown);
    if (!markmapRef.current) {
      markmapRef.current = Markmap.create(svgRef.current, undefined, root);
    } else {
      markmapRef.current.setData(root);
    }
    markmapRef.current.fit();

    return () => {
      markmapRef.current?.destroy();
      markmapRef.current = null;
    };
  }, [markdown]);

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 900, width: '95%' }}
      >
        <div className="modal-header">
          <span className="modal-title">🗺️ {title}</span>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <svg ref={svgRef} style={{ width: '100%', height: '60vh' }} />
        </div>
      </div>
    </div>
  );
}
