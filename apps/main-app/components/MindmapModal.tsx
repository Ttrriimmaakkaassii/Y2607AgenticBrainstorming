'use client';

import { useEffect, useRef, useState } from 'react';
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
  const [wrapWidth, setWrapWidth] = useState(300);

  useEffect(() => {
    if (!svgRef.current) return;
    const { root } = transformer.transform(markdown);
    if (!markmapRef.current) {
      markmapRef.current = Markmap.create(svgRef.current, { maxWidth: wrapWidth }, root);
    } else {
      markmapRef.current.setData(root);
    }
    markmapRef.current.fit();

    return () => {
      markmapRef.current?.destroy();
      markmapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markdown]);

  useEffect(() => {
    if (!markmapRef.current) return;
    markmapRef.current.setOptions({ maxWidth: wrapWidth });
    markmapRef.current.renderData();
    markmapRef.current.fit();
  }, [wrapWidth]);

  function downloadSvg() {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgRef.current);
    const blob = new Blob([`<?xml version="1.0" standalone="no"?>\n${source}`], {
      type: 'image/svg+xml',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'mindmap'}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }

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
          <div className="mindmap-toolbar">
            <label className="control-label">
              Text wrap width:
              <input
                type="range"
                min={120}
                max={600}
                step={20}
                value={wrapWidth}
                onChange={(e) => setWrapWidth(Number(e.target.value))}
              />
              {wrapWidth}px
            </label>
            <button className="btn-secondary" onClick={downloadSvg} style={{ width: 'auto' }}>
              📥 Download SVG
            </button>
          </div>
          <svg ref={svgRef} style={{ width: '100%', height: '60vh' }} />
        </div>
      </div>
    </div>
  );
}
