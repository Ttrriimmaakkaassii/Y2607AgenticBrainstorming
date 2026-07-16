'use client';

import { ChartSpec, ChartSeries } from './types';

/**
 * Hand-rolled SVG chart renderer for Chart-expert agent replies — no chart
 * dependency, so the static export stays lean. Supports the four types an
 * agent may choose — bar, line, multi-y-axis line, and heatmap — with axes,
 * a legend, and a title. Each chart renders inside the agent's message bubble
 * (see ChatApp's bubble render), so the chart literally IS part of the reply.
 */

const PALETTE = ['#3b99fc', '#2ecc71', '#f39c12', '#e74c3c', '#9b59b6', '#1abc9c', '#e84393', '#fdcb6e'];

function colorFor(i: number, override?: string): string {
  return override || PALETTE[i % PALETTE.length];
}

function niceBounds(max: number): { max: number; step: number } {
  if (max <= 0) return { max: 1, step: 0.2 };
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / pow;
  const niceN = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  const niceMax = niceN * pow;
  return { max: niceMax, step: niceMax / 5 };
}

/** bar + line + multiAxis share an axis/category frame; heatmap is its own grid. */
function CategoryChart({ spec }: { spec: ChartSpec }) {
  const categories = spec.categories ?? [];
  const multi = spec.type === 'multiAxis';
  const series = spec.series ?? [];

  // Compute y bounds (per axis for multiAxis).
  const allVals = series.flatMap((s) => s.data);
  const leftSeries = multi ? series.filter((s) => (s.axis ?? 0) === 0) : series;
  const rightSeries = multi ? series.filter((s) => s.axis === 1) : [];
  const leftMax = Math.max(1, ...leftSeries.flatMap((s) => s.data));
  const rightMax = Math.max(1, ...rightSeries.flatMap((s) => s.data));
  const left = niceBounds(leftMax);
  const right = niceBounds(rightMax);

  const W = 520;
  const H = 300;
  const m = { top: 16, right: multi ? 48 : 16, bottom: 40, left: 48 };
  const pw = W - m.left - m.right;
  const ph = H - m.top - m.bottom;
  const n = Math.max(1, categories.length || series[0]?.data.length || 1);
  const x = (i: number) => m.left + (n === 1 ? pw / 2 : (i / (n - 1)) * pw);
  const yLeft = (v: number) => m.top + ph - (v / left.max) * ph;
  const yRight = (v: number) => m.top + ph - (v / right.max) * ph;

  const gridLines = [0, 0.2, 0.4, 0.6, 0.8, 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', maxWidth: 560 }}>
      {/* grid + left axis ticks */}
      {gridLines.map((g, i) => {
        const yy = m.top + ph - g * ph;
        const val = Math.round(left.max * g);
        return (
          <g key={`gl-${i}`}>
            <line x1={m.left} y1={yy} x2={W - m.right} y2={yy} stroke="rgba(127,127,127,0.25)" strokeWidth={1} />
            <text x={m.left - 6} y={yy + 3} textAnchor="end" fontSize={9} fill="currentColor" opacity={0.7}>
              {val}
            </text>
            {multi && (
              <text x={W - m.right + 6} y={yy + 3} textAnchor="start" fontSize={9} fill="currentColor" opacity={0.7}>
                {Math.round(right.max * g)}
              </text>
            )}
          </g>
        );
      })}
      {/* x-axis category labels (rotated if long) */}
      {categories.map((c, i) => (
        <text key={`cat-${i}`} x={x(i)} y={m.top + ph + 14} textAnchor="middle" fontSize={9} fill="currentColor" opacity={0.8}>
          {String(c).length > 8 ? `${String(c).slice(0, 7)}…` : c}
        </text>
      ))}
      {spec.xLabel && (
        <text x={m.left + pw / 2} y={H - 4} textAnchor="middle" fontSize={10} fill="currentColor" opacity={0.7}>
          {spec.xLabel}
        </text>
      )}
      {spec.yLabel && (
        <text x={10} y={m.top + ph / 2} textAnchor="middle" fontSize={10} fill="currentColor" opacity={0.7} transform={`rotate(-90 10 ${m.top + ph / 2})`}>
          {spec.yLabel}
        </text>
      )}

      {/* series */}
      {spec.type === 'bar'
        ? series.map((s, si) => {
            const bw = (pw / n) * 0.6;
            return s.data.map((v, i) => (
              <rect
                key={`bar-${si}-${i}`}
                x={x(i) - bw / 2 + (si - (series.length - 1) / 2) * (bw / series.length)}
                y={yLeft(Math.max(0, v))}
                width={bw / series.length}
                height={Math.abs(yLeft(v) - yLeft(0))}
                fill={colorFor(si, s.color)}
                opacity={0.9}
              />
            ));
          })
        : series.map((s, si) => {
            const yr = multi && s.axis === 1 ? yRight : yLeft;
            const pts = s.data.map((v, i) => `${x(i)},${yr(v)}`).join(' ');
            return (
              <g key={`line-${si}`}>
                <polyline points={pts} fill="none" stroke={colorFor(si, s.color)} strokeWidth={2} />
                {s.data.map((v, i) => (
                  <circle key={`pt-${si}-${i}`} cx={x(i)} cy={yr(v)} r={2.5} fill={colorFor(si, s.color)} />
                ))}
              </g>
            );
          })}

      {/* legend */}
      {series.length > 1 && (
        <g>
          {series.map((s, si) => (
            <g key={`leg-${si}`} transform={`translate(${m.left + si * 110}, 4)`}>
              <rect width={10} height={10} fill={colorFor(si, s.color)} />
              <text x={14} y={9} fontSize={9} fill="currentColor">{String(s.name).slice(0, 16)}</text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

function Heatmap({ spec }: { spec: ChartSpec }) {
  const rows = spec.rows ?? [];
  const cols = spec.cols ?? [];
  const values = spec.values ?? [];
  const flat = values.flat();
  const max = Math.max(1, ...flat);
  const min = Math.min(0, ...flat);
  const cell = 34;
  const labelW = 70;
  const W = labelW + cols.length * cell + 12;
  const H = 18 + rows.length * cell + 24;
  const heat = (v: number) => {
    const t = (v - min) / (max - min || 1);
    // blue (low) -> red (high)
    const r = Math.round(40 + t * 200);
    const b = Math.round(220 - t * 200);
    return `rgb(${r}, 80, ${b})`;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', maxWidth: 620 }}>
      {cols.map((c, ci) => (
        <text key={`hc-${ci}`} x={labelW + ci * cell + cell / 2} y={14} textAnchor="middle" fontSize={8} fill="currentColor" opacity={0.8}>
          {String(c).slice(0, 8)}
        </text>
      ))}
      {rows.map((rlabel, ri) => (
        <g key={`hr-${ri}`}>
          <text x={labelW - 4} y={18 + ri * cell + cell / 2 + 3} textAnchor="end" fontSize={8} fill="currentColor" opacity={0.8}>
            {String(rlabel).slice(0, 12)}
          </text>
          {(values[ri] ?? []).map((v, ci) => (
            <g key={`cell-${ri}-${ci}`}>
              <rect x={labelW + ci * cell} y={18 + ri * cell} width={cell - 2} height={cell - 2} fill={heat(v)} rx={2} />
              <text x={labelW + ci * cell + cell / 2 - 1} y={18 + ri * cell + cell / 2 + 3} textAnchor="middle" fontSize={8} fill="#fff">
                {Math.round(v)}
              </text>
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}

export function ChartRenderer({ spec }: { spec: ChartSpec }) {
  return (
    <figure className="agent-chart">
      {spec.title && <figcaption className="agent-chart-title">{spec.title}</figcaption>}
      {spec.type === 'heatmap' ? <Heatmap spec={spec} /> : <CategoryChart spec={spec} />}
    </figure>
  );
}
