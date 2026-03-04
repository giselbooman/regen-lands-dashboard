/**
 * ISO 3166-based jurisdiction → centroid resolver.
 *
 * Supports both:
 *   ISO 3166-1 alpha-2  (e.g. "KE", "BR", "ID")
 *   ISO 3166-2          (e.g. "US-WA", "CO-ANT", "CD-MN", "PE-MDD")
 *
 * Resolution order:
 *   1. Try exact match on full code (subdivision first).
 *   2. If no subdivision entry, parse "CC-XX" and fall back to country centroid.
 *   3. Return null if country is also unknown.
 *
 * Returns: { lat, lon, name, precision }
 *   precision = "subdivision" if subdivision entry was found
 *   precision = "country" if only country centroid was used
 *
 * All coordinates are centroids of administrative areas — not project-level precision.
 * The frontend MUST show "Approximate location" for these entries.
 */

import type { LocationPrecision } from './types';

interface GeoEntry {
  lat: number;
  lon: number;
  name: string;
}

export interface JurisdictionResult extends GeoEntry {
  precision: Exclude<LocationPrecision, 'project' | 'unknown'>;
}

// ============================================================
// SUBDIVISION CENTROIDS  (ISO 3166-2)
// ============================================================
// Extend as new projects are added — no hardcoded "58".

const SUBDIVISION_CENTROIDS: Record<string, GeoEntry> = {
  // United States
  'US-WA': { lat: 47.5, lon: -120.5, name: 'Washington, USA' },
  'US-OH': { lat: 40.4, lon: -82.7, name: 'Ohio, USA' },
  'US-PA': { lat: 41.2, lon: -77.2, name: 'Pennsylvania, USA' },
  'US-VA': { lat: 37.5, lon: -79.0, name: 'Virginia, USA' },
  'US-TN': { lat: 35.9, lon: -86.7, name: 'Tennessee, USA' },
  'US-IA': { lat: 42.0, lon: -93.2, name: 'Iowa, USA' },
  'US-ID': { lat: 44.1, lon: -114.7, name: 'Idaho, USA' },
  'US-TX': { lat: 31.0, lon: -100.0, name: 'Texas, USA' },
  'US-IL': { lat: 40.6, lon: -89.2, name: 'Illinois, USA' },
  'US-MT': { lat: 47.0, lon: -110.0, name: 'Montana, USA' },
  'US-OR': { lat: 44.0, lon: -120.5, name: 'Oregon, USA' },
  'US-CA': { lat: 36.8, lon: -119.4, name: 'California, USA' },
  'US-CO': { lat: 39.1, lon: -105.4, name: 'Colorado, USA' },
  'US-KS': { lat: 38.5, lon: -98.4, name: 'Kansas, USA' },
  'US-MN': { lat: 46.4, lon: -93.9, name: 'Minnesota, USA' },
  'US-NE': { lat: 41.5, lon: -99.9, name: 'Nebraska, USA' },
  'US-SD': { lat: 44.4, lon: -100.2, name: 'South Dakota, USA' },
  'US-ND': { lat: 47.5, lon: -100.5, name: 'North Dakota, USA' },
  'US-WY': { lat: 43.0, lon: -107.6, name: 'Wyoming, USA' },
  'US-GA': { lat: 32.9, lon: -83.6, name: 'Georgia, USA' },
  // Colombia
  'CO-ANT': { lat: 7.2, lon: -75.3, name: 'Antioquia, Colombia' },
  'CO-CUN': { lat: 5.0, lon: -74.0, name: 'Cundinamarca, Colombia' },
  'CO-BOY': { lat: 5.8, lon: -73.0, name: 'Boyacá, Colombia' },
  'CO-HUI': { lat: 2.5, lon: -75.5, name: 'Huila, Colombia' },
  'CO-CAQ': { lat: 1.0, lon: -74.0, name: 'Caquetá, Colombia' },
  'CO-PUT': { lat: 0.5, lon: -76.5, name: 'Putumayo, Colombia' },
  // Peru
  'PE-MDD': { lat: -12.0, lon: -70.0, name: 'Madre de Dios, Peru' },
  'PE-LOR': { lat: -5.0, lon: -75.0, name: 'Loreto, Peru' },
  'PE-UCA': { lat: -8.0, lon: -75.0, name: 'Ucayali, Peru' },
  // DRC
  'CD-MN':  { lat: -3.0, lon: 26.5, name: 'Maniema, DRC' },
  'CD-KV':  { lat: -2.5, lon: 28.5, name: 'Kivu, DRC' },
  // Australia
  'AU-NSW': { lat: -32.0, lon: 147.0, name: 'New South Wales, Australia' },
  'AU-QLD': { lat: -22.0, lon: 144.0, name: 'Queensland, Australia' },
  'AU-VIC': { lat: -37.0, lon: 144.5, name: 'Victoria, Australia' },
  'AU-WA':  { lat: -26.0, lon: 122.0, name: 'Western Australia' },
  // United Kingdom
  'GB-ENG': { lat: 52.4, lon: -1.5, name: 'England, UK' },
  'GB-SCT': { lat: 57.0, lon: -4.0, name: 'Scotland, UK' },
  'GB-WLS': { lat: 52.1, lon: -3.7, name: 'Wales, UK' },
  // Brazil
  'BR-PA':  { lat: -4.0, lon: -52.0, name: 'Pará, Brazil' },
  'BR-AM':  { lat: -4.5, lon: -63.0, name: 'Amazonas, Brazil' },
  'BR-MT':  { lat: -13.0, lon: -56.0, name: 'Mato Grosso, Brazil' },
  'BR-MG':  { lat: -18.5, lon: -44.5, name: 'Minas Gerais, Brazil' },
  // Kenya subdivisions (if present as KE-* codes)
  'KE-CE':  { lat: -0.3, lon: 37.3, name: 'Central, Kenya' },
  // China
  'CN-YN':  { lat: 25.0, lon: 101.5, name: 'Yunnan, China' },
  'CN-SC':  { lat: 30.5, lon: 102.5, name: 'Sichuan, China' },
};

