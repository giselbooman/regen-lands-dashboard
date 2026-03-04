/**
 * GET /api/marketplace/projects
 *
 * Returns normalized Regen Network marketplace projects with location data.
 *
 * Query params:
 *   ?class_id=C01   (optional) — filter by credit class id prefix or exact match
 *
 * Response: MarketplaceProjectsResponse (see lib/marketplace/types.ts)
 *
 * Behaviour:
 *   - Serves from in-memory TTL cache when fresh (default 5 min).
 *   - On cache miss: fetches all projects + class names in parallel,
 *     then resolves locations (IRI resolver → jurisdiction centroid fallback).
 *   - No authentication required.
 *
 * Cache key: "all" for the full dataset.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchAllProjects, fetchClassNames } from '@/lib/marketplace/regenClient';
import { normalizeAll } from '@/lib/marketplace/normalizer';
import { cacheGet, cacheSet, cacheClear, DEFAULT_TTL_MS } from '@/lib/marketplace/cache';
import { clearEnricherCache } from '@/lib/marketplace/enricher';
import { clearRegistryCsrfCache } from '@/lib/marketplace/iriResolver';
import type { MarketplaceProject, MarketplaceProjectsResponse } from '@/lib/marketplace/types';

const CACHE_KEY = 'marketplace_projects_all';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const classFilter = searchParams.get('class_id')?.trim() ?? null;
  const refresh     = searchParams.get('refresh') === '1';
  const debug       = searchParams.get('debug')   === '1';

  // --- ?refresh=1: evict both caches before fetching ---
  if (refresh) {
    cacheClear(CACHE_KEY);
    clearEnricherCache();
    clearRegistryCsrfCache();
    console.info('[route/projects] ?refresh=1 — route + enricher + CSRF caches cleared');
  }

  // --- Cache check (always skip on debug to avoid serving stale partial results) ---
  const cached = (!refresh && !debug) ? cacheGet<MarketplaceProject[]>(CACHE_KEY) : null;
  let projects: MarketplaceProject[];
  let cachedAt: string;

  if (cached) {
    projects = cached.data;
    cachedAt = new Date(cached.cachedAt).toISOString();
    console.info(`[route/projects] Cache HIT — serving ${projects.length} projects (cached_at=${cachedAt})`);
  } else {
    // --- Fetch + normalize ---
    try {
      console.info(
        `[route/projects] Cache MISS — fetching from chain… (refresh=${refresh}, debug=${debug})`
      );

      const [rawProjects, classNames] = await Promise.all([
        fetchAllProjects(),
        fetchClassNames(),
      ]);

      // ── DIAGNOSTIC LOG 1: raw count from chain ───────────────────────────
      const rawByClass: Record<string, number> = {};
      for (const p of rawProjects) {
        rawByClass[p.class_id] = (rawByClass[p.class_id] ?? 0) + 1;
      }
      console.info(
        `[route/projects] STEP 1 — raw from chain: ${rawProjects.length} projects. ` +
        `Classes seen: [${Object.keys(rawByClass).sort().join(', ')}]. ` +
        `Per-class: {${Object.entries(rawByClass).sort(([a],[b])=>a.localeCompare(b)).map(([c,n])=>`${c}:${n}`).join(', ')}}`
      );
      // ─────────────────────────────────────────────────────────────────────

      // debug mode: limit enrichment to first 5 to keep the request fast
      const normalizeOpts = debug ? { enrichLimit: 5 } : undefined;
      projects = await normalizeAll(rawProjects, classNames, normalizeOpts);

      // ── DIAGNOSTIC LOG 2: after normalization ────────────────────────────
      const dropped = rawProjects.length - projects.length;
      const bySource: Record<string, number> = {
        iri: 0, html_title: 0, enriched: 0, registry: 0, none: 0,
      };
      const byPrecision: Record<string, number> = {
        project: 0, subdivision: 0, country: 0, unknown: 0,
      };
      for (const p of projects) {
        bySource[p.metadata_source] = (bySource[p.metadata_source] ?? 0) + 1;
        byPrecision[p.location.precision] = (byPrecision[p.location.precision] ?? 0) + 1;
      }
      console.info(
        `[route/projects] STEP 2 — after normalizeAll: ${projects.length} projects ` +
        `(${dropped > 0 ? `⚠ ${dropped} silently dropped by Promise.allSettled` : 'none dropped'}). ` +
        `metadata_source: {iri:${bySource.iri}, html_title:${bySource.html_title}, enriched:${bySource.enriched}, none:${bySource.none}}. ` +
        `location precision: {project:${byPrecision.project}, subdivision:${byPrecision.subdivision}, country:${byPrecision.country}, unknown:${byPrecision.unknown}}`
      );
      // ─────────────────────────────────────────────────────────────────────

      // Do NOT cache debug results (only first 5 were enriched; would poison the cache)
      if (!debug) {
        cacheSet(CACHE_KEY, projects, DEFAULT_TTL_MS);
      }
      cachedAt = new Date().toISOString();
    } catch (err) {
      console.error('[/api/marketplace/projects] Fetch error:', err);
      return NextResponse.json(
        {
          error: 'Failed to fetch marketplace projects',
          message: err instanceof Error ? err.message : 'Unknown error',
        },
        { status: 502 }
      );
    }
  }

  // --- Optional filter ---
  const filtered = classFilter
    ? projects.filter((p) => {
        const c = (p.credit_class_id ?? '').toUpperCase();
        const f = classFilter.toUpperCase();
        return c === f || c.startsWith(f);
      })
    : projects;

  // ── DIAGNOSTIC LOG 3: after optional class filter ──────────────────────
  if (classFilter) {
    console.info(
      `[route/projects] STEP 3 — after class_id filter "${classFilter}": ${filtered.length} projects ` +
      `(removed ${projects.length - filtered.length})`
    );
  } else {
    console.info(`[route/projects] STEP 3 — no class_id filter; serving all ${filtered.length} projects`);
  }
  // ─────────────────────────────────────────────────────────────────────

  // --- Strip enrich_diag unless ?debug=1 (keep payload small for normal requests) ---
  const responseProjects: MarketplaceProject[] = debug
    ? filtered
    : filtered.map(({ enrich_diag: _dropped, ...rest }) => rest as MarketplaceProject);

  // --- Build response metadata ---
  const withLocation    = filtered.filter((p) => p.location.type !== 'unknown').length;
  const withoutLocation = filtered.filter((p) => p.location.type === 'unknown').length;

  const response: MarketplaceProjectsResponse = {
    projects: responseProjects,
    metadata: {
      total: filtered.length,
      with_location: withLocation,
      without_location: withoutLocation,
      cached_at: cachedAt,
      cache_ttl_ms: DEFAULT_TTL_MS,
    },
  };

  return NextResponse.json(response, { status: 200 });
}

// Reject other methods
export async function POST(): Promise<NextResponse> {
  return NextResponse.json({ error: 'Method not allowed. Use GET.' }, { status: 405 });
}
