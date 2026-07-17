import { ChartSpec, ClaimRecord } from './types';

/**
 * Chart-data validation — rejects charts built from unverified claims,
 * general model knowledge, or synthetic precision. Every data point should
 * have a verified claim + evidence behind it. Estimated data may be shown
 * only when clearly labeled and explicitly requested by the user.
 */

export interface ChartValidationResult {
  ok: boolean;
  reasons: string[];
}

export function validateChartAgainstClaims(spec: ChartSpec, claims: ClaimRecord[]): ChartValidationResult {
  const reasons: string[] = [];
  const verifiedClaimIds = new Set(claims.filter((c) => c.status === 'verified').map((c) => c.claimId));

  if (spec.type === 'heatmap') {
    // Heatmap values are a grid — check for any claim refs (best-effort).
    const flat = (spec.values ?? []).flat();
    if (flat.length === 0) reasons.push('Heatmap has no values.');
    // Heatmaps are harder to tie to individual claims — accept if any verified claims exist.
    if (verifiedClaimIds.size === 0 && flat.length > 0) {
      reasons.push('Heatmap data has no verified claims backing it — cannot distinguish real from estimated.');
    }
  } else {
    // bar / line / multiAxis: each series data point should ideally map to a claim.
    // Since the chart spec doesn't carry per-point claimIds yet, we do a
    // structural check: if NO verified claims exist in the conversation, the
    // chart is almost certainly from model knowledge, not research.
    for (const series of spec.series ?? []) {
      if (!series.data || series.data.length === 0) {
        reasons.push(`Series "${series.name}" has no data points.`);
      }
    }
    if (verifiedClaimIds.size === 0 && (spec.series?.length ?? 0) > 0) {
      reasons.push('Chart data has no verified claims in the conversation — likely model knowledge, not researched data. Reject unless explicitly labeled as an estimate.');
    }
  }

  return { ok: reasons.length === 0, reasons };
}
