'use client';

/**
 * ScoreWidget — "Compute score" CTA + result panel (Mode A: Marketplace tab).
 *
 * Behaviour:
 *   - location.type = "polygon" → POST /api/gis/analyze with project polygon
 *   - location.type = "point"   → POST /api/gis/analyze with a 5 km buffer square
 *                                  marks result with approx_aoi = true
 *   - location.type = "unknown" → button disabled ("Management not classified")
 *   - activity not supported    → button disabled ("Model coming soon")
 *
 * Uses mode:'project' + selected_practice:'pasture_grazing' for all grazing activities.
 * Shows info icons (ℹ) next to each metric.
 * Shows demo economics section (clearly labeled).
 *
 * Calls onScored(score) so page.tsx can track scores for the min-score filter.
 *
 * States: idle → computing → done | error
 * All UI text translated via react-i18next.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MarketplaceProject } from '@/lib/marketplace/types';
import type { AnalyzeResponse } from '@/lib/scoring/types';
import { pointBuffer, geometryCentroid } from '@/lib/geo/centroid';
import { activityToPracticeId, GRAZING_ACTIVITIES, DEFAULT_ACTIVITY } from './ActivitySelect';
import { InfoPopover } from './InfoPopover';
import { computeDemoEconomics, formatUSD } from '@/lib/config/demoEconomics';

// Area stub used when no polygon geometry is available (point + 5km buffer)
const POINT_BUFFER_KM = 5;

interface Props {
  project: MarketplaceProject;
  selectedActivity: string;
  /** Called when a score is successfully computed */
  onScored?: (score: number) => void;
}

type ScoreState =
  | { status: 'idle' }
  | { status: 'computing' }
  | { status: 'done'; response: AnalyzeResponse; approxAOI: boolean; areaHa: number }
  | { status: 'error'; message: string };

const QUALITATIVE_COLORS: Record<string, string> = {
  High:   '#22c55e',
  Medium: '#f59e0b',
  Low:    '#ef4444',
};

function RiskBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value < 0.33 ? '#22c55e' : value < 0.66 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ height: 6, background: '#374151', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, transition: 'width 0.4s' }} />
      </div>
      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{pct}%</div>
    </div>
  );
}

/** Helper: derive whether management can be classified from project data */
function canClassifyManagement(project: MarketplaceProject): boolean {
  if (!project.land_use) return false;
  const lu = project.land_use.toLowerCase();
  return (
    lu.includes('grass') || lu.includes('pasture') || lu.includes('rangeland') ||
    lu.includes('crop')  || lu.includes('agri')    || lu.includes('farm') ||
    lu.includes('grazing')
  );
}

