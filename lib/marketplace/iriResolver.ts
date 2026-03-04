/**
 * IRI resolver for regen: metadata IRIs.
 *
 * Runs two data sources in parallel and merges the results:
 *
 *   1. METADATA_GRAPH_API  — GET https://api.regen.network/data/v2/metadata-graph/{iri}
 *      The on-chain anchored JSON-LD document. Authoritative for location, size,
 *      activities, stakeholders, methodology.
 *
 *   2. REGISTRY_GRAPHQL    — POST https://api.registry.regen.network/marketplace/v1/graphql
 *      Off-chain registry data (story, gallery photos, ecological connectivity index,
 *      preview photo). Requires a CSRF token obtained before querying.
 *
 * Design:
 *   - Both sources run in parallel. Metadata-graph fields take priority; registry fills gaps.
 *   - NEVER throws — returns IRIMetadata | null.
 *   - Per-project results are NOT cached here; the normalizer handles project-level caching.
 *   - Registry CSRF token is cached in module scope (30-minute TTL).
 *
 * Server-side only.
 */

import type {
  IRIMetadata,
  GeoJSONPolygon,
  GeoJSONMultiPolygon,
  Stakeholder,
  CreditRating,
  GalleryPhoto,
} from './types';

const RESOLVER_TIMEOUT_MS = 8_000;

// ============================================================
// WKT → GeoJSON POLYGON  (legacy fallback, kept for old-format metadata)
// ============================================================

function parseWKTPolygon(wkt: string): GeoJSONPolygon | null {
  const match = wkt.trim().match(/^POLYGON\s*\(\((.+)\)\)$/i);
  if (!match) return null;
  const pairs = match[1].split(',').map((pair) => {
    const [lonStr, latStr] = pair.trim().split(/\s+/);
    return [parseFloat(lonStr), parseFloat(latStr)];
  });
  if (pairs.some(([lon, lat]) => isNaN(lon) || isNaN(lat))) return null;
  return { type: 'Polygon', coordinates: [pairs] };
}

// ============================================================
// SHARED JSON-LD EXTRACTION
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function extractStakeholder(raw: unknown): Stakeholder | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as AnyObj;
  const name = str(r['schema:name']);
  const image = str(r['schema:image']);
  const description = str(r['schema:description']);
  if (!name && !image) return undefined;
  return { name, image, description };
}

