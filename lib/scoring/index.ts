/**
 * SCORING_V1 — Orchestrator
 *
 * Entry point for the scoring pipeline. Coordinates:
 *   1. AOI variable resolution (DataProvider)
 *   2. Hard stop evaluation (per practice)
 *   3. Suitability scoring
 *   4. Carbon potential
 *   5. Reversal risk
 *   6. Co-benefits
 *   7. Confidence (including KOI status)
 *   8. KOI eligibility (KOIService)
 *   9. Practice ranking
 *  10. Investor matching
 *
 * The orchestrator depends only on the DataProvider and KOIService
 * interfaces — never on concrete implementations.
 */

import type {
  AnalyzeRequest,
  AnalyzeResponse,
  PracticeId,
  PracticeScoreResult,
  RankedPractice,
  AOIVariables,
  HardStopResult,
  KOIStatus,
} from './types';
import { PRACTICE_IDS } from './types';
import type { DataProvider, KOIService } from './provider';
import { computeSuitability } from './suitability';
import { computeCarbon } from './carbon';
import { computeReversalRisk } from './risk';
import { computeCoBenefits } from './cobenefits';
import { computeConfidence } from './confidence';
import { computeAllInvestorMatches } from './investorMatch';

// ============================================================
// HARD STOPS (from SCORING_V1 spec §5)
// ============================================================

const URBAN_BLOCKED_PRACTICES: PracticeId[] = [
  'reforestation',
  'agroforestry',
  'food_forests',
];

function evaluateHardStops(
  practice: PracticeId,
  vars: AOIVariables,
  koiStatus: KOIStatus
): HardStopResult {
  const reasons: string[] = [];
  const warnings: string[] = [];

  // HARD-STOP-01: urban_fraction > 0.30 → block reforestation/agroforestry/food_forests
  if (vars.urban_fraction > 0.30 && URBAN_BLOCKED_PRACTICES.includes(practice)) {
    reasons.push(
      `HARD-STOP-01: urban_fraction (${vars.urban_fraction.toFixed(3)}) > 0.30 blocks ${practice}`
    );
  }

  // HARD-STOP-02: slope > 35° → block no_till
  if (vars.slope_deg_p90 > 35 && practice === 'no_till') {
    reasons.push(
      `HARD-STOP-02: slope_deg_p90 (${vars.slope_deg_p90.toFixed(1)}°) > 35° blocks no_till`
    );
  }

  // HARD-STOP-03: native_forest_fraction > 0.50 AND practice == reforestation → block
  if (vars.native_forest_fraction > 0.50 && practice === 'reforestation') {
    reasons.push(
      `HARD-STOP-03: native_forest_fraction (${vars.native_forest_fraction.toFixed(3)}) > 0.50 blocks reforestation`
    );
  }

  // HARD-STOP-04: KOI ineligible → block practice
  if (koiStatus === 'ineligible') {
    reasons.push(`HARD-STOP-04: KOI eligibility = ineligible for ${practice}`);
  }

  // HARD-WARN-01: protected_area_overlap > 0.20 → warning (not a block)
  if (vars.protected_area_overlap > 0.20) {
    warnings.push(
      `HARD-WARN-01: protected_area_overlap (${vars.protected_area_overlap.toFixed(3)}) > 0.20 — regulatory review recommended`
    );
  }

  return {
    blocked: reasons.length > 0,
    reasons,
    warnings,
  };
}

// ============================================================
// SCORE A SINGLE PRACTICE
// ============================================================

async function scorePractice(
  practice: PracticeId,
  vars: AOIVariables,
  koiService: KOIService,
  aoi: AnalyzeRequest['aoi']
): Promise<PracticeScoreResult> {
  // 1. KOI eligibility (may influence hard stops)
  const koiResponse = await koiService.checkEligibility(aoi, practice);
  const koiStatus: KOIStatus = koiResponse.status;

  // 2. Hard stops
  const hardStops = evaluateHardStops(practice, vars, koiStatus);

  // 3. Suitability
  const suitability = computeSuitability(practice, vars);

  // 4. Carbon
  const carbon = computeCarbon(practice, suitability.score_0_100);

  // 5. Reversal risk (AOI-level, same for all practices)
  const { risk: reversal_risk, explain: rrExplain } = computeReversalRisk(vars);

  // 6. Co-benefits (practice-specific because SoilScore is practice-specific)
  const co_benefits = computeCoBenefits(vars, suitability.explain.soil_score);

  // 7. Confidence
  const { confidence, penalties } = computeConfidence(vars, koiStatus);

  // 8. Build raw AOI inputs for explain (omit metadata fields)
  const {
    missing_variables: _mv,
    landcover_uncertainty: _lu,
    ...raw_aoi_inputs
  } = vars;

  return {
    practice_id: practice,
    blocked:      hardStops.blocked,
    block_reasons: hardStops.reasons,
    warnings:     hardStops.warnings,
    suitability,
    carbon,
    reversal_risk_0_1: reversal_risk,
    co_benefits,
    confidence_0_1: confidence,
    koi: {
      eligibility: {
        status:  koiResponse.status,
        reasons: koiResponse.reasons,
      },
      methodology_match: koiResponse.methodology_match,
    },
    explain: {
      hard_stops:              hardStops,
      reversal_risk_breakdown: rrExplain,
      confidence_penalties:    penalties,
      raw_aoi_inputs,
    },
  };
}

// ============================================================
// RANK PRACTICES
// ============================================================

function rankPractices(results: PracticeScoreResult[]): RankedPractice[] {
  return results
    .filter((r) => !r.blocked)
    .sort((a, b) => b.suitability.score_0_100 - a.suitability.score_0_100)
    .map((r, idx) => ({
      practice_id: r.practice_id,
      rank:        idx + 1,
      score_0_100: r.suitability.score_0_100,
    }));
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

export async function scoreAOI(
  request: AnalyzeRequest,
  dataProvider: DataProvider,
  koiService: KOIService
): Promise<AnalyzeResponse> {
  // 1. Resolve AOI variables
  const vars = await dataProvider.getAOIVariables(request.aoi);

  // 2. Determine which practices to score
  const practicesToScore: PracticeId[] =
    request.mode === 'project' && request.selected_practice
      ? [request.selected_practice]
      : [...PRACTICE_IDS];

  // 3. Score all practices (parallel KOI calls for performance)
  const results = await Promise.all(
    practicesToScore.map((practice) =>
      scorePractice(practice, vars, koiService, request.aoi)
    )
  );

  // In explore mode, we need ALL practices ranked even if only one was scored above.
  // The spec shows ranked_practices over all, so if project mode ran only one, rank it.
  const ranked = rankPractices(results);

  // 4. Investor matching
  const investor_matches = computeAllInvestorMatches(
    request.aoi.region,
    request.stage,
    ranked,
    results
  );

  return {
    results,
    ranked_practices: ranked,
    investor_matches,
    metadata: {
      scoring_version: 'v1',
      computed_at:     new Date().toISOString(),
      aoi_area_ha:     request.aoi.area_ha,
      mode:            request.mode,
    },
  };
}

// Re-export key types and providers for convenience
export type { AnalyzeRequest, AnalyzeResponse } from './types';
export { StubProvider, StubKOIService } from './stubProvider';
