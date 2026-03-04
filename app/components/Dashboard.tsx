'use client';

/**
 * Regen Lands — SCORING_V1 Dashboard
 *
 * Client component.  Sends a test AOI to POST /api/gis/analyze and renders:
 *   - Ranked practice cards with suitability, carbon, risk, co-benefits
 *   - Expandable per-practice Explain section
 *   - Blocked practices summary
 *   - Investor match scores
 */

import { useState } from 'react';
import type {
  AnalyzeResponse,
  PracticeScoreResult,
  InvestorMatchResult,
  SuitabilityQualitative,
} from '@/lib/scoring/types';

// ============================================================
// TEST AOI — deterministic stub polygon (LATAM region)
// ============================================================

const TEST_AOI = {
  type:     'polygon' as const,
  geometry: {
    type: 'Polygon' as const,
    coordinates: [[
      [-75.5, 4.5],
      [-75.0, 4.5],
      [-75.0, 5.0],
      [-75.5, 5.0],
      [-75.5, 4.5],
    ]],
  },
  area_ha: 100,
  region:  'LATAM',
};

// ============================================================
// DISPLAY HELPERS
// ============================================================

const PRACTICE_LABELS: Record<string, string> = {
  pasture_grazing: 'Pasture Grazing',
  cover_crops:     'Cover Crops',
  agroforestry:    'Agroforestry',
  no_till:         'No-Till',
  biochar:         'Biochar',
  reforestation:   'Reforestation',
  food_forests:    'Food Forests',
};

const QUAL_STYLES: Record<SuitabilityQualitative, string> = {
  High:   'bg-emerald-100 text-emerald-800 border-emerald-200',
  Medium: 'bg-amber-100  text-amber-800  border-amber-200',
  Low:    'bg-rose-100   text-rose-800   border-rose-200',
};

const QUAL_BAR_COLOR: Record<SuitabilityQualitative, string> = {
  High:   'bg-emerald-500',
  Medium: 'bg-amber-400',
  Low:    'bg-rose-400',
};

const KOI_STYLES: Record<string, string> = {
  eligible:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  ineligible: 'bg-rose-50    text-rose-700    border-rose-200',
  unknown:    'bg-slate-100  text-slate-600   border-slate-200',
};