/**
 * Extracts IRIMetadata from a resolved JSON-LD metadata document.
 * Handles both the metadata-graph API shape (using schema:location GeoJSON)
 * and the legacy regen:hasFeature / WKT shape.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFromJsonLD(json: Record<string, any>): IRIMetadata | null {
  const result: IRIMetadata = {};

  // ── name ──────────────────────────────────────────────────
  result.name = str(json['schema:name'] ?? json['regen:name'] ?? json['name']);

  // ── description ───────────────────────────────────────────
  result.description = str(json['schema:description']);

  // ── location: schema:location (GeoJSON Feature) ───────────
  const schemaLoc = json['schema:location'];
  if (schemaLoc && typeof schemaLoc === 'object') {
    const geom = schemaLoc['geometry'] as AnyObj | undefined;
    if (geom && typeof geom === 'object') {
      const gtype = geom['type'];
      const coords = geom['coordinates'];

      if (gtype === 'Point' && Array.isArray(coords) && coords.length >= 2) {
        const lon = typeof coords[0] === 'number' ? coords[0] : parseFloat(String(coords[0]));
        const lat = typeof coords[1] === 'number' ? coords[1] : parseFloat(String(coords[1]));
        if (!isNaN(lon) && !isNaN(lat)) {
          result.location = { type: 'point', lon, lat };
        }
      } else if (gtype === 'Polygon' && Array.isArray(coords)) {
        result.location = {
          type: 'polygon',
          geometry: { type: 'Polygon', coordinates: coords as number[][][] },
        };
      } else if (gtype === 'MultiPolygon' && Array.isArray(coords)) {
        result.location = {
          type: 'polygon',
          geometry: { type: 'MultiPolygon', coordinates: coords as number[][][][] },
        };
      }
    }
    result.place_name = str(schemaLoc['place_name']);
  }

  // ── location: legacy regen:hasFeature (WKT) ───────────────
  if (!result.location) {
    const hasFeature = json['regen:hasFeature'];
    if (hasFeature && typeof hasFeature === 'object') {
      const wktGeom = hasFeature['regen:hasGeometry'];
      if (typeof wktGeom === 'string') {
        const poly = parseWKTPolygon(wktGeom);
        if (poly) result.location = { type: 'polygon', geometry: poly };
      }
      if (!result.location) {
        const centroid = hasFeature['regen:hasCentroid'] ?? hasFeature['hasCentroid'];
        if (centroid && typeof centroid === 'object') {
          const lat = centroid['schema:latitude'] ?? centroid['latitude'];
          const lon = centroid['schema:longitude'] ?? centroid['longitude'];
          if (typeof lat === 'number' && typeof lon === 'number') {
            result.location = { type: 'point', lat, lon };
          }
        }
      }
    }
  }

  // ── ecological / biome ────────────────────────────────────
  result.biome_type   = str(json['regen:biomeType']);
  result.bioregion    = str(json['regen:bioregion']);
  result.region       = str(json['regen:region']);
  result.watershed    = str(json['regen:watershed']);
  result.sub_watershed = str(json['regen:subWatershed']);

  const ecosys = json['regen:ecosystemType'];
  if (Array.isArray(ecosys)) {
    result.ecosystem_type = (ecosys as unknown[]).filter((s): s is string => typeof s === 'string');
  } else if (typeof ecosys === 'string') {
    result.ecosystem_type = [ecosys];
  }

  // land_use: prefer biomeType for backward-compat; fallback to ecosystemType
  result.land_use = result.biome_type ?? result.ecosystem_type?.[0]
    ?? str(json['regen:biomeType'] ?? json['regen:environmentType']);

  // ── administrative area ───────────────────────────────────
  const adminArea = json['regen:administrativeArea'];
  if (adminArea && typeof adminArea === 'object') {
    result.administrative_area = str((adminArea as AnyObj)['schema:name']);
  }

  // ── project size ──────────────────────────────────────────
  const sizeObj = json['regen:projectSize'];
  if (sizeObj && typeof sizeObj === 'object') {
    const n = (sizeObj as AnyObj)['qudt:numericValue'];
    if (typeof n === 'number' && n > 0) result.project_size_ha = n;
  }

  // ── conservation status ───────────────────────────────────
  result.conservation_status = str(json['regen:conservationStatus']);

  // ── activities ────────────────────────────────────────────
  const acts = json['regen:projectActivities'];
  if (Array.isArray(acts)) {
    result.project_activities = (acts as unknown[]).filter((s): s is string => typeof s === 'string');
  }

  // ── co-benefits ───────────────────────────────────────────
  const coBenefits = json['regen:coBenefits'];
  if (Array.isArray(coBenefits)) {
    result.co_benefits = (coBenefits as unknown[])
      .map((cb): string | null => {
        if (typeof cb === 'string') return cb;
        if (cb && typeof cb === 'object') {
          const id = (cb as AnyObj)['@id'];
          if (typeof id === 'string') {
            // "regen:Climate-Terrasos" → "Climate Terrasos"
            return id.replace(/^regen:/, '').replace(/-/g, ' ');
          }
        }
        return null;
      })
      .filter((x): x is string => x !== null);
  }

  // ── management areas ─────────────────────────────────────
  const mgmtAreas = json['regen:managementAreas'];
  if (Array.isArray(mgmtAreas)) {
    result.management_areas = (mgmtAreas as unknown[])
      .map((area): { activity: string; ha: number } | null => {
        if (!area || typeof area !== 'object') return null;
        const a = area as AnyObj;
        const extent = a['dcterms:extent'];
        const ha = extent && typeof extent === 'object'
          ? (extent as AnyObj)['qudt:numericValue']
          : null;
        const activity = a['regen:projectActivity'];
        return {
          activity: typeof activity === 'string' ? activity : '',
          ha: typeof ha === 'number' ? ha : 0,
        };
      })
      .filter((x): x is { activity: string; ha: number } => x !== null);
  }

  // ── market type ───────────────────────────────────────────
  const mktType = json['regen:marketType'];
  if (Array.isArray(mktType)) {
    result.market_type = (mktType as unknown[]).filter((s): s is string => typeof s === 'string');
  } else if (typeof mktType === 'string') {
    result.market_type = [mktType];
  }

  // ── methodology ──────────────────────────────────────────
  // Generic methodology field
  const methRaw = json['regen:methodologyInfo'] ?? json['regen:methodology'];
  if (methRaw && typeof methRaw === 'object') {
    const m = methRaw as AnyObj;
    result.methodology = {
      id:   str(m['@id'] ?? m.id),
      name: str(m['schema:name'] ?? m.name),
    };
  }

  // VCS-specific methodology
  const vcsMeth = json['regen:vcsMethodology'];
  if (vcsMeth && typeof vcsMeth === 'object') {
    const m = vcsMeth as AnyObj;
    result.vcs_methodology = { name: str(m['schema:name']), url: str(m['schema:url']) };
    // Also populate generic methodology if not already set
    if (!result.methodology && result.vcs_methodology.name) {
      result.methodology = { name: result.vcs_methodology.name };
    }
  }

  // approvedMethodologies (C03/Toucan projects)
  const approvedMeths = json['regen:approvedMethodologies'];
  if (!result.methodology) {
    if (Array.isArray(approvedMeths) && approvedMeths.length > 0) {
      const first = approvedMeths[0] as AnyObj | string;
      if (typeof first === 'string') {
        result.methodology = { name: first };
      } else if (first && typeof first === 'object') {
        result.methodology = { name: str(first['schema:name']), id: str(first['@id']) };
      }
    }
  }

  // VCS project page
  result.vcs_project_page = str(json['regen:vcsProjectPage']);

  // Project type (AFOLU etc.) — from single or plural key
  result.project_type = str(json['regen:projectType'] ?? json['regen:projectTypes']);

  // Project activity (single, for REDD projects)
  const pa = json['regen:projectActivity'];
  if (pa && typeof pa === 'object') {
    result.project_activity_name = str((pa as AnyObj)['schema:name']);
  } else {
    result.project_activity_name = str(pa);
  }

  // Offset generation method
  const ogm = json['regen:offsetGenerationMethod'];
  if (Array.isArray(ogm)) {
    result.offset_generation_method = (ogm as unknown[]).filter((s): s is string => typeof s === 'string');
  }

  // ── stakeholders ──────────────────────────────────────────
  result.developer = extractStakeholder(json['regen:projectDeveloper']);
  result.operator  = extractStakeholder(json['regen:projectOperator']);
  result.verifier  = extractStakeholder(json['regen:projectVerifier']);
  result.monitor   = extractStakeholder(json['regen:projectMonitor']);
  result.owner     = extractStakeholder(json['regen:projectOwner']);

  // Environmental authority (array of {schema:name})
  const envAuth = json['regen:environmentalAuthority'];
  if (Array.isArray(envAuth)) {
    result.environmental_authority = (envAuth as unknown[])
      .map((a): string | null => {
        if (typeof a === 'string') return a;
        if (a && typeof a === 'object') return str((a as AnyObj)['schema:name']) ?? null;
        return null;
      })
      .filter((x): x is string => x !== null);
  }

  // ── dates ─────────────────────────────────────────────────
  result.start_date       = str(json['regen:projectStartDate']);
  result.end_date         = str(json['regen:projectEndDate']);
  result.project_duration = str(json['regen:projectDuration']);

  // ── ratings (BeZero etc.) ─────────────────────────────────
  const ratings = json['regen:ratings'];
  if (Array.isArray(ratings)) {
    result.ratings = (ratings as unknown[])
      .map((r): CreditRating | null => {
        if (!r || typeof r !== 'object') return null;
        const rv = r as AnyObj;
        const agency = str(rv['schema:name']);
        const value  = str(rv['schema:ratingValue']);
        if (!agency || !value) return null;
        return { agency, value, url: str(rv['schema:url']) };
      })
      .filter((x): x is CreditRating => x !== null);
  }

  // ── registry GraphQL additional fields ───────────────────
  result.story       = str(json['regen:story']);
  result.story_title = str(json['regen:storyTitle']);

  const previewPhoto = json['regen:previewPhoto'];
  if (previewPhoto && typeof previewPhoto === 'object') {
    result.preview_photo = str((previewPhoto as AnyObj)['schema:url']);
  }

  const storyMedia = json['regen:storyMedia'];
  if (!result.preview_photo && storyMedia && typeof storyMedia === 'object') {
    result.preview_photo = str((storyMedia as AnyObj)['schema:url']);
  }

  const galleryRaw = json['regen:galleryPhotos'];
  if (Array.isArray(galleryRaw)) {
    const photos = (galleryRaw as unknown[])
      .map((p): GalleryPhoto | null => {
        if (!p || typeof p !== 'object') return null;
        const pv = p as AnyObj;
        const url = str(pv['schema:url']);
        if (!url) return null;
        return { url, caption: str(pv['schema:caption']) };
      })
      .filter((x): x is GalleryPhoto => x !== null);
    if (photos.length > 0) result.gallery_photos = photos;
  }

  const eci = json['regen:ecologicalConnectivityIndex'];
  if (typeof eci === 'number') result.ecological_connectivity_index = eci;

  // ── Guard: return null if nothing useful was found ────────
  if (!result.name && !result.location) return null;
  return result;
}

// ============================================================
// DEEP MERGE  (metadata-graph takes priority; registry fills gaps)
// ============================================================

function mergeMetadata(
  primary: IRIMetadata | null,
  secondary: IRIMetadata | null,
): IRIMetadata | null {
  if (!primary && !secondary) return null;
  if (!primary) return secondary;
  if (!secondary) return primary;

  // Primary wins for defined values; secondary fills gaps where primary is undefined.
  // We can't use { ...secondary, ...primary } because spreading undefined fields
  // from primary would overwrite defined fields in secondary.
  const result: IRIMetadata = { ...secondary };
  for (const _key of Object.keys(primary) as (keyof IRIMetadata)[]) {
    const key = _key as keyof IRIMetadata;
    const pVal = primary[key];
    if (pVal !== undefined && pVal !== null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result as any)[key] = pVal;
    }
  }

  // Arrays: prefer primary if non-empty, otherwise keep secondary
  const arrayFields = [
    'ecosystem_type', 'project_activities', 'co_benefits',
    'market_type', 'offset_generation_method', 'management_areas',
    'environmental_authority', 'gallery_photos', 'ratings',
  ] as const;
  for (const field of arrayFields) {
    const pArr = primary[field] as unknown[] | undefined;
    const sArr = secondary[field] as unknown[] | undefined;
    if ((!pArr || pArr.length === 0) && sArr && sArr.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result as any)[field] = sArr;
    }
  }

  return result;
}

// ============================================================
// STRATEGY 1: METADATA GRAPH API  (on-chain anchored IRI)
// ============================================================

async function strategyMetadataGraphAPI(
  projectId: string,
  iri: string,
): Promise<IRIMetadata | null> {
  if (!iri || !iri.startsWith('regen:')) {
    console.info(`[iriResolver:metadataGraph] ${projectId}: skipped — IRI not a regen: IRI`);
    return null;
  }

  // The API accepts the regen: IRI directly in the URL path (no encoding needed)
  const url = `https://api.regen.network/data/v2/metadata-graph/${iri}`;

  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(RESOLVER_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.info(`[iriResolver:metadataGraph] ${projectId}: HTTP ${res.status}`);
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as Record<string, any>;
    const result = extractFromJsonLD(json);

    if (result) {
      console.info(
        `[iriResolver:metadataGraph] ${projectId}: OK — ` +
        `name="${result.name}", loc=${result.location?.type ?? 'none'}, ` +
        `size=${result.project_size_ha ?? '?'}ha, ` +
        `activities=${result.project_activities?.length ?? 0}`
      );
    } else {
      console.info(`[iriResolver:metadataGraph] ${projectId}: response unparseable`);
    }

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.info(`[iriResolver:metadataGraph] ${projectId}: error — ${msg}`);
    return null;
  }
}

// ============================================================
// STRATEGY 2: REGISTRY GRAPHQL  (off-chain UI data)
// ============================================================

interface CsrfState {
  token: string;
  cookieStr: string;
  expires: number;
}
let csrfCache: CsrfState | null = null;

async function getRegistryCsrf(): Promise<{ token: string; cookieStr: string } | null> {
  if (csrfCache && Date.now() < csrfCache.expires) {
    return { token: csrfCache.token, cookieStr: csrfCache.cookieStr };
  }

  try {
    const res = await fetch(
      'https://api.registry.regen.network/marketplace/v1/csrfToken',
      { signal: AbortSignal.timeout(5_000) }
    );
    if (!res.ok) return null;

    const { token } = await res.json() as { token: string };

    // Extract Set-Cookie headers (Node.js 18+ supports getSetCookie())
    const setCookies: string[] = [];
    const hdrs = res.headers as Headers & { getSetCookie?: () => string[] };
    if (typeof hdrs.getSetCookie === 'function') {
      setCookies.push(...hdrs.getSetCookie());
    } else {
      const single = res.headers.get('set-cookie');
      if (single) setCookies.push(single);
    }
    // Extract just name=value pairs to send as Cookie header
    const cookieStr = setCookies.map(h => h.split(';')[0]).join('; ');

    csrfCache = { token, cookieStr, expires: Date.now() + 30 * 60 * 1000 };
    return { token, cookieStr };
  } catch {
    return null;
  }
}

/** Clears the cached CSRF token (called on ?refresh=1). */
export function clearRegistryCsrfCache(): void {
  csrfCache = null;
}

