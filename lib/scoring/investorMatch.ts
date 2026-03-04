/**
 * SCORING_V1 — Investor Match Score (V1 Heuristic)
 *
 * Source of truth: spec/INVESTOR_MATCH_V1.md
 *
 * Formula:
 *   InvestorMatchScore = 100 * (
 *     0.25 * practice_fit  +
 *     0.25 * region_fit    +
 *     0.20 * risk_fit      +
 *     0.20 * impact_fit    +
 *     0.10 * stage_fit
 *   )
 *
 * NOTE: This entire module is a V1 heuristic.
 */

import type {
  InvestorProfile,
  InvestorMatchResult,
  InvestorMatchExplain,
  PracticeScoreResult,
  RankedPractice,
  StagePreference,
  ImpactPriority,
} from './types';
import { clamp, round } from './normalize';
import { INVESTOR_PROFILES } from './investors';

// ============================================================
// SUB-SCORE: practice_fit
// ============================================================

/**
 * V1 heuristic:
 * For each preferred practice of the investor that appears in the
 * top-3 non-blocked ranked practices, take that practice's
 * suitability score / 100 as the contribution.
 * Average over all preferred practices.
 */
function computePracticeFit(
  profile: InvestorProfile,
  ranked: RankedPractice[],
  results: PracticeScoreResult[]
): number {
  if (profile.practice_preferences.length === 0) return 0.5;

  const top3 = ranked.slice(0, 3).map((r) => r.practice_id);
  const resultMap = new Map(results.map((r) => [r.practice_id, r]));

  let total = 0;
  for (const pref of profile.practice_preferences) {
    if (top3.includes(pref)) {
      const result = resultMap.get(pref);
      total += result ? result.suitability.score_0_100 / 100 : 0;
    }
    // If preferred practice not in top-3 → contribution = 0
  }

  return clamp(total / profile.practice_preferences.length);
}

// ============================================================
// SUB-SCORE: region_fit
// ============================================================

/**
 * V1 heuristic:
 * 1.0 if AOI region is in allowed list (or investor allows "GLOBAL")
 * 0.5 if no region provided (insufficient data)
 * 0.0 if region is provided but not allowed
 */
function computeRegionFit(profile: InvestorProfile, aoiRegion?: string): number {
  if (!aoiRegion) return 0.5;
  if (
    profile.regions_allowed.includes('GLOBAL') ||
    profile.regions_allowed.some(
      (r) => r.toUpperCase() === aoiRegion.toUpperCase()
    )
  ) {
    return 1.0;
  }
  return 0.0;
}

// ============================================================
// SUB-SCORE: risk_fit
// ============================================================

/**
 * V1 heuristic: uses the best (lowest) reversal_risk among non-blocked practices.
 * Adjusted by investor's risk_tolerance:
 *   low:    1 - reversal_risk * 1.5   (more averse)
 *   medium: 1 - reversal_risk
 *   high:   1 - reversal_risk * 0.5   (more tolerant)
 */
function computeRiskFit(
  profile: InvestorProfile,
  results: PracticeScoreResult[]
): number {
  const nonBlocked = results.filter((r) => !r.blocked);
  if (nonBlocked.length === 0) return 0;

  const bestRisk = Math.min(...nonBlocked.map((r) => r.reversal_risk_0_1));

  const multiplier =
    profile.risk_tolerance === 'low'    ? 1.5 :
    profile.risk_tolerance === 'medium' ? 1.0 :
    /* high */                            0.5;

  return clamp(1 - bestRisk * multiplier);
}

// ============================================================
// SUB-SCORE: impact_fit
// ============================================================

/**
 * V1 heuristic:
 * For each of the investor's impact priorities, map to the top
 * non-blocked practice's co-benefit score. Average over priorities.
 *
 * carbon       → rate_expected / rate_optimal (proxy for carbon delivery)
 * biodiversity → biodiversity_0_1
 * water        → water_0_1
 * soil         → soil_health_0_1
 */
function computeImpactFit(
  profile: InvestorProfile,
  results: PracticeScoreResult[]
): number {
  if (profile.impact_priorities.length === 0) return 0.5;

  const nonBlocked = results.filter((r) => !r.blocked);
  if (nonBlocked.length === 0) return 0;

  // Use the top-ranked non-blocked practice for co-benefit proxy scores
  const top = nonBlocked[0];

  function scoreForPriority(p: ImpactPriority): number {
    switch (p) {
      case 'carbon':
        // Proxy: how close is expected rate to optimal rate
        return clamp(
          top.carbon.rate_expected_tco2e_ha_yr /
          Math.max(top.carbon.rate_optimal_tco2e_ha_yr, 0.001)
        );
      case 'biodiversity':
        return top.co_benefits.biodiversity_0_1;
      case 'water':
        return top.co_benefits.water_0_1;
      case 'soil':
        return top.co_benefits.soil_health_0_1;
    }
  }

  const scores = profile.impact_priorities.map(scoreForPriority);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return clamp(avg);
}

// ============================================================
// SUB-SCORE: stage_fit
// ============================================================

/**
 * V1 heuristic:
 * 1.0 if requested stage is in investor's preferences
 * 0.5 if no stage requested (neutral default)
 * 0.0 if stage is specified but not preferred
 */
function computeStageFit(
  profile: InvestorProfile,
  requestStage?: StagePreference
): number {
  if (!requestStage) return 0.5;
  return profile.stage_preferences.includes(requestStage) ? 1.0 : 0.0;
}

// ============================================================
// MAIN FUNCTION
// ============================================================

export function computeInvestorMatch(
  profile: InvestorProfile,
  aoiRegion: string | undefined,
  requestStage: StagePreference | undefined,
  ranked: RankedPractice[],
  results: PracticeScoreResult[]
): InvestorMatchResult {
  const practice_fit = computePracticeFit(profile, ranked, results);
  const region_fit   = computeRegionFit(profile, aoiRegion);
  const risk_fit     = computeRiskFit(profile, results);
  const impact_fit   = computeImpactFit(profile, results);
  const stage_fit    = computeStageFit(profile, requestStage);

  const explain: InvestorMatchExplain = {
    practice_fit: round(practice_fit),
    region_fit:   round(region_fit),
    risk_fit:     round(risk_fit),
    impact_fit:   round(impact_fit),
    stage_fit:    round(stage_fit),
  };

  const raw_score =
    0.25 * practice_fit +
    0.25 * region_fit   +
    0.20 * risk_fit     +
    0.20 * impact_fit   +
    0.10 * stage_fit;

  return {
    investor_id:       profile.id,
    investor_name:     profile.name,
    match_score_0_100: round(clamp(raw_score) * 100, 2),
    explain,
  };
}

// ============================================================
// BATCH: score all investors
// ============================================================

export function computeAllInvestorMatches(
  aoiRegion: string | undefined,
  requestStage: StagePreference | undefined,
  ranked: RankedPractice[],
  results: PracticeScoreResult[]
): InvestorMatchResult[] {
  return INVESTOR_PROFILES
    .map((profile) =>
      computeInvestorMatch(profile, aoiRegion, requestStage, ranked, results)
    )
    .sort((a, b) => b.match_score_0_100 - a.match_score_0_100);
}