function fmt(n: number, d = 2) {
  return n.toFixed(d);
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function ScoreBar({
  value,
  color = 'bg-sky-500',
  label,
}: {
  value: number; // 0–1
  color?: string;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs text-slate-500 w-24 shrink-0">{label}</span>}
      <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${Math.min(100, value * 100).toFixed(1)}%` }}
        />
      </div>
      <span className="text-xs text-slate-500 w-8 text-right tabular-nums">
        {fmt(value)}
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
      {children}
    </h3>
  );
}

function ExplainPanel({ result }: { result: PracticeScoreResult }) {
  const { explain, suitability, co_benefits, koi, confidence_0_1 } = result;

  const subScores: [string, number][] = [
    ['Climate',    suitability.explain.climate_score],
    ['Soil',       suitability.explain.soil_score],
    ['Terrain',    suitability.explain.terrain_score],
    ['Land',       suitability.explain.land_score],
    ['Constraint', suitability.explain.constraint_score],
  ];

  const rawInputs: [string, string][] = [
    ['Precip (mm/yr)',       fmt(explain.raw_aoi_inputs.precip_mm_yr, 0)],
    ['Temp (°C mean)',       fmt(explain.raw_aoi_inputs.temp_c_mean, 1)],
    ['Slope p90 (°)',        fmt(explain.raw_aoi_inputs.slope_deg_p90, 1)],
    ['SOC 0–30 cm (t/ha)',  fmt(explain.raw_aoi_inputs.soc_t_ha_0_30, 1)],
    ['Texture',              explain.raw_aoi_inputs.texture_class],
    ['pH',                   fmt(explain.raw_aoi_inputs.ph, 1)],
    ['Landcover',            explain.raw_aoi_inputs.landcover_class],
    ['Urban fraction',       fmt(explain.raw_aoi_inputs.urban_fraction, 3)],
    ['Protected area',       fmt(explain.raw_aoi_inputs.protected_area_overlap, 3)],
    ['Native forest frac.',  fmt(explain.raw_aoi_inputs.native_forest_fraction, 3)],
    ['Drought index',        fmt(explain.raw_aoi_inputs.drought_index, 3)],
    ['Fire risk index',      fmt(explain.raw_aoi_inputs.fire_risk_index, 3)],
  ];

  return (
    <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">

      {/* Sub-scores */}
      <div>
        <SectionTitle>Score breakdown</SectionTitle>
        <div className="space-y-1.5">
          {subScores.map(([label, val]) => (
            <ScoreBar key={label} value={val} label={label} color="bg-sky-400" />
          ))}
        </div>
        <div className="mt-2 text-[11px] text-slate-400 space-x-1">
          <span className="font-medium text-slate-500">Rules applied:</span>
          {suitability.explain.lookup_rules_applied.map((id) => (
            <code
              key={id}
              className="bg-slate-100 rounded px-1 py-0.5 text-[10px] text-slate-600"
            >
              {id}
            </code>
          ))}
        </div>
        <div className="mt-3 text-[11px] text-slate-500 space-y-0.5">
          <div>norm_precip: <span className="font-mono">{suitability.explain.norm_precip}</span></div>
          <div>norm_temp: <span className="font-mono">{suitability.explain.norm_temp}</span></div>
          <div>ph_deviation: <span className="font-mono">{suitability.explain.ph_deviation}</span> → inv_norm: <span className="font-mono">{suitability.explain.inv_norm_ph_deviation}</span></div>
        </div>
      </div>

      {/* Raw AOI inputs */}
      <div>
        <SectionTitle>Raw AOI inputs</SectionTitle>
        <table className="w-full text-[11px] text-slate-600">
          <tbody>
            {rawInputs.map(([k, v]) => (
              <tr key={k} className="border-b border-slate-50">
                <td className="py-0.5 pr-2 text-slate-400">{k}</td>
                <td className="py-0.5 font-mono text-right">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Hard stops */}
      <div>
        <SectionTitle>Hard stops evaluated</SectionTitle>
        {explain.hard_stops.reasons.length === 0 && explain.hard_stops.warnings.length === 0 ? (
          <p className="text-[11px] text-emerald-600">✓ No hard stops triggered</p>
        ) : (
          <ul className="space-y-1">
            {explain.hard_stops.reasons.map((r) => (
              <li key={r} className="text-[11px] text-rose-600">✕ {r}</li>
            ))}
            {explain.hard_stops.warnings.map((w) => (
              <li key={w} className="text-[11px] text-amber-600">⚠ {w}</li>
            ))}
          </ul>
        )}

        {/* Reversal risk breakdown */}
        <div className="mt-3">
          <SectionTitle>Reversal risk breakdown</SectionTitle>
          <div className="text-[11px] text-slate-500 space-y-0.5 font-mono">
            <div>base                = {explain.reversal_risk_breakdown.base}</div>
            <div>+ 0.3 × drought     = {explain.reversal_risk_breakdown.drought_component}</div>
            <div>+ 0.3 × fire        = {explain.reversal_risk_breakdown.fire_component}</div>
            <div>+ 0.1 × norm(slope) = {explain.reversal_risk_breakdown.slope_component}</div>
          </div>
        </div>
      </div>

      {/* KOI + Confidence */}
      <div>
        <SectionTitle>KOI eligibility</SectionTitle>
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-[11px] border rounded-full px-2 py-0.5 font-medium ${KOI_STYLES[koi.eligibility.status]}`}>
            {koi.eligibility.status}
          </span>
        </div>
        {koi.eligibility.reasons.length > 0 && (
          <ul className="text-[11px] text-slate-500 mb-2 list-disc list-inside">
            {koi.eligibility.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
        )}
        <div className="space-y-1">
          {koi.methodology_match.slice(0, 3).map((m) => (
            <div key={m.methodology_id} className="flex justify-between text-[11px] text-slate-500">
              <span>{m.methodology_id} — {m.name}</span>
              <span className="font-mono tabular-nums">{fmt(m.match_score_0_1)}</span>
            </div>
          ))}
        </div>

        <div className="mt-3">
          <SectionTitle>Confidence: {fmt(confidence_0_1)}</SectionTitle>
          {explain.confidence_penalties.length === 0 ? (
            <p className="text-[11px] text-emerald-600">✓ No penalties applied</p>
          ) : (
            <ul className="space-y-0.5">
              {explain.confidence_penalties.map((p, i) => (
                <li key={i} className="text-[11px] text-amber-700">
                  −{p.penalty} — {p.reason}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Co-benefits */}
        <div className="mt-3">
          <SectionTitle>Co-benefits</SectionTitle>
          <div className="space-y-1">
            <ScoreBar value={co_benefits.biodiversity_0_1} label="Biodiversity" color="bg-violet-400" />
            <ScoreBar value={co_benefits.water_0_1}        label="Water"        color="bg-sky-400" />
            <ScoreBar value={co_benefits.soil_health_0_1}  label="Soil health"  color="bg-amber-500" />
          </div>
        </div>
      </div>
    </div>
  );
}

function PracticeCard({ result, rank }: { result: PracticeScoreResult; rank: number | null }) {
  const [open, setOpen] = useState(false);
  const { suitability, carbon, reversal_risk_0_1, co_benefits, blocked } = result;
  const label = PRACTICE_LABELS[result.practice_id] ?? result.practice_id;

  if (blocked) {
    return (
      <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 opacity-70">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-400">{label}</span>
            <span className="text-[10px] bg-rose-100 text-rose-700 border border-rose-200 rounded-full px-2 py-0.5 font-semibold uppercase">
              Blocked
            </span>
          </div>
        </div>
        <ul className="mt-2 space-y-0.5">
          {result.block_reasons.map((r) => (
            <li key={r} className="text-[11px] text-rose-600">✕ {r}</li>
          ))}
          {result.warnings.map((w) => (
            <li key={w} className="text-[11px] text-amber-600">⚠ {w}</li>
          ))}
        </ul>
      </div>
    );
  }

  const qualStyle    = QUAL_STYLES[suitability.qualitative];
  const barColor     = QUAL_BAR_COLOR[suitability.qualitative];

  return (
    <div className="border border-slate-200 rounded-xl p-5 bg-white shadow-sm hover:shadow-md transition-shadow">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          {rank !== null && (
            <span className="text-2xl font-black text-slate-200 tabular-nums w-6 shrink-0">
              {rank}
            </span>
          )}
          <div>
            <div className="text-base font-bold text-slate-800">{label}</div>
            <code className="text-[10px] text-slate-400">{result.practice_id}</code>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[11px] border rounded-full px-2 py-0.5 font-semibold ${KOI_STYLES[result.koi.eligibility.status]}`}>
            KOI: {result.koi.eligibility.status}
          </span>
        </div>
      </div>

      {/* Suitability score */}
      <div className="flex items-center gap-3 mb-3">
        <div className="text-4xl font-black tabular-nums text-slate-800">
          {suitability.score_0_100.toFixed(1)}
        </div>
        <div>
          <span className={`text-xs border rounded-full px-2.5 py-1 font-semibold ${qualStyle}`}>
            {suitability.qualitative}
          </span>
          <div className="mt-1.5 w-32">
            <div className="bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full ${barColor}`}
                style={{ width: `${suitability.score_0_100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Carbon */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-4 text-sm text-slate-600 border-t border-slate-50 pt-3">
        <div>
          <span className="text-[10px] text-slate-400 uppercase tracking-wide block">Carbon expected</span>
          <span className="font-bold text-slate-800 tabular-nums">
            {fmt(carbon.rate_expected_tco2e_ha_yr, 2)}
            <span className="font-normal text-slate-400 text-xs"> tCO₂e/ha/yr</span>
          </span>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 uppercase tracking-wide block">Range</span>
          <span className="text-slate-600 tabular-nums text-xs">
            {fmt(carbon.rate_min_tco2e_ha_yr, 2)} – {fmt(carbon.rate_max_tco2e_ha_yr, 2)}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 uppercase tracking-wide block">Gap to optimal</span>
          <span className="text-slate-600 tabular-nums text-xs">
            {fmt(carbon.gap_to_optimal_tco2e_ha_yr, 2)} tCO₂e/ha/yr
          </span>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 uppercase tracking-wide block">Confidence</span>
          <span className="text-slate-600 tabular-nums text-xs">{fmt(result.confidence_0_1)}</span>
        </div>
      </div>

      {/* Reversal risk + co-benefits mini-bars */}
      <div className="space-y-1.5 mb-4">
        <ScoreBar value={reversal_risk_0_1}            label="Reversal risk"  color="bg-rose-400" />
        <ScoreBar value={co_benefits.biodiversity_0_1} label="Biodiversity"   color="bg-violet-400" />
        <ScoreBar value={co_benefits.water_0_1}        label="Water"          color="bg-sky-400" />
        <ScoreBar value={co_benefits.soil_health_0_1}  label="Soil health"    color="bg-amber-500" />
      </div>

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <ul className="mb-3 space-y-0.5">
          {result.warnings.map((w) => (
            <li key={w} className="text-[11px] text-amber-700">⚠ {w}</li>
          ))}
        </ul>
      )}

      {/* Explain toggle */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-sky-600 hover:text-sky-800 font-medium flex items-center gap-1 transition-colors"
      >
        <span>{open ? '▾' : '▸'}</span>
        {open ? 'Hide' : 'Show'} Explain
      </button>

      {open && <ExplainPanel result={result} />}
    </div>
  );
}

function InvestorCard({ match }: { match: InvestorMatchResult }) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-slate-800">{match.investor_name}</span>
        <span className="text-xl font-black tabular-nums text-slate-700">
          {fmt(match.match_score_0_100, 1)}
        </span>
      </div>
      <div className="bg-slate-100 rounded-full h-2 mb-3 overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500"
          style={{ width: `${match.match_score_0_100}%` }}
        />
      </div>
      <div className="grid grid-cols-5 gap-1 text-center">
        {(
          [
            ['Practice', match.explain.practice_fit],
            ['Region',   match.explain.region_fit],
            ['Risk',     match.explain.risk_fit],
            ['Impact',   match.explain.impact_fit],
            ['Stage',    match.explain.stage_fit],
          ] as [string, number][]
        ).map(([label, val]) => (
          <div key={label}>
            <div className="text-[10px] text-slate-400">{label}</div>
            <div className="text-xs font-semibold tabular-nums text-slate-600">{fmt(val)}</div>
          </div>
        ))}
      </div>
      <p className="text-[9px] text-slate-300 mt-2 text-right">V1 heuristic</p>
    </div>
  );
}

// ============================================================
// MAIN DASHBOARD
// ============================================================

export default function Dashboard() {
  const [data,    setData]    = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function analyze() {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch('/api/gis/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ mode: 'explore', aoi: TEST_AOI }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      const json: AnalyzeResponse = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  // Build a rank map for quick lookup
  const rankMap = new Map<string, number>(
    data?.ranked_practices.map((r) => [r.practice_id, r.rank]) ?? []
  );

  const nonBlocked = data?.results.filter((r) => !r.blocked) ?? [];
  const blocked    = data?.results.filter((r) => r.blocked)  ?? [];

  // Sort non-blocked by rank
  const sortedNonBlocked = [...nonBlocked].sort(
    (a, b) => (rankMap.get(a.practice_id) ?? 99) - (rankMap.get(b.practice_id) ?? 99)
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">🌱 Regen Lands</h1>
            <p className="text-xs text-slate-400">SCORING_V1 Explorer · MVP</p>
          </div>
          {data && (
            <p className="text-[11px] text-slate-400 text-right">
              Computed at {new Date(data.metadata.computed_at).toLocaleTimeString()}
              <br />
              AOI: {data.metadata.aoi_area_ha} ha · mode: {data.metadata.mode}
            </p>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* AOI info + trigger */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Test AOI</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-5">
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wide block">Region</span>
              <span className="font-medium text-slate-700">LATAM</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wide block">Area</span>
              <span className="font-medium text-slate-700">100 ha</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wide block">Mode</span>
              <span className="font-medium text-slate-700">explore (all 7 practices)</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wide block">Provider</span>
              <span className="font-medium text-slate-700">StubProvider</span>
            </div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-[11px] font-mono text-slate-500 mb-5 overflow-x-auto">
            {`{ "type":"Polygon", "coordinates":[[[-75.5,4.5],[-75.0,4.5],[-75.0,5.0],[-75.5,5.0],[-75.5,4.5]]] }`}
          </div>
          <button
            onClick={analyze}
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold
                       px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                Scoring…
              </>
            ) : 'Analyze AOI →'}
          </button>
        </section>

        {/* Error */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Results */}
        {data && (
          <>
            {/* Ranked practices */}
            <section>
              <h2 className="text-base font-bold text-slate-800 mb-4">
                Ranked Practices
                <span className="ml-2 text-xs font-normal text-slate-400">
                  {sortedNonBlocked.length} eligible · {blocked.length} blocked
                </span>
              </h2>
              <div className="space-y-4">
                {sortedNonBlocked.map((result) => (
                  <PracticeCard
                    key={result.practice_id}
                    result={result}
                    rank={rankMap.get(result.practice_id) ?? null}
                  />
                ))}
              </div>
            </section>

            {/* Blocked practices */}
            {blocked.length > 0 && (
              <section>
                <h2 className="text-base font-bold text-slate-800 mb-4">
                  Blocked Practices
                </h2>
                <div className="space-y-3">
                  {blocked.map((result) => (
                    <PracticeCard key={result.practice_id} result={result} rank={null} />
                  ))}
                </div>
              </section>
            )}

            {/* Investor matches */}
            <section>
              <h2 className="text-base font-bold text-slate-800 mb-1">
                Investor Matches
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                V1 heuristic — scored against 4 sample investor profiles
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {data.investor_matches.map((m) => (
                  <InvestorCard key={m.investor_id} match={m} />
                ))}
              </div>
            </section>

            {/* Scoring metadata footer */}
            <footer className="text-center text-[11px] text-slate-300 pb-4">
              scoring_version: {data.metadata.scoring_version} ·
              computed_at: {data.metadata.computed_at}
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
