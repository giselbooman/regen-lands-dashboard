/**
 * SCORING_V1 — Normalization helpers
 * Used throughout the scoring pipeline.
 */

/**
 * Linearly normalizes x from [min, max] to [0, 1], clamped.
 *
 * norm(x, min, max) = clamp((x - min) / (max - min), 0, 1)
 */
export function norm(x: number, min: number, max: number): number {
  if (max === min) return 0;
  return clamp((x - min) / (max - min), 0, 1);
}

/**
 * Inverse normalization: 1 - norm(x, min, max).
 *
 * inv_norm(x) = 1 - norm(x, min, max)
 */
export function invNorm(x: number, min: number, max: number): number {
  return 1 - norm(x, min, max);
}

/**
 * Clamps x to [lo, hi].
 */
export function clamp(x: number, lo = 0, hi = 1): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Rounds a number to N decimal places.
 */
export function round(x: number, decimals = 4): number {
  const factor = Math.pow(10, decimals);
  return Math.round(x * factor) / factor;
}

// ============================================================
// DEFAULT NORMALIZATION RANGES (from SCORING_V1 spec)
// ============================================================

export const RANGES = {
  precip: { min: 0, max: 3000 },     // mm/year
  temp:   { min: -5, max: 35 },      // °C
  slope:  { min: 0, max: 45 },       // degrees
  ph_dev: { min: 0, max: 2.0 },      // deviation from optimal pH 6.5
  soc:    { min: 0, max: 120 },      // t/ha in 0–30cm (for soc_baseline_proxy)
} as const;

export const OPTIMAL_PH = 6.5;
