'use client';

/**
 * ProjectPanel — Marketplace tab left sidebar.
 *
 * Filtering is done UPSTREAM in page.tsx — this component receives
 * `visibleProjects` (already filtered) and further restricts to viewport.
 *
 * Layout:
 *   ┌─────────────────────────────────┐
 *   │  Search + Filters toggle        │
 *   │  Results: X / Y  [◑ Dim toggle] │
 *   │  MarketplaceFilters (collapsed) │
 *   │  Count row                      │
 *   │  Project list (scrollable)      │
 *   │    ProjectRow rows              │
 *   │    Missing geodata section      │
 *   └─────────────────────────────────┘
 *
 * When a project is selected → ProjectDetail view.
 *
 * Data hygiene: NEVER display raw IDs/codes. Show human-readable names only.
 */

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { MarketplaceProject } from '@/lib/marketplace/types';
import { ScoreWidget } from './ScoreWidget';
import { MarketplaceFilters, type MarketplaceFilterState } from './MarketplaceFilters';
import { ActivitySelect, DEFAULT_ACTIVITY } from './ActivitySelect';

interface Props {
  allProjects: MarketplaceProject[];
  /** Pre-filtered by page.tsx (search + filters + scores). Also passed to map. */
  visibleProjects: MarketplaceProject[];
  viewportBounds: { west: number; south: number; east: number; north: number } | null;
  selectedId: string | null;
  onSelect: (project: MarketplaceProject) => void;
  filters: MarketplaceFilterState;
  onFiltersChange: (f: MarketplaceFilterState) => void;
  scores: Record<string, number>;
  onScored: (projectId: string, score: number) => void;
  /** Lifted search query (controls visibleProjects via page.tsx) */
  search: string;
  onSearchChange: (q: string) => void;
  /** When true: map dims non-matching instead of hard-hiding them */
  dimMode: boolean;
  onDimModeChange: (v: boolean) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function jurisdictionLabel(code: string | undefined): string {
  if (!code) return '';
  return code.split('-')[0];
}

/** Short human-readable location for list rows. */
function shortLocation(project: MarketplaceProject): string {
  if (project.administrative_area) return project.administrative_area;
  if (project.place_name) return project.place_name.split(',')[0].trim();
  return jurisdictionLabel(project.jurisdiction);
}

function statusColor(status: string | undefined): string {
  if (!status) return '#6b7280';
  const s = status.toLowerCase();
  if (s.includes('issued'))    return '#22c55e';
  if (s.includes('available')) return '#60a5fa';
  if (s.includes('sold') || s.includes('retired')) return '#a78bfa';
  if (s.includes('pipeline'))  return '#f59e0b';
  return '#6b7280';
}

function isInViewport(
  project: MarketplaceProject,
  bounds: { west: number; south: number; east: number; north: number }
): boolean {
  const { lat, lon } = project.location;
  if (lat === undefined || lon === undefined) return false;
  return lon >= bounds.west && lon <= bounds.east && lat >= bounds.south && lat <= bounds.north;
}

/** Does this project's land use suggest it can be classified for the selected activity? */
function canClassifyManagement(project: MarketplaceProject): boolean {
  if (!project.land_use) return false;
  const lu = project.land_use.toLowerCase();
  return (
    lu.includes('grass') || lu.includes('pasture') || lu.includes('rangeland') ||
    lu.includes('crop')  || lu.includes('agri')    || lu.includes('farm') ||
    lu.includes('grazing')
  );
}

// ── ProjectRow ────────────────────────────────────────────────────────────────

function ProjectRow({
  project, isSelected, onClick, score, noMetadataLabel,
}: {
  project: MarketplaceProject;
  isSelected: boolean;
  onClick: () => void;
  score?: number;
  noMetadataLabel: string;
}) {
  const sc  = statusColor(project.status);
  const loc = shortLocation(project);

  return (
    <div
      onClick={onClick}
      style={{
        padding: '8px 12px',
        cursor: 'pointer',
        background: isSelected ? '#1a3020' : 'transparent',
        borderLeft: isSelected ? '3px solid #4fb573' : '3px solid transparent',
        borderBottom: '1px solid #1a2a1e',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#0f1a12'; }}
      onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      {/* Row 1: name + status badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{
          flex: 1, fontSize: 12, fontWeight: 600, color: '#f9fafb',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {project.name}
        </span>
        {project.status && (
          <span style={{ fontSize: 10, color: sc, border: `1px solid ${sc}55`, padding: '1px 5px', borderRadius: 3, flexShrink: 0 }}>
            {project.status}
          </span>
        )}
      </div>

      {/* Row 2: location + credit class badge + metadata note + score dot */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 10 }}>
        {loc && (
          <span style={{ color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
            📍 {loc}
          </span>
        )}
        {project.credit_class_id && (
          <span
            title={project.credit_class ?? project.credit_class_id}
            style={{ background: '#1e3a5f', color: '#60a5fa', padding: '1px 5px', borderRadius: 3, flexShrink: 0 }}
          >
            {project.credit_class_id}
          </span>
        )}
        {project.metadata_source === 'none' && (
          <span style={{ color: '#4a6650' }} title="Metadata unavailable for this project">
            {noMetadataLabel}
          </span>
        )}
        {score !== undefined && (
          <span style={{ marginLeft: 'auto', color: score >= 60 ? '#4fb573' : score >= 40 ? '#f59e0b' : '#f87171' }}>
            ● {score.toFixed(0)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── ProjectDetail ─────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: '#4a6650', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 12, marginBottom: 4, borderTop: '1px solid #1a2a1e', paddingTop: 8 }}>
      {children}
    </div>
  );
}

function Row({ label, value, sub, dim }: { label: string; value: string; sub?: string; dim?: boolean }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <span style={{ color: '#6b7280' }}>{label}: </span>
      <span style={{ color: dim ? '#4a6650' : '#d1d5db' }}>{value}</span>
      {sub && <span style={{ fontSize: 10, color: '#6b7280', marginLeft: 4 }}>{sub}</span>}
    </div>
  );
}

function ProjectDetail({
  project, score, onClose, onScored,
}: {
  project: MarketplaceProject;
  score?: number;
  onClose: () => void;
  onScored: (score: number) => void;
}) {
  const { t } = useTranslation();
  const [selectedActivity, setSelectedActivity] = useState(DEFAULT_ACTIVITY);
  const sc = statusColor(project.status);
  const methName = project.vcs_methodology?.name ?? project.methodology?.name ?? null;

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 12, fontSize: 12 }}>
      <button
        onClick={onClose}
        style={{ fontSize: 11, color: '#9ca3af', background: '#1a2230', border: '1px solid #253428', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', marginBottom: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#f9fafb'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#4a6650'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#253428'; }}
      >
        {t('panel.backToList')}
      </button>

      <div style={{ fontWeight: 700, fontSize: 14, color: '#f9fafb', marginBottom: 2 }}>
        {project.name}
      </div>

      {/* Badges */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, marginTop: 6 }}>
        {project.credit_class_id && (
          <span title={project.credit_class ?? project.credit_class_id} style={{ fontSize: 10, background: '#1e3a5f', color: '#60a5fa', padding: '2px 6px', borderRadius: 4, border: '1px solid #2d5a8e' }}>
            {project.credit_class_id}
          </span>
        )}
        {project.status && (
          <span style={{ fontSize: 10, background: sc + '22', color: sc, padding: '2px 6px', borderRadius: 4, border: `1px solid ${sc}55` }}>
            {project.status}
          </span>
        )}
        <span style={{ fontSize: 10, background: '#1a3020', color: '#4fb573', padding: '2px 6px', borderRadius: 4, border: '1px solid #166534' }}>
          {t('panel.regenRegistry')}
        </span>
        {project.location.precision !== 'project' && project.location.type !== 'unknown' && (
          <span style={{ fontSize: 10, background: '#1c1917', color: '#d97706', padding: '2px 6px', borderRadius: 4, border: '1px solid #78350f' }}>
            {t('panel.approxLocation')}
          </span>
        )}
        {project.metadata_source === 'none' && (
          <span style={{ fontSize: 10, background: '#1c1917', color: '#6b7280', padding: '2px 6px', borderRadius: 4, border: '1px solid #292524' }}>
            {t('panel.metadataUnavailable')}
          </span>
        )}
      </div>

      {/* Description */}
      {project.description && (
        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10, lineHeight: 1.5 }}>
          {project.description.length > 200 ? project.description.slice(0, 200) + '…' : project.description}
        </div>
      )}

      {/* Location */}
      <SectionHeader>{t('panel.sections.location')}</SectionHeader>
      {project.place_name && <Row label={t('panel.rows.place')} value={project.place_name} />}
      {project.administrative_area && <Row label={t('panel.rows.area')} value={project.administrative_area} />}
      {project.region && <Row label={t('panel.rows.region')} value={project.region} />}
      {project.biome_type && <Row label={t('panel.rows.biome')} value={project.biome_type} />}
      {project.watershed && <Row label={t('panel.rows.watershed')} value={project.watershed} />}
      {project.location.lat !== undefined && (
        <Row
          label={t('panel.rows.coordinates')}
          value={`${project.location.lat.toFixed(4)}°N, ${project.location.lon?.toFixed(4)}°E`}
          sub={project.location.precision !== 'project' ? t('panel.approximate') : undefined}
        />
      )}
      {!project.place_name && !project.administrative_area && project.jurisdiction && (
        <Row label={t('panel.rows.jurisdiction')} value={project.jurisdiction} />
      )}

      {/* Classification */}
      <SectionHeader>{t('panel.sections.classification')}</SectionHeader>
      {project.credit_class && (
        <Row label={t('panel.rows.creditClass')} value={project.credit_class_id ? `${project.credit_class_id} · ${project.credit_class}` : project.credit_class} />
      )}
      {project.project_type && <Row label={t('panel.rows.projectType')} value={project.project_type} />}
      {project.land_use && <Row label={t('panel.rows.landUse')} value={project.land_use} />}
      {methName
        ? <Row label={t('panel.rows.methodology')} value={methName} />
        : <Row label={t('panel.rows.methodology')} value={t('panel.rows.methodologyNA')} dim />
      }
      {project.vcs_project_page && (
        <div style={{ marginBottom: 6 }}>
          <span style={{ color: '#6b7280' }}>{t('panel.vcsPage')}</span>
          <a href={project.vcs_project_page} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#6ee7b7', textDecoration: 'none' }}>
            {t('panel.viewLink')}
          </a>
        </div>
      )}
      {selectedActivity && !canClassifyManagement(project) && (
        <div style={{ fontSize: 11, color: '#6b7280', background: '#1a2a1e', padding: '4px 8px', borderRadius: 4, marginBottom: 8 }}>
          {t('panel.mgmtNotClassified')}
        </div>
      )}

      {/* Ecology */}
      {(project.ecosystem_type?.length || project.project_size_ha !== undefined || project.co_benefits?.length) ? (
        <>
          <SectionHeader>{t('panel.sections.ecology')}</SectionHeader>
          {project.ecosystem_type && project.ecosystem_type.length > 0 && (
            <Row label={t('panel.rows.ecosystem')} value={project.ecosystem_type.join(', ')} />
          )}
          {project.project_size_ha !== undefined && (
            <Row label={t('panel.rows.projectSize')} value={`${project.project_size_ha.toLocaleString()} ha`} />
          )}
          {project.co_benefits && project.co_benefits.length > 0 && (
            <Row label={t('panel.rows.coBenefits')} value={project.co_benefits.join(', ')} />
          )}
        </>
      ) : null}

      {/* Timeline */}
      {(project.start_date || project.end_date || project.project_duration) ? (
        <>
          <SectionHeader>{t('panel.sections.timeline')}</SectionHeader>
          {project.start_date && <Row label={t('panel.rows.start')} value={project.start_date} />}
          {project.end_date && <Row label={t('panel.rows.end')} value={project.end_date} />}
          {project.project_duration && <Row label={t('panel.rows.duration')} value={project.project_duration} />}
        </>
      ) : null}

      {/* Stakeholders */}
      {(project.developer?.name || project.verifier?.name || project.operator?.name) ? (
        <>
          <SectionHeader>{t('panel.sections.stakeholders')}</SectionHeader>
          {project.developer?.name && <Row label={t('panel.rows.developer')} value={project.developer.name} />}
          {project.operator?.name && <Row label={t('panel.rows.operator')} value={project.operator.name} />}
          {project.verifier?.name && <Row label={t('panel.rows.verifier')} value={project.verifier.name} />}
        </>
      ) : null}

      {/* Registry link */}
      {project.marketplace_url && (
        <a
          href={project.marketplace_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'block', marginTop: 12, marginBottom: 10, fontSize: 11, color: '#6ee7b7', textDecoration: 'none' }}
        >
          {t('panel.viewOnRegistry')}
        </a>
      )}

