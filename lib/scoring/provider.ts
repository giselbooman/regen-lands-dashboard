/**
 * SCORING_V1 — DataProvider and KOIService interfaces
 *
 * The scoring engine depends ONLY on these interfaces.
 * Concrete implementations (StubProvider, RealGISProvider, etc.)
 * are injected at the call site and must NOT leak into scoring logic.
 */

import type { AOI, AOIVariables, KOIStatus, KOIMethodologyMatch } from './types';

// ============================================================
// DATA PROVIDER
// ============================================================

/**
 * Provides aggregated AOI environmental variables for a given geometry.
 *
 * MVP implementation: StubProvider (deterministic from geometry hash).
 * Future: RealGISProvider backed by GEE / SoilGrids / SRTM / WorldClim.
 */
export interface DataProvider {
  /**
   * Returns the 18 AOI input variables needed for SCORING_V1.
   * Missing or imputed variables must be listed in result.missing_variables.
   */
  getAOIVariables(aoi: AOI): Promise<AOIVariables>;
}

// ============================================================
// KOI SERVICE
// ============================================================

export interface KOIEligibilityResponse {
  status: KOIStatus;
  reasons: string[];
  methodology_match: KOIMethodologyMatch[];
}

/**
 * Checks KOI (Knowledge of Impact) eligibility for an AOI + practice pair.
 *
 * MVP implementation: StubKOIService (deterministic from geometry hash).
 * Future: Real KOI API integration.
 *
 * Contract:
 *   - 'ineligible' → practice must be blocked (HARD-STOP-04)
 *   - 'unknown'    → do NOT block, but reduce confidence by 0.2
 *   - 'eligible'   → no constraint applied
 */
export interface KOIService {
  checkEligibility(
    aoi: AOI,
    practiceId: string
  ): Promise<KOIEligibilityResponse>;
}
