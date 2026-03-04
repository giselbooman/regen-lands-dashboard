/**
 * Regen Network ecocredit REST client.
 *
 * Fetches all projects by paginating until `pagination.next_key` is exhausted.
 * Also attempts to resolve credit class names, but treats that as best-effort:
 * if the /classes endpoint fails the raw class_id is used as the display name.
 *
 * No import of any marketplace-internal types here — raw shapes only.
 */

import type { RawRegenProject, RawRegenClass } from './types';

const BASE_URL = 'https://regen-api.polkachu.com';
const PAGE_TIMEOUT_MS = 8_000;
const MAX_RETRIES = 2;

// ============================================================
// FETCH HELPER (timeout + retry)
// ============================================================

async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

// ============================================================
// CREDIT CLASS NAME MAP  (best-effort)
// ============================================================

/**
 * Human-readable names for all known Regen Ledger credit classes.
 * Resolved from metadata-graph API (https://api.regen.network/data/v2/metadata-graph/{iri}).
 * The /classes list endpoint returns truncated IRIs (no .rdf suffix), so we use a
 * hardcoded lookup for known classes rather than resolving dynamically.
 */
const KNOWN_CLASS_NAMES: Record<string, string> = {
  BT01:  'Terrasos Biodiversity Unit',
  C01:   'Verified Carbon Standard',
  C02:   'Urban Forest Carbon Credit Class',
  C03:   'TCO2: Toucan Carbon Tokens Credit Class',
  C04:   'Ruuts Credit Class for Soil Carbon Sequestration through Regenerative Grazing',
  C05:   'Credit Class for Carbon Removal through Biochar Production',
  C06:   'GHG Benefits in Managed Crop and Grassland Systems Credit Class',
  C07:   'CarbonPlus Grasslands Credit Class',
  C08:   'Nature-Based Watershed & Green Infrastructure Solutions to Avoid Gray Infrastructure Emissions',
  C09:   'GHG & Co-Benefits in Watershed Carbon',
  KSH01: 'Credit Class for Sheep Grazing in Vineyard Systems',
  MBS01: 'SeaTrees Crediting Protocol for Marine Restoration',
  USS01:  'Biodiversity Credit Protocol for Umbrella Species Stewardship',
};

/**
 * Returns a map of class_id → human-readable display name.
 * Uses hardcoded names for known classes. Falls back to the raw class_id for
 * any unknown future classes. On fetch failure returns an empty map.
 */
export async function fetchClassNames(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const res = await fetchWithRetry(`${BASE_URL}/regen/ecocredit/v1/classes`);
    if (!res.ok) {
      console.warn(`[regenClient] /classes → HTTP ${res.status} (non-blocking)`);
      // Still populate known classes so the response isn't completely empty
      for (const [id, name] of Object.entries(KNOWN_CLASS_NAMES)) {
        map.set(id, name);
      }
      return map;
    }
    const json = await res.json() as { classes?: RawRegenClass[] };
    for (const cls of json.classes ?? []) {
      map.set(cls.id, KNOWN_CLASS_NAMES[cls.id] ?? cls.id);
    }
    const ids = [...map.keys()].sort().join(', ');
    const named = [...map.entries()].filter(([k, v]) => k !== v).length;
    console.info(
      `[regenClient] fetchClassNames: ${map.size} classes → [${ids}] ` +
      `(${named} with human names, ${map.size - named} using raw id)`
    );
  } catch (err) {
    console.warn('[regenClient] /classes fetch failed (non-blocking):', err);
    // Populate known classes as fallback
    for (const [id, name] of Object.entries(KNOWN_CLASS_NAMES)) {
      map.set(id, name);
    }
  }
  return map;
}

// ============================================================
// PROJECT PAGINATION
// ============================================================

interface ProjectsPage {
  projects: RawRegenProject[];
  pagination: { next_key?: string | null };
}

/**
 * Fetches all projects, paginating via `pagination.next_key`.
 * Stops when next_key is null, undefined, or empty string.
 */
export async function fetchAllProjects(): Promise<RawRegenProject[]> {
  const all: RawRegenProject[] = [];
  let nextKey: string | null = null;
  let pageNum = 0;

  do {
    pageNum++;
    const url = nextKey
      ? `${BASE_URL}/regen/ecocredit/v1/projects?pagination.key=${encodeURIComponent(nextKey)}&pagination.limit=100`
      : `${BASE_URL}/regen/ecocredit/v1/projects?pagination.limit=100`;

    console.info(`[regenClient] fetchAllProjects: page ${pageNum} → ${url}`);

    const res = await fetchWithRetry(url);
    if (!res.ok) {
      throw new Error(`[regenClient] /projects returned ${res.status}: ${await res.text()}`);
    }

    const page = await res.json() as ProjectsPage;
    const pageCount = (page.projects ?? []).length;
    all.push(...(page.projects ?? []));
    nextKey = page.pagination?.next_key ?? null;

    console.info(
      `[regenClient] fetchAllProjects: page ${pageNum} → ${pageCount} projects ` +
      `(running total: ${all.length}), next_key=${nextKey ? `"${nextKey.slice(0, 20)}…"` : 'null (done)'}`
    );

    // Cosmos SDK encodes empty string as null / '' — treat both as done
    if (!nextKey) break;
  } while (true);

  // Per-class breakdown
  const byClass: Record<string, number> = {};
  for (const p of all) {
    byClass[p.class_id] = (byClass[p.class_id] ?? 0) + 1;
  }
  const classBreakdown = Object.entries(byClass)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cls, n]) => `${cls}:${n}`)
    .join(', ');

  console.info(
    `[regenClient] fetchAllProjects: DONE — ${all.length} total projects across ${pageNum} page(s). ` +
    `By class: {${classBreakdown}}`
  );

  return all;
}
