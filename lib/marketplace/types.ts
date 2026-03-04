/**
 * Marketplace data types for Regen Network projects.
 *
 * The MarketplaceProject shape is the stable frontend contract.
 * Changing the geodata source (jurisdiction centroid → IRI polygon → real parcel)
 * only populates different fields within `location` — the outer shape never changes.
 */

// ============================================================
// RAW API SHAPES  (internal to lib/marketplace, never exported to UI)
// ============================================================

export interface RawRegenProject {
  id: string;            // e.g. "C01-001"
  admin: string;         // bech32 address
  class_id: string;      // e.g. "C01"
  jurisdiction: string;  // ISO 3166-1 or ISO 3166-2, e.g. "US-WA" or "KE"
  metadata: string;      // regen:<hash>.rdf IRI
  reference_id: string;
}

export interface RawRegenClass {
  id: string;            // e.g. "C01"
  admin: string;
  metadata: string;
}

// ============================================================
// SHARED TYPES
// ============================================================

export interface Stakeholder {
  name?: string;
  description?: string;
  image?: string;
}

export interface CreditRating {
  agency: string;          // e.g. "BeZero Carbon"
  value: string;           // e.g. "AAA", "BB+"
  url?: string;
}

export interface GalleryPhoto {
  url: string;
  caption?: string;
}

// ============================================================
// IRI RESOLVER OUTPUT  (internal to lib/marketplace)
// ============================================================

export interface IRIMetadata {
  // ── Core descriptive ────────────────────────────────────────
  name?: string;
  description?: string;
  place_name?: string;           // human-readable location, e.g. "Antioquia, Colombia"
  administrative_area?: string;  // sub-national area, e.g. "Antioquia"
  region?: string;               // e.g. "Andean"
  biome_type?: string;           // e.g. "Andean Orobiome North Pacific Foothills"
  bioregion?: string;            // e.g. "Low Montane Very Humid Forest"
  watershed?: string;
  sub_watershed?: string;
  // ── Location ────────────────────────────────────────────────
  location?: {
    type: 'point' | 'polygon';
    lat?: number;
    lon?: number;
    geometry?: GeoJSONPolygon | GeoJSONMultiPolygon;
  };
  // ── Ecology & size ──────────────────────────────────────────
  ecosystem_type?: string[];
  land_use?: string;             // kept for backward compat with normalizer
  project_size_ha?: number;
  conservation_status?: string;  // e.g. "LEAST_CONCERN"
  ecological_connectivity_index?: number;
  // ── Activities & protocol ────────────────────────────────────
  project_activities?: string[];
  co_benefits?: string[];
  management_areas?: Array<{ activity: string; ha: number }>;
  market_type?: string[];        // e.g. ["COMPLIANCE_MARKET", "VOLUNTARY_MARKET"]
  offset_generation_method?: string[];
  // Methodology / protocol (generic and VCS-specific)
  methodology?: { id?: string; name?: string; version?: string };
  vcs_methodology?: { name?: string; url?: string };
  vcs_project_page?: string;
  project_type?: string;         // e.g. "Agriculture Forestry and Other Land Use"
  project_activity_name?: string; // e.g. "REDD"
  // ── Stakeholders ────────────────────────────────────────────
  developer?: Stakeholder;
  operator?: Stakeholder;
  verifier?: Stakeholder;
  monitor?: Stakeholder;
  owner?: Stakeholder;
  environmental_authority?: string[];
  // ── Timeline ────────────────────────────────────────────────
  start_date?: string;           // ISO date, e.g. "2022-12-22"
  end_date?: string;
  project_duration?: string;     // ISO 8601 duration, e.g. "P30Y"
  // ── Quality & ratings ───────────────────────────────────────
  ratings?: CreditRating[];
  // ── Registry / UI data (from registry GraphQL) ──────────────
  story?: string;
  story_title?: string;
  preview_photo?: string;
  gallery_photos?: GalleryPhoto[];
}

// Minimal GeoJSON types (avoids importing @types/geojson — not needed since TS lib covers it)
export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface GeoJSONMultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

// ============================================================
// PUBLIC CONTRACT  (imported by API route, components, ScoreWidget)
// ============================================================

