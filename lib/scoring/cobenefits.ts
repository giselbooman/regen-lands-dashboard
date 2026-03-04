/**
 * SCORING_V1 — Co-Benefits
 *
 * Formulas (from spec):
 *
 *   BiodiversityScore =
 *     clamp(1 - urban_fraction - protected_area_overlap, 0, 1)
 *
 *   WaterScore =
 *     inv_norm(slope) * 0.5 + (1 - water_fraction) * 0.5
 *
 *   SoilHealthScore =
 *     0.5 * SoilScore + 0.5 * inv_norm(soc_baseline_proxy)
 *
 * Notes:
 *   - soc_baseline_proxy = soc_t_ha_0_30, normalized over [0, 120].
 *     inv_norm(soc) means lower existing SOC → higher sequestration potential.
 *   - SoilScore (0–1) is the soil sub-score from suitability computation,
 *     passed in as a parameter to avoid recomputing it.
 *   - Co-benefits are practice-specific because SoilScore is practice-specific.
 */

import type { AOIVariables, CoBenefitsResult } from './types';
import { norm, invNorm, clamp, round, RANGES } from './normalize';

// ============================================================
// MAIN FUNCTION
// ============================================================

/**
 * @param vars        - AOI input variables
 * @param soilScore   - soil sub-score (0–1) from computeSuitability()
 */
export function computeCoBenefits(
  vars: AOIVariables,
  soilScore: number
): CoBenefitsResult {
  // --- Biodiversity ---
  const biodiversity = clamp(
    1 - vars.urban_fraction - vars.protected_area_overlap
  );

  // --- Water ---
  const inv_slope  = invNorm(vars.slope_deg_p90, RANGES.slope.min, RANGES.slope.max);
  const water      = clamp(inv_slope * 0.5 + (1 - vars.water_fraction) * 0.5);

  // --- Soil Health ---
  // soc_baseline_proxy = soc_t_ha_0_30
  // inv_norm: lower existing SOC → higher improvement potential
  const inv_soc    = invNorm(vars.soc_t_ha_0_30, RANGES.soc.min, RANGES.soc.max);
  const soil_health = clamp(0.5 * soilScore + 0.5 * inv_soc);

  return {
    biodiversity_0_1: round(biodiversity),
    water_0_1:        round(water),
    soil_health_0_1:  round(soil_health),
  };
}
