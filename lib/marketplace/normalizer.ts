/**
 * Normalizer: converts RawRegenProject → MarketplaceProject.
 *
 * Resolution order (per project):
 *   1. resolveIRI → queries metadata-graph API + registry GraphQL in parallel, merges
 *   2. If IRI metadata has geometry → location.type = "polygon"|"point", precision = "project"
 *   3. If IRI metadata but no geometry → keep name/fields, try jurisdiction centroid
 *   4. If IRI resolver returns null → jurisdiction centroid fallback
 *      a. Subdivision match → precision = "subdivision"
 *      b. Country match    → precision = "country"
 *      c. No match         → location.type = "unknown", precision = "unknown"
 *   5. Enricher fallback → HTML scrape of app.regen.network for name only
 *      (used only when metadata-graph returns null for the project)
 *
 * source.geodata is ALWAYS "marketplace" — jurisdiction comes from the on-chain record.
 */

import type { RawRegenProject, MarketplaceProject } from './types';
import { resolveIRI } from './iriResolver';
import { lookupJurisdiction } from './jurisdictionGeo';
import { enrichProject } from './enricher';
import type { EnrichedMetadata, EnrichmentAttempt } from './enricher';

const REGEN_REGISTRY_URL = 'https://app.regen.network/project/';

/**
 * Normalizes a single raw project.
 *
 * @param options.skipEnrich  When true, skip the enricher HTTP fetch entirely
 *   (used by debug mode to limit enrichment to the first N projects).
 */
