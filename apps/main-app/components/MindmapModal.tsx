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

const SIZE_PRESETS = [
  { label: 'Small (800×600)', width: 800, height: 600 },
  { label: 'Medium (1600×1200)', width: 1600, height: 1200 },
  { label: 'Large (2400×1800)', width: 2400, height: 1800 },
];

function fileBase(title: string): string {
  return title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'mindmap';
}

async function rasterize(svg: SVGSVGElement, width: number, height: number): Promise<HTMLCanvasElement> {
  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(svg);
  const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to rasterize mind map'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function MindmapModal({ markdown, title, onClose }: MindmapModalProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const markmapRef = useRef<Markmap | null>(null);
  const [wrapWidth, setWrapWidth] = useState(300);
  const [exportWidth, setExportWidth] = useState(1600);
  const [exportHeight, setExportHeight] = useState(1200);
  const [exporting, setExporting] = useState(false);

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
    link.download = `${fileBase(title)}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadJpg() {
    if (!svgRef.current) return;
    setExporting(true);
    try {
      const canvas = await rasterize(svgRef.current, exportWidth, exportHeight);
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/jpeg', 0.92);
      link.download = `${fileBase(title)}.jpg`;
      link.click();
    } catch {
      // rasterize() already narrows failure causes; nothing else to add here
    } finally {
      setExporting(false);
    }
  }

  async function downloadPdf() {
    if (!svgRef.current) return;
    setExporting(true);
    try {
      const canvas = await rasterize(svgRef.current, exportWidth, exportHeight);
      const { jsPDF } = await import('jspdf');
      const orientation = exportWidth >= exportHeight ? 'landscape' : 'portrait';
      const pdf = new jsPDF({ orientation, unit: 'px', format: [exportWidth, exportHeight] });
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, exportWidth, exportHeight);
      pdf.save(`${fileBase(title)}.pdf`);
    } finally {
      setExporting(false);
    }
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
              📥 SVG
            </button>
          </div>
          <svg ref={svgRef} style={{ width: '100%', height: '60vh' }} />

          <div className="mindmap-export-bar">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Export size</label>
              <select
                onChange={(e) => {
                  const preset = SIZE_PRESETS[Number(e.target.value)];
                  if (preset) {
                    setExportWidth(preset.width);
                    setExportHeight(preset.height);
                  }
                }}
                defaultValue="1"
              >
                {SIZE_PRESETS.map((p, i) => (
                  <option key={p.label} value={i}>
                    {p.label}
                  </option>
                ))}
                <option value="custom">Custom (set below)</option>
              </select>
            </div>
            <div className="mindmap-size-inputs">
              <input
                type="number"
                min={100}
                max={5000}
                value={exportWidth}
                onChange={(e) => setExportWidth(Number(e.target.value) || 100)}
                title="Width (px)"
              />
              <span>×</span>
              <input
                type="number"
                min={100}
                max={5000}
                value={exportHeight}
                onChange={(e) => setExportHeight(Number(e.target.value) || 100)}
                title="Height (px)"
              />
              <span>px</span>
            </div>
            <button className="btn-secondary" style={{ width: 'auto' }} disabled={exporting} onClick={downloadJpg}>
              🖼️ {exporting ? 'Exporting…' : 'Download JPG'}
            </button>
            <button className="btn-secondary" style={{ width: 'auto' }} disabled={exporting} onClick={downloadPdf}>
              📄 {exporting ? 'Exporting…' : 'Download PDF'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
