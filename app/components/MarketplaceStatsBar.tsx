'use client';

/**
 * MarketplaceStatsBar — metrics strip at the top of the Marketplace tab.
 *
 * All credit/sales figures use demo fallback values.
 * Clearly labeled "Demo metrics" to avoid misleading users.
 *
 * For MVP: live ledger data not wired (would require Regen chain queries).
 * TODO: Replace DEMO_STATS with real data from GET /api/marketplace/stats
 */

import { useTranslation } from 'react-i18next';

interface Props {
  projectCount: number;
}

// Demo/fallback values — not live data
const DEMO_STATS = {
  creditsIssued:   '2.4M tCO₂e',
  creditsSold:     '890k tCO₂e',
  activeSupply:    '1.5M tCO₂e',
};

interface StatItemProps {
  label: string;
  value: string;
  isLive?: boolean;
  accent?: boolean;
}

function StatItem({ label, value, isLive = false, accent = false }: StatItemProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '10px 20px',
        borderRight: '1px solid #1e3020',
        minWidth: 100,
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: accent ? '#4fb573' : '#c8e6cc',
          letterSpacing: '0.08em',
          lineHeight: 1.1,
          fontFamily: "'Courier New', 'Roboto Mono', 'Lucida Console', monospace",
          background: accent ? '#06120a' : '#07100a',
          border: `1px solid ${accent ? '#1a3a20' : '#152218'}`,
          borderRadius: 4,
          padding: '4px 10px',
          display: 'inline-block',
          boxShadow: accent
            ? '0 0 8px rgba(79,181,115,0.18) inset, 0 2px 4px rgba(0,0,0,0.5)'
            : '0 1px 4px rgba(0,0,0,0.6) inset',
          textShadow: accent
            ? '0 0 10px rgba(79,181,115,0.5)'
            : '0 0 6px rgba(200,230,204,0.2)',
          minWidth: 72,
          textAlign: 'center',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: isLive ? '#4fb573' : '#6b7e6f',
          marginTop: 3,
          textTransform: 'uppercase',
          letterSpacing: '0.6px',
        }}
      >
        {label}
        {isLive && (
          <span
            style={{
              marginLeft: 5,
              display: 'inline-block',
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: '#4fb573',
              verticalAlign: 'middle',
              boxShadow: '0 0 4px #4fb573',
            }}
          />
        )}
      </div>
    </div>
  );
}

export function MarketplaceStatsBar({ projectCount }: Props) {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        background: '#091410',
        borderBottom: '1px solid #1e3020',
        paddingLeft: 4,
        gap: 0,
        flexShrink: 0,
        overflowX: 'auto',
        fontFamily: "'Mulish', sans-serif",
      }}
    >
      <StatItem label={t('stats.totalProjects')} value={String(projectCount)} isLive accent />
      <StatItem label={t('stats.creditsIssued')} value={DEMO_STATS.creditsIssued} />
      <StatItem label={t('stats.soldRetired')}   value={DEMO_STATS.creditsSold} />
      <StatItem label={t('stats.activeSupply')}  value={DEMO_STATS.activeSupply} />

      <div
        style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          fontSize: 10,
          fontWeight: 600,
          color: '#6b5e00',
          background: 'transparent',
          gap: 5,
          flexShrink: 0,
          letterSpacing: '0.4px',
        }}
      >
        <span style={{ fontSize: 11 }}>⚠</span>
        {t('stats.demoMetrics')}
      </div>
    </div>
  );
}