export async function normalizeProject(
  raw: RawRegenProject,
  classNames: Map<string, string>,
  options?: { skipEnrich?: boolean }
): Promise<MarketplaceProject> {
  // --- Run IRI resolver and enricher in parallel (both best-effort) ---
  const noEnrich: { metadata: EnrichedMetadata | null; attempts: EnrichmentAttempt[] } =
    { metadata: null, attempts: [] };

  const [iriMetadata, { metadata: enriched, attempts: enrichAttempts }] = await Promise.all([
    resolveIRI(raw.id, raw.metadata),
    options?.skipEnrich ? Promise.resolve(noEnrich) : enrichProject(raw.id, raw.reference_id),
  ]);

  const creditClass = classNames.get(raw.class_id) ?? raw.class_id;

  // --- Merge metadata sources (IRI takes priority over enricher) ---
  const name = (iriMetadata?.name ?? enriched?.name ?? '').trim() || 'Unnamed Project';

  const land_use       = iriMetadata?.land_use    ?? enriched?.land_use;
  const methodology    = iriMetadata?.methodology ?? enriched?.methodology;
  const status         = enriched?.status;
  const primary_impact = enriched?.primary_impact;
  const credits_issued = enriched?.credits_issued;

  // --- Determine metadata_source ---
  let metadata_source: 'iri' | 'html_title' | 'enriched' | 'registry' | 'none';
  if (iriMetadata?.name || iriMetadata?.land_use || iriMetadata?.methodology || iriMetadata?.description) {
    metadata_source = 'iri';
  } else if (enriched?.name || enriched?.land_use || enriched?.methodology) {
    metadata_source = enriched.name ? 'html_title' : 'enriched';
  } else {
    metadata_source = 'none';
    const urlSummary = enrichAttempts
      .map(a =>
        `${a.url} → ${a.httpStatus}` +
        (a.foundNextData ? '+ND' : '') +
        (a.foundLdJson   ? '+LD' : '') +
        (a.extractedName ? ` name="${a.extractedName}"` : '')
      )
      .join(' | ');
    console.info(
      `[normalizer] ${raw.id}: metadata_source=none — ` +
      `ref="${raw.reference_id}", jur="${raw.jurisdiction}", ` +
      `iri=${iriMetadata ? JSON.stringify(iriMetadata).slice(0, 100) : 'null'} | ` +
      `enrich: [${urlSummary || 'cached/no-attempts'}]`
    );
  }

  // --- Build enrich_diag from the first attempt (populated on ?debug=1 responses) ---
  const attempt = enrichAttempts[0];
  const enrich_diag: MarketplaceProject['enrich_diag'] = attempt
    ? {
        url_requested : attempt.url,
        http_status   : attempt.httpStatus,
        content_type  : attempt.contentType ?? '',
        bytes         : attempt.bytes ?? 0,
        has_next_data : attempt.foundNextData,
        has_ld_json   : attempt.foundLdJson,
        title         : attempt.title ?? '',
      }
    : undefined;

  // --- Build the base project object ---
  const project: MarketplaceProject = {
    id:   raw.id,
    name,
    jurisdiction: raw.jurisdiction,
    location: { type: 'unknown', precision: 'unknown' },
    credit_class_id: raw.class_id,
    credit_class: creditClass,

    // Descriptive
    description:  iriMetadata?.description,
    story:        iriMetadata?.story,
    story_title:  iriMetadata?.story_title,
    preview_photo: iriMetadata?.preview_photo,
    gallery_photos: iriMetadata?.gallery_photos,

    // Location labels
    place_name:          iriMetadata?.place_name,
    administrative_area: iriMetadata?.administrative_area,

    // Ecology & size
    land_use,
    ecosystem_type:                iriMetadata?.ecosystem_type,
    project_size_ha:               iriMetadata?.project_size_ha,
    biome_type:                    iriMetadata?.biome_type,
    bioregion:                     iriMetadata?.bioregion,
    region:                        iriMetadata?.region,
    watershed:                     iriMetadata?.watershed,
    conservation_status:           iriMetadata?.conservation_status,
    ecological_connectivity_index: iriMetadata?.ecological_connectivity_index,

    // Activities & protocol
    project_activities:      iriMetadata?.project_activities,
    co_benefits:             iriMetadata?.co_benefits,
    management_areas:        iriMetadata?.management_areas,
    market_type:             iriMetadata?.market_type,
    offset_generation_method: iriMetadata?.offset_generation_method,
    methodology,
    vcs_methodology:         iriMetadata?.vcs_methodology,
    vcs_project_page:        iriMetadata?.vcs_project_page,
    project_type:            iriMetadata?.project_type,

    // Timeline
    start_date:       iriMetadata?.start_date,
    end_date:         iriMetadata?.end_date,
    project_duration: iriMetadata?.project_duration,

    // Stakeholders
    developer:              iriMetadata?.developer,
    operator:               iriMetadata?.operator,
    verifier:               iriMetadata?.verifier,
    monitor:                iriMetadata?.monitor,
    environmental_authority: iriMetadata?.environmental_authority,

    // Quality
    ratings: iriMetadata?.ratings,

    // Enricher (HTML fallback) fields
    status,
    primary_impact,
    credits_issued,

    enrich_diag,
    metadata_source,
    marketplace_url: `${REGEN_REGISTRY_URL}${encodeURIComponent(raw.id)}`,
    source: { geodata: 'marketplace' },
  };

  // Priority 1: IRI metadata provided a location
  if (iriMetadata?.location) {
    const loc = iriMetadata.location;
    if (loc.type === 'polygon' && loc.geometry) {
      project.location = { type: 'polygon', precision: 'project', geometry: loc.geometry };
    } else if (loc.type === 'point' && loc.lat !== undefined && loc.lon !== undefined) {
      project.location = { type: 'point', precision: 'project', lat: loc.lat, lon: loc.lon };
    }
    return project;
  }

  // Priority 2: Jurisdiction centroid fallback
  if (raw.jurisdiction) {
    const geo = lookupJurisdiction(raw.jurisdiction);
    if (geo) {
      project.location = {
        type: 'point',
        precision: geo.precision,
        lat: geo.lat,
        lon: geo.lon,
      };
      return project;
    }
  }

  // Priority 3: Unknown
  return project;
}

/**
 * Normalizes all raw projects in parallel.
 * Uses Promise.allSettled so that individual failures don't block the batch.
 * Projects that fail normalization are excluded from the output (with a warning log).
 *
 * @param options.enrichLimit  When set, only the first N projects run the enricher
 *   HTTP fetch. Remaining projects are normalized from IRI / jurisdiction only.
 */
export async function normalizeAll(
  rawProjects: RawRegenProject[],
  classNames: Map<string, string>,
  options?: { enrichLimit?: number }
): Promise<MarketplaceProject[]> {
  const limit = options?.enrichLimit;
  const settled = await Promise.allSettled(
    rawProjects.map((raw, idx) =>
      normalizeProject(raw, classNames, {
        skipEnrich: limit !== undefined && idx >= limit,
      })
    )
  );

  const results: MarketplaceProject[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      results.push(result.value);
    } else {
      console.warn('[normalizer] Project normalization failed:', result.reason);
    }
  }
  return results;
}