/**
 * location.precision describes the accuracy level of the geodata source:
 *   "project"     — exact project boundary from IRI / registry data
 *   "subdivision" — ISO 3166-2 subdivision centroid (e.g. US state, Colombia department)
 *   "country"     — ISO 3166-1 country centroid (subdivision unknown or missing from table)
 *   "unknown"     — no geo available at all
 *
 * UI must show "Approximate location" badge for subdivision / country precision.
 */
export type LocationPrecision = 'project' | 'subdivision' | 'country' | 'unknown';

export type MarketplaceProject = {
  id: string;
  name: string;
  jurisdiction?: string;  // raw ISO code, for display

  // ── Location ───────────────────────────────────────────────
  location: {
    type: 'point' | 'polygon' | 'unknown';
    precision: LocationPrecision;
    lat?: number;
    lon?: number;
    geometry?: GeoJSONPolygon | GeoJSONMultiPolygon;
  };
  place_name?: string;           // human-readable location label
  administrative_area?: string;  // sub-national area name

  // ── Descriptive ────────────────────────────────────────────
  description?: string;
  story?: string;
  story_title?: string;
  preview_photo?: string;
  gallery_photos?: GalleryPhoto[];

  // ── Ecology & size ─────────────────────────────────────────
  land_use?: string;
  ecosystem_type?: string[];
  project_size_ha?: number;
  biome_type?: string;
  bioregion?: string;
  region?: string;
  watershed?: string;
  conservation_status?: string;
  ecological_connectivity_index?: number;

  // ── Activities & protocol ───────────────────────────────────
  credit_class_id?: string;  // raw code, e.g. "C07"
  credit_class?: string;     // human name, e.g. "CarbonPlus Grasslands Credit Class"
  project_activities?: string[];
  co_benefits?: string[];
  management_areas?: Array<{ activity: string; ha: number }>;
  market_type?: string[];
  offset_generation_method?: string[];
  methodology?: { id?: string; name?: string; version?: string };
  vcs_methodology?: { name?: string; url?: string };
  vcs_project_page?: string;
  project_type?: string;

  // ── Timeline ────────────────────────────────────────────────
  start_date?: string;
  end_date?: string;
  project_duration?: string;

  // ── Stakeholders ────────────────────────────────────────────
  developer?: Stakeholder;
  operator?: Stakeholder;
  verifier?: Stakeholder;
  monitor?: Stakeholder;
  environmental_authority?: string[];

  // ── Quality ─────────────────────────────────────────────────
  ratings?: CreditRating[];

  // ── Legacy / enricher fields ───────────────────────────────
  status?: string;
  primary_impact?: string;   // from HTML text (enricher fallback)
  credits_issued?: number;   // from HTML text (enricher fallback)

  marketplace_url?: string;

  /**
   * Enrichment diagnostics — only populated when the API is called with ?debug=1.
   * Stripped from normal responses to keep payload small.
   */
  enrich_diag?: {
    url_requested: string;
    http_status: number | 'error' | 'timeout';
    content_type: string;
    bytes: number;
    has_next_data: boolean;
    has_ld_json: boolean;
    title: string;
  };

  /**
   * Where the human-readable metadata (name / methodology / land_use) came from.
   *   'iri'        — resolved from on-chain metadata IRI via metadata-graph API
   *   'registry'   — fetched from Regen Registry GraphQL (off-chain registry data)
   *   'html_title' — extracted from <title> + HTML text patterns (enricher fallback)
   *   'enriched'   — scraped via __NEXT_DATA__ / ld+json (legacy; rarely fires on RSC pages)
   *   'none'       — neither source returned useful data; name shown as "Unnamed Project"
   */
  metadata_source: 'iri' | 'html_title' | 'enriched' | 'registry' | 'none';

  /**
   * Provenance metadata — always present.
   * geodata is always "marketplace" because jurisdiction IS from the on-chain record.
   */
  source: {
    geodata: 'marketplace';
    methodology?: 'marketplace' | 'koi' | 'registry' | 'unknown';
    land_use?: 'marketplace' | 'koi' | 'unknown';
  };
};

// ============================================================
// API RESPONSE
// ============================================================

export interface MarketplaceProjectsResponse {
  projects: MarketplaceProject[];
  metadata: {
    total: number;
    with_location: number;
    without_location: number;
    cached_at: string;
    cache_ttl_ms: number;
  };
}
