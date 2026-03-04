'use client';

/**
 * MarketplaceFilters — buyer filter controls for the Marketplace tab side panel.
 *
 * All dropdown options are built dynamically from the projects currently loaded
 * from the Regen Marketplace API — no hardcoded or external-URL-sourced lists.
 *
 * Filters:
 *   - Activity      — dropdown from project.project_activities  (hidden if no data)
 *   - Methodology   — dropdown from project.methodology + vcs_methodology names
 *   - Issuance status — dropdown from project.status values present in data
 *   - Region        — dropdown from project.jurisdiction prefixes (passed from ProjectPanel)
 *   - Credit class  — dropdown from project.credit_class_id    (passed from ProjectPanel)
 *   - Min suitability score — range slider (disabled until a project is scored)
 */

import { useTranslation } from 'react-i18next';

export interface MarketplaceFilterState {
  activity: string;
  methodology: string;
  issuanceStatus: string;
  region: string;
  creditClass: string;       // '' = all classes, otherwise raw class_id e.g. "C07"
  minScore: number;          // 0 means "no minimum"
}

export const DEFAULT_FILTERS: MarketplaceFilterState = {
  activity:       '',
  methodology:    '',
  issuanceStatus: '',
  region:         '',
  creditClass:    '',
  minScore:       0,
};

interface Props {
  filters: MarketplaceFilterState;
  onChange: (filters: MarketplaceFilterState) => void;
  availableRegions: string[];
  availableCreditClasses: Array<{ id: string; name: string }>;
  /** Unique activities from project.project_activities across all loaded projects */
  availableActivities: string[];
  /** Unique methodology names from project.methodology + vcs_methodology */
  availableMethodologies: string[];
  /** Unique non-empty status values from project.status */
  availableStatuses: string[];
  hasScores: boolean;
}

export function MarketplaceFilters({
  filters, onChange,
  availableRegions, availableCreditClasses,
  availableActivities, availableMethodologies, availableStatuses,
  hasScores,
}: Props) {
  const { t } = useTranslation();

  function patch(partial: Partial<MarketplaceFilterState>) {
    onChange({ ...filters, ...partial });
  }

  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '4px 6px',
    borderRadius: 5,
    border: '1px solid #253428',
    background: '#0d1a10',
    color: '#d1d5db',
    fontSize: 12,
    marginBottom: 6,
  };

  return (
    <div style={{ padding: '8px 12px', borderBottom: '1px solid #1a2a1e' }}>

      {/* Activity — built from project.project_activities (only shown when data exists) */}
      {availableActivities.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{t('filters.activity')}</div>
          <select
            value={filters.activity}
            onChange={(e) => patch({ activity: e.target.value })}
            style={selectStyle}
          >
            <option value="">{t('filters.allActivities')}</option>
            {availableActivities.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      )}

      {/* Methodology — dropdown when data available, text search fallback otherwise */}
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{t('filters.methodology')}</div>
      {availableMethodologies.length > 0 ? (
        <select
          value={filters.methodology}
          onChange={(e) => patch({ methodology: e.target.value })}
          style={selectStyle}
        >
          <option value="">{t('filters.allMethodologies')}</option>
          {availableMethodologies.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          placeholder={t('filters.searchMethodology')}
          value={filters.methodology}
          onChange={(e) => patch({ methodology: e.target.value })}
          style={{ ...selectStyle, boxSizing: 'border-box' as const, padding: '5px 8px', color: '#f9fafb' }}
        />
      )}

      {/* Issuance status — built from project.status values present in loaded data */}
      {availableStatuses.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{t('filters.issuanceStatus')}</div>
          <select
            value={filters.issuanceStatus}
            onChange={(e) => patch({ issuanceStatus: e.target.value })}
            style={selectStyle}
          >
            <option value="">{t('filters.allStatuses')}</option>
            {availableStatuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </>
      )}

      {/* Credit class — built from project.credit_class_id (passed from ProjectPanel) */}
      {availableCreditClasses.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{t('filters.creditClass')}</div>
          <select
            value={filters.creditClass}
            onChange={(e) => patch({ creditClass: e.target.value })}
            style={selectStyle}
          >
            <option value="">{t('filters.allCreditClasses')}</option>
            {availableCreditClasses.map(({ id, name }) => (
              <option key={id} value={id}>{id} — {name}</option>
            ))}
          </select>
        </>
      )}

      {/* Region — built from project.jurisdiction prefixes (passed from ProjectPanel) */}
      {availableRegions.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{t('filters.region')}</div>
          <select
            value={filters.region}
            onChange={(e) => patch({ region: e.target.value })}
            style={selectStyle}
          >
            <option value="">{t('filters.allRegions')}</option>
            {availableRegions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </>
      )}

      {/* Min suitability score */}
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>
        {t('filters.minScore')}
        {!hasScores && (
          <span
            title={t('filters.scoreToEnableTitle')}
            style={{ color: '#854d0e', marginLeft: 4 }}
          >
            {t('filters.scoreToEnable')}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={filters.minScore}
          disabled={!hasScores}
          onChange={(e) => patch({ minScore: Number(e.target.value) })}
          style={{ flex: 1, opacity: hasScores ? 1 : 0.4 }}
        />
        <span style={{ fontSize: 11, color: '#d1d5db', minWidth: 28, textAlign: 'right' }}>
          {filters.minScore > 0 ? `≥${filters.minScore}` : t('filters.any')}
        </span>
      </div>

      {/* Reset link */}
      {(filters.activity || filters.methodology || filters.issuanceStatus ||
        filters.region   || filters.creditClass || filters.minScore > 0) && (
        <button
          onClick={() => onChange(DEFAULT_FILTERS)}
          style={{ fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
        >
          {t('filters.resetFilters')}
        </button>
      )}
    </div>
  );
}
