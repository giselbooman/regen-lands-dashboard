/**
 * SCORING_V1 — Shared TypeScript types
 * All scoring logic depends exclusively on these types.
 */

// ============================================================
// PRACTICE IDs
// ============================================================

export const PRACTICE_IDS = [
  'pasture_grazing',
  'cover_crops',
  'agroforestry',
  'no_till',
  'biochar',
  'reforestation',
  'food_forests',
] as const;

export type PracticeId = (typeof PRACTICE_IDS)[number];

// ============================================================
// DOMAIN ENUMS
// ============================================================

export type TextureClass =
  | 'clay'
  | 'silty_clay'
  | 'sandy_clay'
  | 'clay_loam'
  | 'silty_clay_loam'
  | 'sandy_clay_loam'
  | 'loam'
  | 'silt_loam'
  | 'silt'
  | 'sandy_loam'
  | 'loamy_sand'
  | 'sand';

export type LandcoverClass =
  | 'cropland'
  | 'grassland'
  | 'shrubland'
  | 'forest'
  | 'wetland'
  | 'urban'
  | 'barren'
  | 'water';

export type DrainageClass =
  | 'excessively_drained'
  | 'well_drained'
  | 'moderately_well_drained'
  | 'somewhat_poorly_drained'
  | 'poorly_drained'
  | 'very_poorly_drained';

export type KOIStatus = 'eligible' | 'ineligible' | 'unknown';

export type RiskTolerance = 'low' | 'medium' | 'high';

export type ImpactPriority = 'carbon' | 'biodiversity' | 'water' | 'soil';

export type StagePreference = 'explore' | 'pipeline' | 'verified';

// ============================================================
// AOI VARIABLES (18 inputs + quality metadata)
// ============================================================

/**
 * All variables required by the scoring engine.
 * Produced by a DataProvider implementation.
 */
export interface AOIVariables {
  // Climate
  precip_mm_yr: number;
  temp_c_mean: number;

  // Terrain
  slope_deg_p90: number;

  // Soil
  soc_t_ha_0_30: number;
  texture_class: TextureClass;
  ph: number;
  drainage_class: DrainageClass;

  // Land
  landcover_class: LandcoverClass;
  urban_fraction: number;       // 0–1
  water_fraction: number;       // 0–1
  protected_area_overlap: number; // 0–1
  native_forest_fraction: number; // 0–1

  // Risk proxies
  drought_index: number;     // 0–1
  fire_risk_index: number;   // 0–1

  // Data quality metadata
  missing_variables: string[];    // names of variables that were imputed/missing
  landcover_uncertainty: boolean; // true if landcover classification is uncertain
}

// ============================================================
// AOI GEOMETRY & REQUEST
// ============================================================

