'use client';

/**
 * MarketplaceMapLegend — floating overlay on the map (bottom-left).
 *
 * Shows:
 *   - Dot color key by credit class prefix
 *   - Location precision key
 *   - Activity dimming note when active
 *
 * Collapsible — collapsed by default.
 * Labels are translated via react-i18next.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  /** True when the activity filter is dimming non-classifiable points */
  dimActive: boolean;
}

export function MarketplaceMapLegend({ dimActive }: Props) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  const CLASS_ENTRIES = [
    { labelKey: 'legend.btClass', color: '#a78bfa' },
    { labelKey: 'legend.cSeries', color: '#60a5fa' },
    { labelKey: 'legend.ksClass', color: '#34d399' },
    { labelKey: 'legend.mbClass', color: '#22d3ee' },
    { labelKey: 'legend.other',   color: '#9ca3af' },
  ];

  const PRECISION_ENTRIES = [
    { labelKey: 'legend.exactBoundary',     color: '#4fb573' },
    { labelKey: 'legend.approxSubdivision', color: '#f59e0b' },
    { labelKey: 'legend.approxCountry',     color: '#f97316' },
  ];

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        left: 10,
        zIndex: 1,
        background: 'rgba(9, 20, 16, 0.92)',
        border: '1px solid #1e3020',
        borderRadius: 8,
        fontSize: 10,
        color: '#7a9e82',
        backdropFilter: 'blur(6px)',
        minWidth: open ? 160 : 0,
        fontFamily: "'Mulish', sans-serif",
        overflow: 'hidden',
      }}
    >
      {/* Toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          width: '100%',
          padding: '6px 10px',
          background: 'none',
          border: 'none',
          borderBottom: open ? '1px solid #1e3020' : 'none',
          cursor: 'pointer',
          color: '#b3d9bb',
          fontSize: 11,
          fontWeight: 700,
          fontFamily: "'Mulish', sans-serif",
          whiteSpace: 'nowrap',
        }}
      >
        {t('legend.title')}
        <span style={{ marginLeft: 'auto', fontSize: 9, opacity: 0.7 }}>{open ? '▲' : '▼'}</span>
      </button>

      {/* Content — only shown when expanded */}
      {open && (
        <div style={{ padding: '6px 10px 8px' }}>
          {/* Credit class */}
          <div style={{ fontWeight: 700, color: '#4a6650', marginBottom: 4, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {t('legend.creditClass')}
          </div>
          {CLASS_ENTRIES.map(({ labelKey, color }) => (
            <div key={labelKey} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
              {t(labelKey)}
            </div>
          ))}

          {/* Precision */}
          <div style={{ fontWeight: 700, color: '#4a6650', margin: '7px 0 4px', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {t('legend.locationPrecision')}
          </div>
          {PRECISION_ENTRIES.map(({ labelKey, color }) => (
            <div key={labelKey} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ width: 8, height: 8, border: `2px solid ${color}`, borderRadius: '50%', flexShrink: 0, display: 'inline-block' }} />
              {t(labelKey)}
            </div>
          ))}

          {/* Dimming note */}
          {dimActive && (
            <div style={{
              marginTop: 7,
              padding: '3px 6px',
              background: '#2a1800',
              border: '1px solid #6b5e00',
              borderRadius: 4,
              color: '#d4a500',
              fontSize: 10,
              lineHeight: 1.4,
            }}>
              {t('legend.dimmedNote')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
