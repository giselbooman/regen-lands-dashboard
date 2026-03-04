/**
 * Enricher — single best-effort fetch of the Regen Registry project page.
 *
 * Tries to extract name / methodology / land_use / status by reading embedded
 * __NEXT_DATA__ or ld+json from the app.regen.network project page.
 *
 * NOTE: As of early 2026 the registry site uses Next.js App Router (RSC) and
 * no longer embeds __NEXT_DATA__ or ld+json in server-rendered HTML. In practice
 * every fetch results in `foundNextData=false, foundLdJson=false` and the enricher
 * returns null immediately. This stub is intentionally kept as a clean placeholder
 * for a future official Registry API integration.
 *
 * Never throws. Returns EnrichmentResult on every call.
 * Cache TTLs:
 *   Success → 24 h
 *   Failure → 10 min (retry sooner; transient errors)
 *
 * Server-side only — never imported by client components.
 */

export interface EnrichedMetadata {
  name?: string;
  methodology?: { id?: string; name?: string };
  land_use?: string;
  primary_impact?: string;   // e.g. "Carbon Sequestration", "Biodiversity"
  credits_issued?: number;   // first credits figure found in page text
  status?: string;           // e.g. "Issued", "Available", "Pipeline"
}

export interface EnrichmentAttempt {
  url: string;
  /** HTTP status code, or 'error' / 'timeout' for fetch failures */
  httpStatus: number | 'error' | 'timeout';
  /** Response body byte count (set on 200 responses) */
  bytes?: number;
  /** Content-Type header value (set on 200 responses) */
  contentType?: string;
  /** Whether the HTML contained id="__NEXT_DATA__" */
  foundNextData: boolean;
  /** Whether the HTML contained type="application/ld+json" */
  foundLdJson: boolean;
  /** Raw text of the page <title> (set on 200 responses) */
  title?: string;
  /** Name extracted at this URL (only set when extraction succeeded) */
  extractedName?: string;
}

export interface EnrichmentResult {
  metadata: EnrichedMetadata | null;
  attempts: EnrichmentAttempt[];
}

// ── Cache ─────────────────────────────────────────────────────────────────────

const SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  value: EnrichedMetadata | null;
  expires: number;
}

const cache = new Map<string, CacheEntry>();

function fromCache(key: string): EnrichedMetadata | null | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) { cache.delete(key); return undefined; }
  return entry.value;
}

function toCache(key: string, value: EnrichedMetadata | null): void {
  const ttl = value !== null ? SUCCESS_TTL_MS : FAILURE_TTL_MS;
  cache.set(key, { value, expires: Date.now() + ttl });
}