export interface AOIGeometry {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface AOI {
  type: 'polygon';
  geometry: AOIGeometry;
  area_ha: number;
  region?: string; // ISO country code or named region (e.g. "LATAM", "BRA")
}

export type AnalyzeMode = 'explore' | 'project';

export interface AnalyzeRequest {
  mode: AnalyzeMode;
  aoi: AOI;
  selected_practice?: PracticeId;
  stage?: StagePreference;
}

// ============================================================
// HARD STOPS
// ============================================================

export interface HardStopResult {
  blocked: boolean;
  reasons: string[];   // rule IDs + description, e.g. "HARD-STOP-01: urban_fraction > 0.30"
  warnings: string[];  // non-blocking alerts, e.g. "HARD-WARN-01: protected_area_overlap > 0.20"
}

// ============================================================
// SUITABILITY SCORE
// ============================================================

export interface SuitabilitySubScores {
  climate_score: number;    // 0–1
  soil_score: number;       // 0–1
  terrain_score: number;    // 0–1
  land_score: number;       // 0–1
  constraint_score: number; // 0–1
}

export interface SuitabilityExplain extends SuitabilitySubScores {
  lookup_rules_applied: string[]; // e.g. ["TEX-03", "LC-02"]
  norm_precip: number;
  norm_temp: number;
  norm_slope: number;
  ph_deviation: number;
  inv_norm_ph_deviation: number;
}

export type SuitabilityQualitative = 'High' | 'Medium' | 'Low';

export interface SuitabilityResult {
  score_0_100: number;
  qualitative: SuitabilityQualitative;
  explain: SuitabilityExplain;
}

// ============================================================
// CARBON POTENTIAL
// ============================================================

export interface CarbonExplain {
  base_rate_tco2e_ha_yr: number;
  suitability_factor: number; // 0.5 + 0.5 * suitabilityScore/100
}

export interface CarbonResult {
  rate_min_tco2e_ha_yr: number;
  rate_expected_tco2e_ha_yr: number;
  rate_max_tco2e_ha_yr: number;
  rate_optimal_tco2e_ha_yr: number;
  gap_to_optimal_tco2e_ha_yr: number;
  explain: CarbonExplain;
}

// ============================================================
// REVERSAL RISK
// ============================================================

export interface ReversalRiskExplain {
  base: number;
  drought_component: number;
  fire_component: number;
  slope_component: number;
}

// ============================================================
// CO-BENEFITS
// ============================================================

export interface CoBenefitsResult {
  biodiversity_0_1: number;
  water_0_1: number;
  soil_health_0_1: number;
}

// ============================================================
// CONFIDENCE
// ============================================================

export interface ConfidencePenalty {
  reason: string;
  penalty: number;
}

// ============================================================
// KOI
// ============================================================

export interface KOIMethodologyMatch {
  methodology_id: string;
  name: string;
  match_score_0_1: number;
}

export interface KOIResult {
  eligibility: {
    status: KOIStatus;
    reasons: string[];
  };
  methodology_match: KOIMethodologyMatch[];
}

// ============================================================
// PRACTICE SCORE RESULT (per practice)
// ============================================================

export interface PracticeScoreResult {
  practice_id: PracticeId;
  blocked: boolean;
  block_reasons: string[];
  warnings: string[];
  suitability: SuitabilityResult;
  carbon: CarbonResult;
  reversal_risk_0_1: number;
  co_benefits: CoBenefitsResult;
  confidence_0_1: number;
  koi: KOIResult;
  explain: {
    hard_stops: HardStopResult;
    reversal_risk_breakdown: ReversalRiskExplain;
    confidence_penalties: ConfidencePenalty[];
    raw_aoi_inputs: Omit<AOIVariables, 'missing_variables' | 'landcover_uncertainty'>;
  };
}

export interface RankedPractice {
  practice_id: PracticeId;
  rank: number;
  score_0_100: number;
}

// ============================================================
// INVESTOR MATCH
// ============================================================

export interface InvestorProfile {
  id: string;
  name: string;
  regions_allowed: string[];
  ticket_min: number;
  ticket_max: number;
  practice_preferences: PracticeId[];
  risk_tolerance: RiskTolerance;
  impact_priorities: ImpactPriority[];
  stage_preferences: StagePreference[];
}

export interface InvestorMatchExplain {
  practice_fit: number;  // 0–1
  region_fit: number;    // 0–1
  risk_fit: number;      // 0–1
  impact_fit: number;    // 0–1
  stage_fit: number;     // 0–1
}

export interface InvestorMatchResult {
  investor_id: string;
  investor_name: string;
  match_score_0_100: number;
  explain: InvestorMatchExplain;
}

// ============================================================
// ANALYZE RESPONSE
// ============================================================

export interface AnalyzeResponse {
  results: PracticeScoreResult[];
  ranked_practices: RankedPractice[];
  investor_matches: InvestorMatchResult[];
  metadata: {
    scoring_version: 'v1';
    computed_at: string;
    aoi_area_ha: number;
    mode: AnalyzeMode;
  };
}