async function strategyRegistryGraphQL(projectId: string): Promise<IRIMetadata | null> {
  const csrf = await getRegistryCsrf();
  if (!csrf) {
    console.info(`[iriResolver:registryGQL] ${projectId}: no CSRF token`);
    return null;
  }

  const query = `{ projectByOnChainId(onChainId: ${JSON.stringify(projectId)}) { metadata } }`;

  try {
    const res = await fetch(
      'https://api.registry.regen.network/marketplace/v1/graphql',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf.token,
          'Cookie': csrf.cookieStr,
        },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(RESOLVER_TIMEOUT_MS),
      }
    );

    if (!res.ok) {
      // 403 means CSRF expired — clear cache so next call refreshes it
      if (res.status === 403) csrfCache = null;
      console.info(`[iriResolver:registryGQL] ${projectId}: HTTP ${res.status}`);
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = await res.json() as { data?: { projectByOnChainId?: { metadata?: any } } };
    const raw = body?.data?.projectByOnChainId?.metadata;
    if (!raw || typeof raw !== 'object') {
      console.info(`[iriResolver:registryGQL] ${projectId}: no metadata in response`);
      return null;
    }

    const result = extractFromJsonLD(raw as Record<string, unknown>);
    if (result) {
      console.info(
        `[iriResolver:registryGQL] ${projectId}: OK — ` +
        `story=${!!result.story}, gallery=${result.gallery_photos?.length ?? 0} photos, ` +
        `eci=${result.ecological_connectivity_index ?? '?'}`
      );
    }
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.info(`[iriResolver:registryGQL] ${projectId}: error — ${msg}`);
    return null;
  }
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Resolves a regen: IRI to structured metadata by querying both
 * the metadata-graph API (on-chain) and the registry GraphQL (off-chain)
 * in parallel, then merging the results.
 *
 * Never throws. Returns null if both sources return nothing.
 */
export async function resolveIRI(
  projectId: string,
  metadataIRI: string,
): Promise<IRIMetadata | null> {
  const [graphResult, registryResult] = await Promise.allSettled([
    strategyMetadataGraphAPI(projectId, metadataIRI),
    strategyRegistryGraphQL(projectId),
  ]);

  const fromGraph    = graphResult.status    === 'fulfilled' ? graphResult.value    : null;
  const fromRegistry = registryResult.status === 'fulfilled' ? registryResult.value : null;

  const merged = mergeMetadata(fromGraph, fromRegistry);

  if (!merged) {
    console.info(`[iriResolver] ${projectId}: both sources returned null`);
  }

  return merged;
}