/** Evict all per-project enricher cache entries (e.g. on ?refresh=1). */
export function clearEnricherCache(): void {
  cache.clear();
  console.info('[enricher] In-memory cache cleared');
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Attempts to enrich a project by fetching its Regen Registry page.
 * Makes a **single** request per project.
 *
 * URL priority:
 *   - If `referenceId` looks like a human-readable slug (has hyphens + lowercase)
 *     → fetch `/project/<referenceId>` (title reflects the specific project)
 *   - Otherwise → fetch `/project/<projectId>` (on-chain ID URL also returns correct title)
 *
 * Extraction stages (first to yield a name wins):
 *   Stage 1: __NEXT_DATA__ JSON blob (rare on RSC pages)
 *   Stage 1: application/ld+json script tags (rare on RSC pages)
 *   Stage 2: HTML text patterns — <title>, "Primary Impact", "Methodology", credits figure
 *
 * @param projectId   On-chain project ID, e.g. "C01-001"
 * @param referenceId Optional slug, e.g. "jaguar-stewardship-in-the-pantanal-conservation-network"
 */
export async function enrichProject(
  projectId: string,
  referenceId?: string,
): Promise<EnrichmentResult> {
  const cached = fromCache(projectId);
  if (cached !== undefined) return { metadata: cached, attempts: [] };

  // Use slug URL when referenceId is a human-readable slug (hyphens + lowercase chars)
  const isSlugLike = (s: string): boolean =>
    s.length >= 6 && /[a-z]/.test(s) && s.includes('-');

  const urlPath = referenceId && isSlugLike(referenceId)
    ? referenceId
    : encodeURIComponent(projectId);
  const url = `https://app.regen.network/project/${urlPath}`;

  const attempt: EnrichmentAttempt = {
    url,
    httpStatus: 'error',
    foundNextData: false,
    foundLdJson: false,
  };

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'RegenLandsDashboard/1.0 (data enrichment)' },
      signal: AbortSignal.timeout(8000),
    });
    attempt.httpStatus = res.status;

    if (!res.ok) {
      console.info(`[enricher] ${projectId}: ${url} → HTTP ${res.status}`);
      toCache(projectId, null);
      return { metadata: null, attempts: [attempt] };
    }

    const html = await res.text();
    attempt.bytes         = html.length;
    attempt.foundNextData = html.includes('id="__NEXT_DATA__"');
    attempt.foundLdJson   = html.includes('type="application/ld+json"');

    // ── Diagnostic log (always emitted on 200 responses) ─────────────────
    const finalUrl    = res.url;
    const contentType = res.headers.get('content-type') ?? '';
    const titleMatch  = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const rawTitle    = titleMatch ? titleMatch[1].trim() : '';

    // Store on attempt so callers can surface diag without re-parsing
    attempt.contentType = contentType;
    attempt.title       = rawTitle;

    console.info(
      `[enricher:diag] ${projectId}\n` +
      `  url_requested : ${url}\n` +
      `  url_final     : ${finalUrl}\n` +
      `  http_status   : ${res.status}\n` +
      `  content_type  : ${contentType}\n` +
      `  body_bytes    : ${html.length}\n` +
      `  __NEXT_DATA__ : ${attempt.foundNextData}\n` +
      `  ld+json       : ${attempt.foundLdJson}\n` +
      `  <title>       : ${JSON.stringify(rawTitle)}\n` +
      `  html_head_500 : ${html.slice(0, 500).replace(/\n/g, ' ')}`
    );
    // ─────────────────────────────────────────────────────────────────────

    // Stage 1: structured JSON extraction (__NEXT_DATA__ / ld+json)
    if (attempt.foundNextData || attempt.foundLdJson) {
      const { metadata: stage1, path } = extractFromHtml(html, projectId);
      if (stage1?.name) {
        attempt.extractedName = stage1.name;
        console.info(`[enricher] ${projectId}: name="${stage1.name}" via ${path}`);
        toCache(projectId, stage1);
        return { metadata: stage1, attempts: [attempt] };
      }
    }

    // Stage 2: HTML text pattern extraction (<title>, Primary Impact, Methodology, credits)
    const stage2 = extractFromHtmlText(html, projectId);
    if (stage2) {
      attempt.extractedName = stage2.name;
      console.info(
        `[enricher] ${projectId}: html_title extraction — ` +
        `name="${stage2.name ?? '(none)'}", ` +
        `primary_impact="${stage2.primary_impact ?? '(none)'}", ` +
        `methodology="${stage2.methodology?.name ?? '(none)'}", ` +
        `credits_issued=${stage2.credits_issued ?? '(none)'}`
      );
      toCache(projectId, stage2);
      return { metadata: stage2, attempts: [attempt] };
    }

    console.info(`[enricher] ${projectId}: → cannot parse server-side HTML (RSC shell)`);
    toCache(projectId, null);
    return { metadata: null, attempts: [attempt] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    attempt.httpStatus = msg.toLowerCase().includes('timeout') ? 'timeout' : 'error';
    console.info(`[enricher] ${projectId}: ${attempt.httpStatus}: ${msg}`);
    toCache(projectId, null);
    return { metadata: null, attempts: [attempt] };
  }
}

// ── Stage 2: HTML text pattern extraction ────────────────────────────────────
// Runs on all responses (including RSC shells). Extracts:
//   a) name from <title>  b) primary_impact  c) methodology  d) credits_issued

