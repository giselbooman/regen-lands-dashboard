/**
 * SCORING_V1 — Carbon Potential
 *
 * Formula (from spec):
 *   rate_expected = base_rate * (0.5 + 0.5 * SuitabilityScore / 100)
 *   rate_min      = 0.7 * rate_expected
 *   rate_max      = 1.3 * rate_expected
 *   rate_optimal  = 1.5 * base_rate
 *   gap_to_optimal = max(0, rate_optimal - rate_expected)
 */

import type { PracticeId, CarbonResult } from './types';
import { round } from './normalize';

// ============================================================
// BASE RATES (tCO2e / ha / year) — from SCORING_V1 spec
// ============================================================

export const BASE_RATES: Record<PracticeId, number> = {
  pasture_grazing: 2.0,
  cover_crops:     1.5,
  agroforestry:    4.0,
  no_till:         1.0,
  biochar:         5.0,
  reforestation:   8.0,
  food_forests:    6.0,
};

// ============================================================
// MAIN FUNCTION
// ============================================================

export function computeCarbon(
  practice: PracticeId,
  suitabilityScore_0_100: number
): CarbonResult {
  const base_rate = BASE_RATES[practice];

  // V1 formula: scale expected rate by suitability
  const suitability_factor = 0.5 + 0.5 * (suitabilityScore_0_100 / 100);
  const rate_expected = base_rate * suitability_factor;

  const rate_min     = 0.7 * rate_expected;
  const rate_max     = 1.3 * rate_expected;
  const rate_optimal = 1.5 * base_rate;

  // Gap to optimal: 0 if already at or above optimal
  const gap_to_optimal = Math.max(0, rate_optimal - rate_expected);

  return {
    rate_min_tco2e_ha_yr:      round(rate_min, 3),
    rate_expected_tco2e_ha_yr: round(rate_expected, 3),
    rate_max_tco2e_ha_yr:      round(rate_max, 3),
    rate_optimal_tco2e_ha_yr:  round(rate_optimal, 3),
    gap_to_optimal_tco2e_ha_yr: round(gap_to_optimal, 3),
    explain: {
      base_rate_tco2e_ha_yr: base_rate,
      suitability_factor:    round(suitability_factor, 4),
    },
  };
}
