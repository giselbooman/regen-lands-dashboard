/**
 * SCORING_V1 — Suitability Score
 *
 * Formula (from spec):
 *   ClimateScore   = average(norm_precip, norm_temp)
 *   SoilScore      = texture_fit * 0.5 + inv_norm(ph_deviation) * 0.5
 *   TerrainScore   = inv_norm(slope)
 *   LandScore      = landcover_compatibility
 *   ConstraintScore = 1 - (protected_area_overlap + urban_fraction) / 2
 *
 *   SuitabilityScore = 100 * (
 *     0.25 * ClimateScore   +
 *     0.30 * SoilScore      +
 *     0.15 * TerrainScore   +
 *     0.20 * LandScore      +
 *     0.10 * ConstraintScore
 *   )
 *
 * Qualitative bands:
 *   >= 75  → "High"
 *   50–74  → "Medium"
 *   < 50   → "Low"
 */

import type {
  PracticeId,
  AOIVariables,
  SuitabilityResult,
  SuitabilityQualitative,
} from './types';
import { norm, invNorm, clamp, round, RANGES, OPTIMAL_PH } from './normalize';
import { getTextureFit, getLandcoverCompatibility } from './lookups';

// ============================================================
// QUALITATIVE THRESHOLD
// ============================================================

function toQualitative(score: number): SuitabilityQualitative {
  if (score >= 75) return 'High';
  if (score >= 50) return 'Medium';
  return 'Low';
}

// ============================================================
// MAIN FUNCTION
// ============================================================

export function computeSuitability(
  practice: PracticeId,
  vars: AOIVariables
): SuitabilityResult {
  // --- Climate ---
  const norm_precip = norm(vars.precip_mm_yr, RANGES.precip.min, RANGES.precip.max);
  const norm_temp   = norm(vars.temp_c_mean,  RANGES.temp.min,   RANGES.temp.max);
  const climate_score = (norm_precip + norm_temp) / 2;

  // --- Soil ---
  const texEntry = getTextureFit(practice, vars.texture_class);
  const texture_fit = texEntry.value;

  const ph_deviation = Math.abs(vars.ph - OPTIMAL_PH);
  const inv_norm_ph  = invNorm(ph_deviation, RANGES.ph_dev.min, RANGES.ph_dev.max);
  const soil_score   = clamp(texture_fit * 0.5 + inv_norm_ph * 0.5);

  // --- Terrain ---
  const norm_slope    = norm(vars.slope_deg_p90, RANGES.slope.min, RANGES.slope.max);
  const terrain_score = clamp(1 - norm_slope);

  // --- Land ---
  const lcEntry   = getLandcoverCompatibility(practice, vars.landcover_class);
  const land_score = lcEntry.value;

  // --- Constraint ---
  const constraint_score = clamp(
    1 - (vars.protected_area_overlap + vars.urban_fraction) / 2
  );

  // --- Weighted total ---
  const raw =
    0.25 * climate_score   +
    0.30 * soil_score      +
    0.15 * terrain_score   +
    0.20 * land_score      +
    0.10 * constraint_score;

  const score_0_100 = round(clamp(raw, 0, 1) * 100, 2);

  return {
    score_0_100,
    qualitative: toQualitative(score_0_100),
    explain: {
      climate_score:    round(climate_score),
      soil_score:       round(soil_score),
      terrain_score:    round(terrain_score),
      land_score:       round(land_score),
      constraint_score: round(constraint_score),
      norm_precip:      round(norm_precip),
      norm_temp:        round(norm_temp),
      norm_slope:       round(norm_slope),
      ph_deviation:     round(ph_deviation),
      inv_norm_ph_deviation: round(inv_norm_ph),
      lookup_rules_applied: [texEntry.rule_id, lcEntry.rule_id],
    },
  };
}