function extractFromHtmlText(html: string, projectId: string): EnrichedMetadata | null {
  const result: EnrichedMetadata = {};

  // ── a) Name from <title> ──────────────────────────────────────────────────
  const GENERIC_TITLES = new Set([
    '', 'regen', 'regen network', 'regen marketplace', 'projects',
    'marketplace', 'project', 'error', '404',
  ]);
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle   = titleMatch ? titleMatch[1].trim() : '';
  const lcTitle    = rawTitle.toLowerCase();

  if (rawTitle.length >= 5 && !GENERIC_TITLES.has(lcTitle)) {
    result.name = rawTitle;
  } else {
    console.info(`[enricher] ${projectId}: <title> rejected ("${rawTitle}")`);
  }

  // ── b) Primary Impact ─────────────────────────────────────────────────────
  // Pattern: "Primary Impact" followed (within same tag or next element) by a text value
  const impactMatch = html.match(/Primary\s+Impact[^<]{0,50}<[^>]+>([^<]{3,120})/i);
  if (impactMatch) {
    const impact = impactMatch[1].replace(/\s+/g, ' ').trim();
    if (impact.length >= 3) result.primary_impact = impact;
  }

  // ── c) Methodology / Protocol / Credit Class ──────────────────────────────
  const methMatch = html.match(
    /(?:Methodology|Protocol|Credit\s+Class)[^<]{0,50}<[^>]+>([^<]{5,200})/i
  );
  if (methMatch) {
    const meth = methMatch[1].replace(/\s+/g, ' ').trim();
    if (meth.length >= 5 && !meth.toLowerCase().includes('undefined')) {
      result.methodology = { name: meth };
    }
  }

  // ── d) Credits Issued ─────────────────────────────────────────────────────
  const creditsMatch = html.match(/([\d,]{1,15})\s+credits/i);
  if (creditsMatch) {
    const n = parseInt(creditsMatch[1].replace(/,/g, ''), 10);
    if (!isNaN(n) && n > 0) result.credits_issued = n;
  }

  return Object.keys(result).length > 0 ? result : null;
}

// ── Stage 1: structured JSON extraction ──────────────────────────────────────
// Only reached when __NEXT_DATA__ or ld+json is detected in the response.

interface ExtractionResult {
  metadata: EnrichedMetadata | null;
  path: string;
}

function extractFromHtml(html: string, projectId: string): ExtractionResult {
  // Strategy 1: __NEXT_DATA__ JSON blob
  const nextDataMatch = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch?.[1]) {
    try {
      const nextData = JSON.parse(nextDataMatch[1]) as Record<string, unknown>;
      const metadata = extractFromNextData(nextData, projectId);
      if (metadata) return { metadata, path: '__NEXT_DATA__' };
    } catch {
      console.info(`[enricher] ${projectId}: __NEXT_DATA__ JSON parse failed`);
    }
  }

  // Strategy 2: application/ld+json (may appear multiple times)
  const ldJsonMatches = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of ldJsonMatches) {
    try {
      const ldJson = JSON.parse(match[1]) as Record<string, unknown>;
      const metadata = extractFromLdJson(ldJson, projectId);
      if (metadata) return { metadata, path: 'ld+json' };
    } catch { /* continue */ }
  }

  return { metadata: null, path: 'none' };
}

// ── __NEXT_DATA__ extraction ──────────────────────────────────────────────────