export function ScoreWidget({ project, selectedActivity, onScored }: Props) {
  const { t } = useTranslation();
  const [state, setState] = useState<ScoreState>({ status: 'idle' });

  const practiceId = activityToPracticeId(selectedActivity);
  const hasGeometry = project.location.type !== 'unknown';
  const isGrazing   = GRAZING_ACTIVITIES.has(selectedActivity);
  const mgmtOk      = canClassifyManagement(project);

  // Disable if: no geometry OR activity not supported OR land use not classified
  const canScore = hasGeometry && isGrazing;

  let disabledReason: string | null = null;
  if (!hasGeometry) {
    disabledReason = t('score.noGeometry');
  } else if (!isGrazing) {
    disabledReason = t('score.modelComingSoon');
  } else if (!mgmtOk) {
    disabledReason = t('score.mgmtNotClassified');
  }

  async function computeScores() {
    if (!practiceId) return;
    setState({ status: 'computing' });

    try {
      let areaHa = 100; // fallback stub
      let approxAOI = false;
      let coords: number[][][];

      if (project.location.type === 'polygon' && project.location.geometry) {
        const geom = project.location.geometry;
        coords = geom.type === 'Polygon' ? geom.coordinates : geom.coordinates[0];
        // TODO: compute actual area from polygon
      } else if (
        project.location.type === 'point' &&
        project.location.lat !== undefined &&
        project.location.lon !== undefined
      ) {
        const { polygon, area_ha } = pointBuffer(
          project.location.lat,
          project.location.lon,
          POINT_BUFFER_KM
        );
        coords = polygon.coordinates;
        areaHa = area_ha;
        approxAOI = true;
      } else {
        throw new Error('No geometry available for scoring');
      }

      const region = project.jurisdiction?.split('-')[0] ?? undefined;
      const body = {
        mode: 'project',
        aoi: {
          type: 'polygon',
          geometry: { type: 'Polygon', coordinates: coords },
          area_ha: areaHa,
          region,
        },
        selected_practice: practiceId,
      };

      const res = await fetch('/api/gis/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string; message?: string };
        throw new Error(err.message ?? err.error ?? `HTTP ${res.status}`);
      }

      const response = await res.json() as AnalyzeResponse;
      setState({ status: 'done', response, approxAOI, areaHa });

      // Report top score upwards for filter tracking
      const topResult = response.results.find((r) => r.practice_id === practiceId);
      if (topResult) onScored?.(topResult.suitability.score_0_100);
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  // ── IDLE ───────────────────────────────────────────────────────────────────
  if (state.status === 'idle') {
    return (
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #374151' }}>
        <button
          onClick={computeScores}
          disabled={!canScore}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 6,
            border: 'none',
            cursor: canScore ? 'pointer' : 'not-allowed',
            background: canScore ? '#166534' : '#374151',
            color: canScore ? '#4ade80' : '#6b7280',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {isGrazing
            ? t('score.computeButton', { activity: selectedActivity })
            : t('score.computeButtonGeneric')}
        </button>
        {disabledReason && (
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, textAlign: 'center' }}>
            {disabledReason}
          </div>
        )}
      </div>
    );
  }

  // ── COMPUTING ──────────────────────────────────────────────────────────────
  if (state.status === 'computing') {
    return (
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #374151' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6ee7b7', fontSize: 13 }}>
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
          {t('score.computing')}
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── ERROR ──────────────────────────────────────────────────────────────────
  if (state.status === 'error') {
    return (
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #374151' }}>
        <div style={{ color: '#f87171', fontSize: 12 }}>⚠️ {state.message}</div>
        <button
          onClick={() => setState({ status: 'idle' })}
          style={{ marginTop: 8, fontSize: 11, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {t('score.retry')}
        </button>
      </div>
    );
  }

  // ── DONE ───────────────────────────────────────────────────────────────────
  const { response, approxAOI, areaHa } = state;
  const topResult = response.results.find((r) => r.practice_id === (practiceId ?? 'pasture_grazing'));
  if (!topResult) {
    return (
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #374151' }}>
        <div style={{ color: '#f87171', fontSize: 12 }}>{t('score.noResult')}</div>
        <button onClick={() => setState({ status: 'idle' })} style={{ fontSize: 11, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', marginTop: 6 }}>
          {t('score.reset')}
        </button>
      </div>
    );
  }

  const qColor = QUALITATIVE_COLORS[topResult.suitability.qualitative] ?? '#6b7280';
  const econ = computeDemoEconomics(
    topResult.carbon.rate_expected_tco2e_ha_yr,
    areaHa,
    topResult.reversal_risk_0_1
  );

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #374151', fontSize: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {selectedActivity} — Score
        </span>
        <span style={{ fontSize: 10, color: '#6b7280', background: '#1f2937', padding: '1px 5px', borderRadius: 3, border: '1px solid #374151' }}>
          {t('score.stubData')}
        </span>
      </div>

      {approxAOI && (
        <div style={{ fontSize: 10, color: '#f59e0b', background: '#451a03', padding: '3px 6px', borderRadius: 4, marginBottom: 8, border: '1px solid #854d0e' }}>
          {t('score.approxAOI', { km: POINT_BUFFER_KM, ha: areaHa.toFixed(0) })}
        </div>
      )}

      {/* Score card */}
      <div style={{ background: '#111827', borderRadius: 6, padding: 10, marginBottom: 8, border: '1px solid #374151' }}>
        {/* Suitability */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 2 }}>
            {t('score.suitability')} <InfoPopover id="suitability" />
          </span>
          <span style={{
            fontSize: 13, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
            background: qColor + '22', color: qColor, border: `1px solid ${qColor}55`,
          }}>
            {topResult.suitability.score_0_100.toFixed(1)}/100 · {topResult.suitability.qualitative}
          </span>
        </div>

        {/* Carbon */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 2 }}>
            {t('score.carbonPotential')} <InfoPopover id="carbon" />
          </span>
          <span style={{ fontWeight: 600, color: '#6ee7b7' }}>
            {topResult.carbon.rate_expected_tco2e_ha_yr.toFixed(2)} tCO₂e/ha/yr
          </span>
        </div>

        {/* Reversal risk */}
        <div style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 2 }}>
              {t('score.reversalRisk')} <InfoPopover id="reversal_risk" />
            </span>
          </div>
          <RiskBar value={topResult.reversal_risk_0_1} />
        </div>

        {/* Confidence */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 2 }}>
            {t('score.confidence')} <InfoPopover id="confidence" />
          </span>
          <span style={{ color: '#d1d5db' }}>
            {(topResult.confidence_0_1 * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Demo economics */}
      <div style={{
        background: '#0f172a',
        border: '1px dashed #374151',
        borderRadius: 6,
        padding: '8px 10px',
        marginBottom: 8,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {t('score.econHeader')}
        </div>
        <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 6 }}>
          {t('score.econDisclaimer')}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#d1d5db', marginBottom: 3 }}>
          <span>{t('score.annualPotential')}</span>
          <span style={{ fontWeight: 600 }}>{econ.annual_tco2_potential.toFixed(1)} t/yr</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#d1d5db', marginBottom: 3 }}>
          <span>{t('score.revenueRange')}</span>
          <span style={{ color: '#6ee7b7' }}>
            {formatUSD(econ.revenue_low_usd)} – {formatUSD(econ.revenue_high_usd)}/yr
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af' }}>
          <span>{t('score.riskAdjustedMid')}</span>
          <span style={{ color: '#f9fafb', fontWeight: 600 }}>{formatUSD(econ.risk_adjusted_mid_usd)}/yr</span>
        </div>
        {approxAOI && (
          <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>
            {t('score.bufferNote', { ha: areaHa.toFixed(0), km: POINT_BUFFER_KM })}
          </div>
        )}
      </div>

      <button
        onClick={() => setState({ status: 'idle' })}
        style={{ fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}
      >
        {t('score.recompute')}
      </button>
    </div>
  );
}

/** Default export for /score page backward compatibility */
export default ScoreWidget;