// ============================================================
// COUNTRY CENTROIDS  (ISO 3166-1 alpha-2)
// ============================================================

const COUNTRY_CENTROIDS: Record<string, GeoEntry> = {
  'AF': { lat: 33.9, lon: 67.7, name: 'Afghanistan' },
  'AU': { lat: -25.3, lon: 133.8, name: 'Australia' },
  'BR': { lat: -14.2, lon: -51.9, name: 'Brazil' },
  'CD': { lat: -4.0, lon: 21.8, name: 'DR Congo' },
  'CG': { lat: -0.2, lon: 15.8, name: 'Republic of Congo' },
  'CH': { lat: 46.8, lon: 8.2, name: 'Switzerland' },
  'CL': { lat: -35.7, lon: -71.5, name: 'Chile' },
  'CM': { lat: 5.7, lon: 12.4, name: 'Cameroon' },
  'CN': { lat: 35.9, lon: 104.2, name: 'China' },
  'CO': { lat: 4.6, lon: -74.1, name: 'Colombia' },
  'CR': { lat: 9.7, lon: -83.8, name: 'Costa Rica' },
  'DE': { lat: 51.2, lon: 10.5, name: 'Germany' },
  'EC': { lat: -1.8, lon: -78.2, name: 'Ecuador' },
  'ET': { lat: 9.1, lon: 40.5, name: 'Ethiopia' },
  'FR': { lat: 46.2, lon: 2.2, name: 'France' },
  'GB': { lat: 55.4, lon: -3.4, name: 'United Kingdom' },
  'GH': { lat: 7.9, lon: -1.0, name: 'Ghana' },
  'GT': { lat: 15.8, lon: -90.2, name: 'Guatemala' },
  'HN': { lat: 15.2, lon: -86.2, name: 'Honduras' },
  'ID': { lat: -0.8, lon: 113.9, name: 'Indonesia' },
  'IN': { lat: 20.6, lon: 79.1, name: 'India' },
  'KE': { lat: 0.0, lon: 38.0, name: 'Kenya' },
  'KH': { lat: 12.6, lon: 104.9, name: 'Cambodia' },
  'LR': { lat: 6.4, lon: -9.4, name: 'Liberia' },
  'MX': { lat: 23.6, lon: -102.5, name: 'Mexico' },
  'MZ': { lat: -18.7, lon: 35.5, name: 'Mozambique' },
  'NG': { lat: 9.1, lon: 8.7, name: 'Nigeria' },
  'NI': { lat: 12.9, lon: -85.2, name: 'Nicaragua' },
  'PE': { lat: -9.2, lon: -75.0, name: 'Peru' },
  'PG': { lat: -6.3, lon: 143.9, name: 'Papua New Guinea' },
  'PH': { lat: 12.9, lon: 121.8, name: 'Philippines' },
  'RW': { lat: -1.9, lon: 29.9, name: 'Rwanda' },
  'SD': { lat: 15.6, lon: 32.5, name: 'Sudan' },
  'SN': { lat: 14.5, lon: -14.5, name: 'Senegal' },
  'SO': { lat: 5.2, lon: 46.2, name: 'Somalia' },
  'TH': { lat: 15.9, lon: 100.9, name: 'Thailand' },
  'TZ': { lat: -6.4, lon: 34.9, name: 'Tanzania' },
  'UA': { lat: 48.4, lon: 31.2, name: 'Ukraine' },
  'UG': { lat: 1.4, lon: 32.3, name: 'Uganda' },
  'US': { lat: 37.1, lon: -95.7, name: 'United States' },
  'VN': { lat: 14.1, lon: 108.3, name: 'Vietnam' },
  'ZA': { lat: -29.0, lon: 25.1, name: 'South Africa' },
  'ZM': { lat: -13.1, lon: 27.8, name: 'Zambia' },
  'ZW': { lat: -19.0, lon: 29.8, name: 'Zimbabwe' },
};

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Looks up a jurisdiction code (ISO 3166-1 or 3166-2) and returns
 * a centroid with precision level. Returns null if entirely unknown.
 *
 * Resolution order:
 *   1. Exact subdivision match (precision = "subdivision")
 *   2. Parse country prefix and match country centroid (precision = "country")
 *   3. Return null
 */
export function lookupJurisdiction(code: string): JurisdictionResult | null {
  if (!code) return null;

  const normalized = code.trim().toUpperCase();

  // 1. Exact subdivision match
  const subdiv = SUBDIVISION_CENTROIDS[normalized];
  if (subdiv) {
    return { ...subdiv, precision: 'subdivision' };
  }

  // 2. Country fallback — parse "CC" or "CC-XX"
  const countryCode = normalized.includes('-')
    ? normalized.split('-')[0]
    : normalized;

  const country = COUNTRY_CENTROIDS[countryCode];
  if (country) {
    return { ...country, precision: 'country' };
  }

  return null;
}
