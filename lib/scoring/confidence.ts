/**
 * SCORING_V1 — Confidence Score
 *
 * Algorithm (from spec):
 *   Start at 1.0
 *   -0.1 for each missing critical variable
 *   -0.2 if KOI unknown
 *   -0.2 if major landcover uncertainty
 *   Clamp to [0, 1]
 *
 * "Critical variables" are the 14 numeric/enum AOI inputs.
 * (missing_variables is populated by the DataProvider)
 */

import type { AOIVariables, KOIStatus, ConfidencePenalty } from './types';
import { clamp, round } from './normalize';

export interface ConfidenceResult {
  confidence: number;
  penalties: ConfidencePenalty[];
}

// ============================================================
// MAIN FUNCTION
// ============================================================

export function computeConfidence(
  vars: AOIVariables,
  koiStatus: KOIStatus
): ConfidenceResult {
  let score = 1.0;
  const penalties: ConfidencePenalty[] = [];

  // -0.1 per missing critical variable
  for (const v of vars.missing_variables) {
    const penalty = 0.1;
    score -= penalty;
    penalties.push({
      reason: `Missing critical variable: ${v}`,
      penalty,
    });
  }

  // -0.2 if KOI status is unknown
  if (koiStatus === 'unknown') {
    const penalty = 0.2;
    score -= penalty;
    penalties.push({
      reason: 'KOI eligibility unknown — data unavailable for this AOI',
      penalty,
    });
  }

  // -0.2 if major landcover uncertainty
  if (vars.landcover_uncertainty) {
    const penalty = 0.2;
    score -= penalty;
    penalties.push({
      reason: 'Major landcover classification uncertainty flagged by data provider',
      penalty,
    });
  }

  return {
    confidence: round(clamp(score)),
    penalties,
  };
}