      <ActivitySelect
        value={selectedActivity}
        onChange={setSelectedActivity}
        label={t('explore.activityLabel')}
        selectStyle={{ marginBottom: 0 }}
      />

      <ScoreWidget
        project={project}
        selectedActivity={selectedActivity}
        onScored={onScored}
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProjectPanel({
  allProjects,
  visibleProjects,
  viewportBounds,
  selectedId,
  onSelect,
  filters,
  onFiltersChange,
  scores,
  onScored,
  search,
  onSearchChange,
  dimMode,
  onDimModeChange,
}: Props) {
  const { t } = useTranslation();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const availableRegions = useMemo(
    () => [...new Set(allProjects.map((p) => jurisdictionLabel(p.jurisdiction)).filter(Boolean))].sort(),
    [allProjects]
  );

  const availableCreditClasses = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of allProjects) {
      if (p.credit_class_id && !seen.has(p.credit_class_id)) {
        seen.set(p.credit_class_id, p.credit_class ?? p.credit_class_id);
      }
    }
    return [...seen.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, name]) => ({ id, name }));
  }, [allProjects]);

  /**
   * Synonym map: raw activity strings in project metadata → canonical display label.
   * "Prescribed Grazing", "Perscribed Grazing" (typo in source data), and
   * "Managed Grazing" are treated as the same activity and shown as one option.
   */
  const ACTIVITY_SYNONYMS: Record<string, string> = {
    'Prescribed Grazing':  'Prescribed / Managed Grazing',
    'Perscribed Grazing':  'Prescribed / Managed Grazing', // typo variant present in real data
    'Managed Grazing':     'Prescribed / Managed Grazing',
  };

  /** Unique activities from project_activities — synonyms collapsed into one label */
  const availableActivities = useMemo(
    () => {
      const raw = allProjects.flatMap((p) => p.project_activities ?? []).filter(Boolean);
      const normalized = raw.map((a) => ACTIVITY_SYNONYMS[a] ?? a);
      return [...new Set(normalized)].sort();
    },
    [allProjects] // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** Unique methodology names from methodology.name + vcs_methodology.name */
  const availableMethodologies = useMemo(() => {
    const seen = new Set<string>();
    for (const p of allProjects) {
      if (p.methodology?.name)     seen.add(p.methodology.name);
      if (p.vcs_methodology?.name) seen.add(p.vcs_methodology.name);
    }
    return [...seen].sort();
  }, [allProjects]);

  /** Unique non-empty status values present in loaded projects */
  const availableStatuses = useMemo(
    () =>
      [...new Set(allProjects.map((p) => p.status).filter((s): s is string => !!s))].sort(),
    [allProjects]
  );

  // Viewport restriction applied to visibleProjects
  const inView = useMemo(() => {
    if (!viewportBounds) return visibleProjects;
    return visibleProjects.filter((p) => {
      if (p.location.type === 'unknown') return false;
      return isInViewport(p, viewportBounds);
    });
  }, [visibleProjects, viewportBounds]);

  const unknownGeo = useMemo(
    () => allProjects.filter((p) => p.location.type === 'unknown'),
    [allProjects]
  );

  const selectedProject = useMemo(
    () => (selectedId ? allProjects.find((p) => p.id === selectedId) ?? null : null),
    [allProjects, selectedId]
  );

  const hasScores   = Object.keys(scores).length > 0;
  const anyFilter   = !!filters.activity || !!filters.methodology || !!filters.issuanceStatus ||
                      !!filters.region   || !!filters.creditClass || filters.minScore > 0;
  const anyActive   = anyFilter || !!search;

  const containerStyle: React.CSSProperties = {
    width: 300, minWidth: 300, height: '100%',
    background: '#0d1a10', borderRight: '1px solid #1a2a1e',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  };

  // ── Detail view ──────────────────────────────────────────────────────────
  if (selectedProject) {
    return (
      <div style={containerStyle}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #1a2a1e', flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#4fb573', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {t('panel.detailHeader')}
          </div>
        </div>
        <ProjectDetail
          project={selectedProject}
          score={scores[selectedProject.id]}
          onClose={() => onSelect(selectedProject)}
          onScored={(s) => onScored(selectedProject.id, s)}
        />
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <div style={containerStyle}>
      {/* Header + search */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #1a2a1e', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f9fafb', marginBottom: 8 }}>
          {t('panel.header')}
        </div>
        <input
          type="text"
          placeholder={t('panel.searchPlaceholder')}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '5px 8px',
            borderRadius: 5, border: '1px solid #253428',
            background: '#1a2a1e', color: '#f9fafb', fontSize: 12, marginBottom: 6,
          }}
        />

        {/* Controls row: Filters toggle + Results count + Dim toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            style={{
              fontSize: 11,
              color: filtersOpen ? '#4fb573' : '#9ca3af',
              background: filtersOpen ? '#0d2818' : '#151f17',
              border: `1px solid ${filtersOpen ? '#2d6040' : '#2a3830'}`,
              borderRadius: 4,
              padding: '3px 8px',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'all 0.12s',
            }}
            onMouseEnter={(e) => {
              if (!filtersOpen) {
                (e.currentTarget as HTMLButtonElement).style.color = '#b3d9bb';
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#253428';
              }
            }}
            onMouseLeave={(e) => {
              if (!filtersOpen) {
                (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af';
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#2a3830';
              }
            }}
          >
            {filtersOpen ? '▲' : '▼'} {t('panel.filters')}
            {anyFilter && <span style={{ marginLeft: 4, color: '#4fb573' }}>●</span>}
          </button>

          <span style={{
            fontSize: 11,
            color: anyActive && visibleProjects.length < allProjects.length ? '#f59e0b' : '#6b7280',
          }}>
            {t('panel.results', { visible: visibleProjects.length, total: allProjects.length })}
          </span>

          {/* Dim toggle — moves non-matching from hidden to dimmed on map */}
          <button
            onClick={() => onDimModeChange(!dimMode)}
            title={dimMode ? t('panel.dimOnTitle') : t('panel.dimOffTitle')}
            style={{
              marginLeft: 'auto',
              fontSize: 10,
              color: dimMode ? '#f59e0b' : '#4a6650',
              background: dimMode ? '#451a03' : 'transparent',
              border: `1px solid ${dimMode ? '#854d0e' : '#253428'}`,
              borderRadius: 4,
              padding: '3px 7px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {dimMode ? t('panel.dimming') : t('panel.dimOff')}
          </button>
        </div>
      </div>

      {/* Filters (collapsible) */}
      {filtersOpen && (
        <MarketplaceFilters
          filters={filters}
          onChange={onFiltersChange}
          availableRegions={availableRegions}
          availableCreditClasses={availableCreditClasses}
          availableActivities={availableActivities}
          availableMethodologies={availableMethodologies}
          availableStatuses={availableStatuses}
          hasScores={hasScores}
        />
      )}

      {/* Viewport count */}
      <div style={{ padding: '6px 12px', fontSize: 11, color: '#6b7280', borderBottom: '1px solid #1a2a1e', flexShrink: 0 }}>
        {t('panel.inViewport', { count: inView.length })}{!viewportBounds ? t('panel.loadingMap') : ''}
      </div>

      {/* Project list */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {inView.length === 0 && visibleProjects.length > 0 && allProjects.length > 0 && (
          <div style={{ padding: 16, color: '#6b7280', fontSize: 12, textAlign: 'center' }}>
            {t('panel.noMatchViewport')}
          </div>
        )}
        {visibleProjects.length === 0 && allProjects.length > 0 && (
          <div style={{ padding: 16, color: '#6b7280', fontSize: 12, textAlign: 'center' }}>
            {t('panel.noMatchFilters')}
          </div>
        )}

        {inView.map((p) => (
          <ProjectRow
            key={p.id}
            project={p}
            isSelected={p.id === selectedId}
            onClick={() => onSelect(p)}
            score={scores[p.id]}
            noMetadataLabel={t('panel.noMetadata')}
          />
        ))}

        {/* Projects missing geodata (shown unfiltered — separate section) */}
        {unknownGeo.length > 0 && (
          <details style={{ margin: '8px 0' }}>
            <summary style={{ padding: '6px 12px', fontSize: 11, color: '#6b7280', cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>▸</span> {t('panel.missingGeodata', { count: unknownGeo.length })}
            </summary>
            {unknownGeo.map((p) => (
              <ProjectRow
                key={p.id}
                project={p}
                isSelected={p.id === selectedId}
                onClick={() => onSelect(p)}
                score={scores[p.id]}
                noMetadataLabel={t('panel.noMetadata')}
              />
            ))}
          </details>
        )}
      </div>
    </div>
  );
}
