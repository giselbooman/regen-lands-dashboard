/**
 * SCORING_V1 — Reversal Risk
 *
 * Formula (from spec):
 *   ReversalRisk =
 *     0.3
 *     + 0.3 * drought_index
 *     + 0.3 * fire_risk_index
 *     + 0.1 * norm(slope, 0, 45)
 *
 *   Clamped to [0, 1].
 *
 * NOTE: ReversalRisk is AOI-level (not practice-specific).
 * The same value applies to all practices for a given AOI.
 */

import type { AOIVariables, ReversalRiskExplain } from './types';
import { norm, clamp, round, RANGES } from './normalize';

export interface ReversalRiskResult {
  risk: number;              // 0–1
  explain: ReversalRiskExplain;
}

// ============================================================
// MAIN FUNCTION
// ============================================================

export function computeReversalRisk(vars: AOIVariables): ReversalRiskResult {
  const base              = 0.3;
  const drought_component = 0.3 * vars.drought_index;
  const fire_component    = 0.3 * vars.fire_risk_index;
  const slope_norm        = norm(vars.slope_deg_p90, RANGES.slope.min, RANGES.slope.max);
  const slope_component   = 0.1 * slope_norm;

  const raw_risk = base + drought_component + fire_component + slope_component;
  const risk     = round(clamp(raw_risk), 4);

  return {
    risk,
    explain: {
      base,
      drought_component: round(drought_component, 4),
      fire_component:    round(fire_component, 4),
      slope_component:   round(slope_component, 4),
    },
  };
}