function extractFromNextData(
  data: Record<string, unknown>,
  projectId: string
): EnrichedMetadata | null {
  try {
    const pageProps =
      (data.props as Record<string, unknown>)?.pageProps as Record<string, unknown> | undefined;

    if (!pageProps) {
      console.info(`[enricher] ${projectId}: __NEXT_DATA__ — no pageProps`);
      return null;
    }

    const ppKeys = Object.keys(pageProps).slice(0, 20).join(', ');
    console.info(`[enricher] ${projectId}: __NEXT_DATA__ pageProps keys=[${ppKeys}]`);

    // Try known direct project-object paths
    const directPaths: Array<[string, unknown]> = [
      ['pageProps.project',        pageProps.project],
      ['pageProps.projectData',    pageProps.projectData],
      ['pageProps.data',           pageProps.data],
      ['pageProps.projectInfo',    pageProps.projectInfo],
      ['pageProps.projectDetails', pageProps.projectDetails],
    ];
    for (const [path, candidate] of directPaths) {
      if (candidate && typeof candidate === 'object') {
        const extracted = extractFromProjectObject(candidate as Record<string, unknown>, projectId, path);
        if (extracted?.name) return extracted;
      }
    }

    // Try React Query dehydrated state
    const dehydrated = (pageProps.dehydratedState as Record<string, unknown> | undefined)?.queries;
    if (Array.isArray(dehydrated)) {
      for (const q of dehydrated) {
        const qState = ((q as Record<string, unknown>)?.state) as Record<string, unknown> | undefined;
        const qData  = qState?.data as Record<string, unknown> | undefined;
        if (qData && typeof qData === 'object') {
          const extracted = extractFromProjectObject(qData, projectId, 'dehydratedState.query');
          if (extracted?.name) return extracted;
          const nested = (qData.project ?? qData.projectData ?? qData.data) as Record<string, unknown> | undefined;
          if (nested && typeof nested === 'object') {
            const ex = extractFromProjectObject(nested, projectId, 'dehydratedState.query.project');
            if (ex?.name) return ex;
          }
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

function extractFromProjectObject(
  obj: Record<string, unknown>,
  projectId: string,
  path: string
): EnrichedMetadata | null {
  const result: EnrichedMetadata = {};

  const name = (
    obj.name ?? obj.projectName ?? obj.title ?? obj.displayName ??
    obj['schema:name'] ?? obj['regen:name']
  ) as string | undefined;

  if (typeof name === 'string' && name.trim()) {
    result.name = name.trim();
  } else {
    const keys = Object.keys(obj).slice(0, 30).join(', ');
    console.info(`[enricher] ${projectId}: ${path} — name missing, available keys=[${keys}]`);
  }

  const status = (obj.projectStatus ?? obj.status ?? obj.creditClass) as string | undefined;
  if (typeof status === 'string') result.status = friendlyStatus(status);

  const landUse = (
    obj.landUseType ?? obj.landUse ?? obj.activity ??
    obj['regen:landUse'] ?? obj['regen:primaryEcosystem']
  ) as string | undefined;
  if (typeof landUse === 'string') {
    result.land_use = landUse;
  } else if (Array.isArray(obj.activities) && typeof (obj.activities as string[])[0] === 'string') {
    result.land_use = (obj.activities as string[]).join(', ');
  }

  const meth = obj.methodology ?? obj.methodologyInfo ?? obj['regen:methodologyInfo'];
  if (typeof meth === 'string') {
    result.methodology = { name: meth };
  } else if (meth && typeof meth === 'object') {
    const m = meth as Record<string, unknown>;
    result.methodology = {
      id:   typeof (m.id ?? m['@id']) === 'string'           ? String(m.id ?? m['@id'])          : undefined,
      name: typeof (m.name ?? m['schema:name']) === 'string' ? String(m.name ?? m['schema:name']) : undefined,
    };
  }

  return Object.keys(result).length > 0 ? result : null;
}

// ── ld+json extraction ────────────────────────────────────────────────────────

function extractFromLdJson(data: Record<string, unknown>, projectId: string): EnrichedMetadata | null {
  try {
    const result: EnrichedMetadata = {};

    const name = (
      data['schema:name'] ?? data.name ?? data['regen:name'] ?? data['rdfs:label']
    ) as string | undefined;
    if (typeof name === 'string' && name.trim()) {
      result.name = name.trim();
    } else {
      const ldKeys = Object.keys(data).slice(0, 20).join(', ');
      console.info(`[enricher] ${projectId}: ld+json — name missing, keys=[${ldKeys}]`);
    }

    const meth = (data['regen:methodologyInfo'] ?? data['regen:methodology']) as Record<string, unknown> | string | undefined;
    if (typeof meth === 'string') {
      result.methodology = { name: meth };
    } else if (meth && typeof meth === 'object') {
      result.methodology = {
        name: typeof meth['schema:name'] === 'string' ? meth['schema:name'] : undefined,
      };
    }

    const landUse = (
      data['regen:landUse'] ?? data['regen:environmentType'] ?? data['regen:primaryEcosystem']
    ) as string | undefined;
    if (typeof landUse === 'string') result.land_use = landUse;

    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function friendlyStatus(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes('issued'))    return 'Issued';
  if (s.includes('available')) return 'Available';
  if (s.includes('sold') || s.includes('retired')) return 'Sold / Retired';
  if (s.includes('pipeline') || s.includes('registered')) return 'Pipeline';
  return 'Unknown';
}
