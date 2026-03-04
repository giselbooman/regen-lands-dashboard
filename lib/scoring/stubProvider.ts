/**
 * SCORING_V1 — Stub implementations of DataProvider and KOIService
 *
 * Uses a deterministic LCG hash of the AOI geometry to produce consistent
 * outputs for any given polygon. Same polygon → same variables always.
 *
 * IMPORTANT: This module implements the DataProvider/KOIService interfaces
 * only. Scoring logic must NEVER depend on stub-specific internals.
 */

import type { AOI, AOIVariables, TextureClass, LandcoverClass, DrainageClass, KOIMethodologyMatch } from './types';
import type { DataProvider, KOIService, KOIEligibilityResponse } from './provider';

// ============================================================
// DETERMINISTIC HASH
// ============================================================

function hashGeometry(geometry: AOI['geometry']): number {
  const str = JSON.stringify(geometry);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash | 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Linear Congruential Generator seeded by (baseHash, slotIndex).
 * Returns a float in [0, 1).
 */
function seededRandom(baseHash: number, slot: number): number {
  const s = Math.imul(baseHash + slot * 2654435761, 1664525) + 1013904223;
  return (s >>> 0) / 0x100000000;
}

function lerp(t: number, lo: number, hi: number): number {
  return lo + t * (hi - lo);
}

function pick<T>(t: number, arr: T[]): T {
  return arr[Math.floor(t * arr.length)];
}

// ============================================================
// STUB DATA PROVIDER
// ============================================================

export class StubProvider implements DataProvider {
  async getAOIVariables(aoi: AOI): Promise<AOIVariables> {
    const seed = hashGeometry(aoi.geometry);
    const r = (slot: number) => seededRandom(seed, slot);

    const TEXTURE_CLASSES: TextureClass[] = [
      'clay', 'silty_clay', 'sandy_clay', 'clay_loam', 'silty_clay_loam',
      'sandy_clay_loam', 'loam', 'silt_loam', 'silt', 'sandy_loam',
      'loamy_sand', 'sand',
    ];
    const LANDCOVER_CLASSES: LandcoverClass[] = [
      'cropland', 'grassland', 'shrubland', 'forest',
      'wetland', 'urban', 'barren', 'water',
    ];
    const DRAINAGE_CLASSES: DrainageClass[] = [
      'excessively_drained', 'well_drained', 'moderately_well_drained',
      'somewhat_poorly_drained', 'poorly_drained', 'very_poorly_drained',
    ];

    const urban_fraction        = lerp(r(3), 0, 0.45);
    const water_fraction        = lerp(r(4), 0, 0.25);
    const protected_area_overlap = lerp(r(5), 0, 0.55);
    const native_forest_fraction = lerp(r(6), 0, 0.80);

    return {
      // Climate
      precip_mm_yr:           lerp(r(7),  150, 2800),
      temp_c_mean:            lerp(r(8),   1,  32),

      // Terrain
      slope_deg_p90:          lerp(r(9),   0,  42),

      // Soil
      soc_t_ha_0_30:          lerp(r(10),  8,  90),
      texture_class:          pick(r(0), TEXTURE_CLASSES),
      ph:                     lerp(r(11),  4.3, 8.7),
      drainage_class:         pick(r(2), DRAINAGE_CLASSES),

      // Land
      landcover_class:        pick(r(1), LANDCOVER_CLASSES),
      urban_fraction,
      water_fraction,
      protected_area_overlap,
      native_forest_fraction,

      // Risk proxies
      drought_index:          r(12),
      fire_risk_index:        r(13),

      // Data quality metadata
      missing_variables:      [],
      landcover_uncertainty:  r(15) > 0.80,
    };
  }
}

// ============================================================
// STUB KOI SERVICE
// ============================================================

/** Stub methodology library — V1 heuristic placeholders */
const STUB_METHODOLOGIES: KOIMethodologyMatch[] = [
  { methodology_id: 'M01', name: 'Soil Carbon Method v2',           match_score_0_1: 0.0 },
  { methodology_id: 'M02', name: 'Grassland Restoration Protocol',  match_score_0_1: 0.0 },
  { methodology_id: 'M03', name: 'Agroforestry Carbon Standard',    match_score_0_1: 0.0 },
  { methodology_id: 'M04', name: 'Biochar Permanence Framework',    match_score_0_1: 0.0 },
  { methodology_id: 'M05', name: 'Reforestation Baseline v3',       match_score_0_1: 0.0 },
];

export class StubKOIService implements KOIService {
  async checkEligibility(
    aoi: AOI,
    practiceId: string
  ): Promise<KOIEligibilityResponse> {
    const seed = hashGeometry(aoi.geometry);
    // Use practice name as an additional slot offset so different practices
    // get different (but still deterministic) KOI results for the same polygon.
    const practiceOffset = practiceId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const r = seededRandom(seed, practiceOffset % 97);

    let status: 'eligible' | 'ineligible' | 'unknown';
    if (r < 0.65) {
      status = 'eligible';
    } else if (r < 0.80) {
      status = 'ineligible';
    } else {
      status = 'unknown';
    }

    const reasons: string[] = [];
    if (status === 'ineligible') {
      reasons.push('KOI-STUB: practice does not meet baseline additionality criteria');
    }
    if (status === 'unknown') {
      reasons.push('KOI-STUB: eligibility data not available for this AOI');
    }

    // Assign deterministic match scores for each methodology
    const methodology_match: KOIMethodologyMatch[] = STUB_METHODOLOGIES.map((m, i) => ({
      ...m,
      match_score_0_1: parseFloat(
        (seededRandom(seed + practiceOffset, i + 20) * 0.6 + 0.3).toFixed(3)
      ),
    })).sort((a, b) => b.match_score_0_1 - a.match_score_0_1);

    return { status, reasons, methodology_match };
  }
}
