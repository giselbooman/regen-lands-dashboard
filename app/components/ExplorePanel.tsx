'use client';

/**
 * ExplorePanel — Mode B side panel for "Explore New Land" tab.
 *
 * States:
 *   1. No AOI drawn → instruction text + polygon draw hint
 *   2. AOI drawn → three action cards visible simultaneously:
 *        a. Assess Prescribed Grazing Potential (active — runs existing scoring)
 *        b. Explore Regenerative Practices (mode: 'explore' → ranked practices)
 *        c. Investor Matches (same explore response → investor_matches)
 *
 * "Clear AOI" button always visible once polygon is drawn.
 * All UI text translated via react-i18next.
 * Domain-specific terms (AOI, Carbon Potential, Reversal Risk, Biochar, etc.)
 * are kept in English in all locales.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AOIGeometry } from '@/lib/scoring/types';
import type { AnalyzeResponse } from '@/lib/scoring/types';
import { ActivitySelect, activityToPracticeId, GRAZING_ACTIVITIES, DEFAULT_ACTIVITY } from './ActivitySelect';
import { InfoPopover } from './InfoPopover';
import { computeDemoEconomics, formatUSD } from '@/lib/config/demoEconomics';

interface Props {
  drawnAOI: { polygon: AOIGeometry; area_ha: number } | null;
  onClear: () => void;
}

type ScoreState =
  | { status: 'idle' }
  | { status: 'computing' }
  | { status: 'done'; response: AnalyzeResponse }
  | { status: 'error'; message: string };

type ExploreState =
  | { status: 'idle' }
  | { status: 'computing' }
  | { status: 'done'; response: AnalyzeResponse }
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
      <div style={{ height: 6, background: '#253428', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, transition: 'width 0.4s' }} />
      </div>
      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{pct}%</div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  width: 300,
  minWidth: 300,
  height: '100%',
  background: '#0f1a12',
  borderRight: '1px solid #1e3020',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

export function ExplorePanel({ drawnAOI, onClear }: Props) {
  const { t } = useTranslation();
  const [activity, setActivity] = useState(DEFAULT_ACTIVITY);
  const [scoreState, setScoreState] = useState<ScoreState>({ status: 'idle' });
  const [exploreState, setExploreState] = useState<ExploreState>({ status: 'idle' });

  const practiceId  = activityToPracticeId(activity);
  const isSupported = GRAZING_ACTIVITIES.has(activity);

  // Reset score when AOI is cleared
  const handleClear = () => {
    setScoreState({ status: 'idle' });
    setExploreState({ status: 'idle' });
    onClear();
  };

  async function computeScore() {
    if (!drawnAOI || !practiceId) return;
    setScoreState({ status: 'computing' });
    try {
      const body = {
        mode: 'project',
        aoi: {
          type: 'polygon',
          geometry: drawnAOI.polygon,
          area_ha: drawnAOI.area_ha,
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
      setScoreState({ status: 'done', response });
    } catch (err) {
      setScoreState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  async function computeExplore() {
    if (!drawnAOI || exploreState.status === 'computing') return;
    setExploreState({ status: 'computing' });
    try {
      const res = await fetch('/api/gis/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'explore',
          aoi: { type: 'polygon', geometry: drawnAOI.polygon, area_ha: drawnAOI.area_ha },
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string; message?: string };
        throw new Error(err.message ?? err.error ?? `HTTP ${res.status}`);
      }
      const response = await res.json() as AnalyzeResponse;
      setExploreState({ status: 'done', response });
    } catch (err) {
      setExploreState({ status: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  // ── Header (always shown) ──────────────────────────────────────────────────
  const header = (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid #1e3020', flexShrink: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#4fb573', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {t('explore.panelHeader')}
      </div>
    </div>
  );

  // ── No AOI drawn ───────────────────────────────────────────────────────────
  if (!drawnAOI) {
    return (
      <div style={panelStyle}>
        {header}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🗺</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#f9fafb', marginBottom: 8 }}>
            {t('explore.drawPromptTitle')}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
            {t('explore.drawPromptBody')}
          </div>
        </div>
      </div>
    );
  }

  // ── AOI drawn — show all three action cards ────────────────────────────────
  const areaHa = drawnAOI.area_ha;

  return (
    <div style={panelStyle}>
      {header}

      {/* AOI info + clear */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e3020', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: '#d1d5db' }}>
            {t('explore.area')} <strong style={{ color: '#f9fafb' }}>{areaHa.toFixed(1)} ha</strong>
          </div>
          <button
            onClick={handleClear}
            style={{ fontSize: 11, color: '#f87171', background: 'none', border: '1px solid #991b1b', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}
          >
            {t('explore.clearAOI')}
          </button>
        </div>
      </div>

      {/* ── Three action cards — independently scrollable column ── */}
      {/* minHeight:0 overrides flex's default min-height:auto so overflow:auto can trigger */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '10px 12px', paddingBottom: 20, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>

        {/* ── Card 1: Assess Prescribed Grazing Potential ── */}
        {/* flexShrink:0 prevents the flex column from squishing this card — content stays full height and the parent scrolls instead */}
        <div style={{ border: '1px solid #253428', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ padding: '10px 12px', background: '#0d1f10' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#4fb573', marginBottom: 2 }}>
              {t('explore.card1Title')}
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 10 }}>
              {t('explore.card1Desc')}
            </div>

            <ActivitySelect
              value={activity}
              onChange={(a) => { setActivity(a); setScoreState({ status: 'idle' }); }}
              label={t('explore.activityLabel')}
            />

            <button
              onClick={computeScore}
              disabled={!isSupported || scoreState.status === 'computing'}
              style={{
                width: '100%',
                marginTop: 8,
                padding: '8px 12px',
                borderRadius: 6,
                border: 'none',
                cursor: isSupported && scoreState.status !== 'computing' ? 'pointer' : 'not-allowed',
                background: isSupported ? '#166534' : '#253428',
                color: isSupported ? '#4fb573' : '#6b7280',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {scoreState.status === 'computing' ? t('explore.computing') : t('explore.runAssessment')}
            </button>
          </div>

          {/* Results inline */}
          {scoreState.status === 'computing' && (
            <div style={{ padding: '8px 12px', background: '#0f1a12', borderTop: '1px solid #1e3020' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6ee7b7' }}>
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                {t('explore.analyzingLayers')}
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              </div>
            </div>
          )}

          {scoreState.status === 'error' && (
            <div style={{ padding: '8px 12px', background: '#0f1a12', borderTop: '1px solid #1e3020' }}>
              <div style={{ color: '#f87171' }}>⚠️ {scoreState.message}</div>
              <button
                onClick={() => setScoreState({ status: 'idle' })}
                style={{ marginTop: 6, fontSize: 11, color: '#9ca3af', background: '#1a2a1a', border: '1px solid #253428', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#d1d5db'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#374151'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#253428'; }}
              >
                {t('explore.retry')}
              </button>
            </div>
          )}

          {scoreState.status === 'done' && (() => {
            const response = scoreState.response;
            const topResult = response.results.find(
              (r) => r.practice_id === (practiceId ?? 'pasture_grazing')
            );
            if (!topResult) return null;
            const qColor = QUALITATIVE_COLORS[topResult.suitability.qualitative] ?? '#6b7280';
            const econ = computeDemoEconomics(
              topResult.carbon.rate_expected_tco2e_ha_yr,
              areaHa,
              topResult.reversal_risk_0_1
            );
            return (
              <div style={{ padding: '10px 12px', background: '#0f1a12', borderTop: '1px solid #1e3020' }}>
                {/* Suitability */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 2 }}>
                    {t('explore.suitability')} <InfoPopover id="suitability" />
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: qColor + '22', color: qColor, border: `1px solid ${qColor}55` }}>
                    {topResult.suitability.score_0_100.toFixed(1)}/100 · {topResult.suitability.qualitative}
                  </span>
                </div>
                {/* Carbon */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 2 }}>
                    {t('explore.carbonPotential')} <InfoPopover id="carbon" />
                  </span>
                  <span style={{ fontWeight: 600, color: '#6ee7b7' }}>
                    {topResult.carbon.rate_expected_tco2e_ha_yr.toFixed(2)} tCO₂e/ha/yr
                  </span>
                </div>
                {/* Reversal risk */}
                <div style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, color: '#9ca3af' }}>
                    {t('explore.reversalRisk')} <InfoPopover id="reversal_risk" />
                  </div>
                  <RiskBar value={topResult.reversal_risk_0_1} />
                </div>
                {/* Confidence */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 2 }}>
                    {t('explore.confidence')} <InfoPopover id="confidence" />
                  </span>
                  <span style={{ color: '#d1d5db' }}>{(topResult.confidence_0_1 * 100).toFixed(0)}%</span>
                </div>
                {/* Demo economics */}
                <div style={{ background: '#0d1f10', border: '1px dashed #253428', borderRadius: 6, padding: '8px 10px', marginBottom: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', marginBottom: 4, textTransform: 'uppercase' }}>
                    {t('explore.econHeader')}
                  </div>
                  <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 6 }}>
                    {t('explore.econDisclaimer')}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#d1d5db', marginBottom: 3 }}>
                    <span>{t('explore.annualPotential')}</span>
                    <span style={{ fontWeight: 600 }}>{econ.annual_tco2_potential.toFixed(1)} t/yr</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#d1d5db', marginBottom: 3 }}>
                    <span>{t('explore.revenueRange')}</span>
                    <span style={{ color: '#6ee7b7' }}>{formatUSD(econ.revenue_low_usd)} – {formatUSD(econ.revenue_high_usd)}/yr</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af' }}>
                    <span>{t('explore.riskAdjustedMid')}</span>
                    <span style={{ color: '#f9fafb', fontWeight: 600 }}>{formatUSD(econ.risk_adjusted_mid_usd)}/yr</span>
                  </div>
                </div>
                <button
                  onClick={() => setScoreState({ status: 'idle' })}
                  style={{ fontSize: 11, color: '#9ca3af', background: '#1a2a1a', border: '1px solid #253428', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#d1d5db'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#374151'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#253428'; }}
                >
                  {t('explore.recompute')}
                </button>
              </div>
            );
          })()}
        </div>

        {/* ── Card 2: Explore Regenerative Practices ── */}
        <div style={{ border: '1px solid #253428', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ padding: '10px 12px', background: '#0d1f10' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#60a5fa', marginBottom: 2 }}>
              {t('explore.card2Title')}
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 10 }}>
              {t('explore.card2Desc')}
            </div>
            <button
              onClick={computeExplore}
              disabled={exploreState.status === 'computing'}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #1d4ed8',
                cursor: exploreState.status === 'computing' ? 'not-allowed' : 'pointer',
                background: exploreState.status === 'computing' ? 'transparent' : '#1e3a5f',
                color: exploreState.status === 'computing' ? '#4b5563' : '#93c5fd',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {exploreState.status === 'computing' ? t('explore.analyzing') : t('explore.explorePractices')}
            </button>
          </div>

          {exploreState.status === 'error' && (
            <div style={{ padding: '8px 12px', background: '#0f1a12', borderTop: '1px solid #1e3020' }}>
              <div style={{ color: '#f87171', fontSize: 11 }}>⚠️ {exploreState.message}</div>
              <button
                onClick={() => setExploreState({ status: 'idle' })}
                style={{ marginTop: 4, fontSize: 11, color: '#9ca3af', background: '#1a2a1a', border: '1px solid #253428', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#d1d5db'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#374151'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#253428'; }}
              >
                {t('explore.retry')}
              </button>
            </div>
          )}

          {exploreState.status === 'done' && (() => {
            const { results, ranked_practices } = exploreState.response;
            const rankMap = new Map<string, number>(ranked_practices.map((r) => [r.practice_id, r.rank]));
            const nonBlocked = [...results.filter((r) => !r.blocked)].sort(
              (a, b) => (rankMap.get(a.practice_id) ?? 99) - (rankMap.get(b.practice_id) ?? 99)
            );
            const blocked = results.filter((r) => r.blocked);
            return (
              <div style={{ padding: '8px 12px', background: '#0f1a12', borderTop: '1px solid #1e3020' }}>
                {nonBlocked.map((r) => {
                  const qColor = QUALITATIVE_COLORS[r.suitability.qualitative] ?? '#6b7280';
                  const riskColor = r.reversal_risk_0_1 < 0.33 ? '#22c55e' : r.reversal_risk_0_1 < 0.66 ? '#f59e0b' : '#ef4444';
                  const coB = r.co_benefits;
                  const coBenefits: [string, string, number][] = [
                    ['bio',  '🌿 Bio',  coB.biodiversity_0_1],
                    ['h2o',  '💧 H₂O', coB.water_0_1],
                    ['soil', '🪨 Soil', coB.soil_health_0_1],
                  ];
                  return (
                    <div key={r.practice_id} style={{ marginBottom: 6, padding: '8px', background: '#0d1f10', borderRadius: 6, border: '1px solid #1e3020' }}>
                      {/* Row 1: rank + name + suitability score */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#4fb573', minWidth: 16, textAlign: 'right', flexShrink: 0, lineHeight: 1.3 }}>
                          {rankMap.get(r.practice_id)}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#d1d5db', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3 }}>
                            {t(`explore.practices.${r.practice_id}`, { defaultValue: r.practice_id })}
                          </div>
                          <div style={{ fontSize: 10, color: '#6b7280', marginTop: 1 }}>
                            {r.carbon.rate_expected_tco2e_ha_yr.toFixed(2)} tCO₂e/ha/yr
                          </div>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: qColor, background: qColor + '22', border: `1px solid ${qColor}55`, padding: '2px 6px', borderRadius: 4, flexShrink: 0, lineHeight: 1.3 }}>
                          {r.suitability.score_0_100.toFixed(0)}
                        </span>
                      </div>
                      {/* Row 2: co-benefits badges + reversal risk */}
                      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        {coBenefits.map(([key, label, val]) => {
                          const pct = Math.round(val * 100);
                          const c = val > 0.66 ? '#22c55e' : val > 0.33 ? '#f59e0b' : '#ef4444';
                          return (
                            <span key={key} style={{ fontSize: 9, color: c, background: c + '18', border: `1px solid ${c}44`, padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap' }}>
                              {label} {pct}%
                            </span>
                          );
                        })}
                        <span style={{ fontSize: 9, color: riskColor, background: riskColor + '18', border: `1px solid ${riskColor}44`, padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap' }}>
                          {t('explore.riskBadge')} {Math.round(r.reversal_risk_0_1 * 100)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
                {blocked.length > 0 && (
                  <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>
                    {t('explore.practicesBlocked', { count: blocked.length })}
                  </div>
                )}
                <button
                  onClick={() => setExploreState({ status: 'idle' })}
                  style={{ marginTop: 6, fontSize: 11, color: '#9ca3af', background: '#1a2a1a', border: '1px solid #253428', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#d1d5db'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#374151'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#253428'; }}
                >
                  {t('explore.reanalyze')}
                </button>
              </div>
            );
          })()}
        </div>

        {/* ── Card 3: Investor Matches — visually highlighted ── */}
        <div style={{
          border: '1px solid #78350f',
          borderRadius: 8,
          overflow: 'hidden',
          flexShrink: 0,
          background: 'linear-gradient(135deg, #1c1400 0%, #1a0f00 100%)',
          position: 'relative',
        }}>
          {/* Subtle glow accent */}
          <div style={{
            position: 'absolute', top: 0, right: 0,
            width: 80, height: 80,
            background: 'radial-gradient(circle, #f59e0b22 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          <div style={{ padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24' }}>
                {t('explore.card3Title')}
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, background: '#92400e', color: '#fde68a', padding: '1px 6px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {t('explore.highValue')}
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#78716c', marginBottom: 10 }}>
              {t('explore.card3Desc')}
            </div>
            <button
              onClick={computeExplore}
              disabled={exploreState.status === 'computing'}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #78350f',
                cursor: exploreState.status === 'computing' ? 'not-allowed' : 'pointer',
                background: exploreState.status === 'computing' ? 'transparent' : '#78350f44',
                color: exploreState.status === 'computing' ? '#78716c' : '#fbbf24',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {exploreState.status === 'computing' ? t('explore.matching') : t('explore.findMatches')}
            </button>
          </div>

          {exploreState.status === 'error' && (
            <div style={{ padding: '8px 12px', background: '#0f0a00', borderTop: '1px solid #78350f' }}>
              <div style={{ color: '#f87171', fontSize: 11 }}>⚠️ {exploreState.message}</div>
            </div>
          )}

          {exploreState.status === 'done' && (() => {
            const matches = exploreState.response.investor_matches;
            return (
              <div style={{ padding: '8px 12px', background: '#0f0a00', borderTop: '1px solid #78350f' }}>
                {matches.map((m) => (
                  <div key={m.investor_id} style={{ marginBottom: 8, padding: '8px 10px', background: '#1c1400', borderRadius: 6, border: '1px solid #78350f' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#fde68a' }}>{m.investor_name}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24' }}>{m.match_score_0_100.toFixed(1)}</span>
                    </div>
                    <div style={{ height: 4, background: '#2c1800', borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
                      <div style={{ height: '100%', background: '#f59e0b', width: `${m.match_score_0_100}%`, transition: 'width 0.4s' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2, textAlign: 'center' }}>
                      {(
                        [
                          ['practiceFit', m.explain.practice_fit],
                          ['regionFit',   m.explain.region_fit],
                          ['riskFit',     m.explain.risk_fit],
                          ['impactFit',   m.explain.impact_fit],
                          ['stageFit',    m.explain.stage_fit],
                        ] as [string, number][]
                      ).map(([key, val]) => (
                        <div key={key}>
                          <div style={{ fontSize: 9, color: '#78716c' }}>{t(`explore.${key}`)}</div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: '#d1d5db' }}>{val.toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => setExploreState({ status: 'idle' })}
                  style={{ marginTop: 2, fontSize: 11, color: '#a89e8c', background: '#1c1400', border: '1px solid #78350f66', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#fde68a'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#78350f'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#a89e8c'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#78350f66'; }}
                >
                  {t('explore.reanalyze')}
                </button>
              </div>
            );
          })()}
        </div>

      </div>
    </div>
  );
}
