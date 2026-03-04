/**
 * Demo economics configuration.
 *
 * ⚠️  ILLUSTRATIVE DEMO ONLY — not live pricing, not investment advice.
 *
 * Used by ScoreWidget and ExplorePanel to show a rough revenue estimate based on:
 *   annual_tco2 = carbon_expected_rate * area_ha
 *   revenue     = annual_tco2 * price  (for each price tier)
 *   risk_adj    = revenue_mid * (1 - reversal_risk)
 */

export interface DemoPriceTier {
  label: string;
  usd_per_tco2e: number;
}

/**
 * Configurable carbon price tiers (USD / tCO₂e).
 * Update these values to reflect current voluntary carbon market ranges.
 */
export const DEMO_PRICE_TIERS: DemoPriceTier[] = [
  { label: 'Low',  usd_per_tco2e: 10 },
  { label: 'Mid',  usd_per_tco2e: 20 },
  { label: 'High', usd_per_tco2e: 35 },
];

export interface DemoEconomicsResult {
  annual_tco2_potential: number;       // tCO₂e/yr
  revenue_low_usd:  number;
  revenue_mid_usd:  number;
  revenue_high_usd: number;
  risk_adjusted_mid_usd: number;       // revenue_mid * (1 - reversal_risk)
}

/**
 * Compute demo economics given scoring outputs.
 *
 * @param carbonRateHaYr   tCO₂e/ha/yr from scoring engine
 * @param areaHa           land area in hectares
 * @param reversalRisk01   reversal risk 0–1
 */
export function computeDemoEconomics(
  carbonRateHaYr: number,
  areaHa: number,
  reversalRisk01: number
): DemoEconomicsResult {
  const annual = carbonRateHaYr * areaHa;
  const low    = annual * DEMO_PRICE_TIERS[0].usd_per_tco2e;
  const mid    = annual * DEMO_PRICE_TIERS[1].usd_per_tco2e;
  const high   = annual * DEMO_PRICE_TIERS[2].usd_per_tco2e;
  return {
    annual_tco2_potential: annual,
    revenue_low_usd:       low,
    revenue_mid_usd:       mid,
    revenue_high_usd:      high,
    risk_adjusted_mid_usd: mid * (1 - reversalRisk01),
  };
}

export function formatUSD(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)     return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}
