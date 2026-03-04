'use client';

/**
 * Root page — Map-first layout with two primary tabs.
 *
 * Layout:
 *   ┌────────────────────────────────────────────────┐
 *   │  NavHeader: logo  [TopTabs]  status            │
 *   ├────────────────────────────────────────────────┤
 *   │  MarketplaceStatsBar (Marketplace tab only)    │
 *   ├──────────┬─────────────────────────────────────┤
 *   │  Panel   │  MapView (fills remaining space)    │
 *   │  (300px) │  + draw overlay (Explore tab)       │
 *   │          │  + legend overlay (Marketplace tab) │
 *   └──────────┴─────────────────────────────────────┘
 *
 * State:
 *   appTab       — 'marketplace' | 'explore'
 *   search       — text search query (lifted from ProjectPanel)
 *   dimMode      — false=hard-filter map, true=dim non-matching on map
 *   drawnAOI     — drawn polygon for Mode B (null = none)
 *   scores       — Record<projectId, score_0_100> for min-score filter
 *   filters      — buyer filter state for Mode A
 *   visibleProjects — allProjects filtered by (search + filters + scores)
 *   fadedIds     — Set of project IDs to dim on map (dimMode only)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { MarketplaceProject, MarketplaceProjectsResponse } from '@/lib/marketplace/types';
import type { AOIGeometry } from '@/lib/scoring/types';
import { NavHeader }            from './components/NavHeader';
import { TopTabs, type AppTab } from './components/TopTabs';
import { ProjectPanel }         from './components/ProjectPanel';
import { MapView }              from './components/MapView';
import { ExplorePanel }         from './components/ExplorePanel';
import { MarketplaceStatsBar }  from './components/MarketplaceStatsBar';
import { DEFAULT_FILTERS, type MarketplaceFilterState } from './components/MarketplaceFilters';

// ── Shared filter helpers ─────────────────────────────────────────────────────

function jurisdictionLabel(code: string | undefined): string {
  if (!code) return '';
  return code.split('-')[0];
}

export default function Home() {
  const { t } = useTranslation();

  // ── Data ──────────────────────────────────────────────────────────────────
  const [projects, setProjects]   = useState<MarketplaceProject[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  // ── Map state ─────────────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewportBounds, setViewportBounds] = useState<{
    west: number; south: number; east: number; north: number;
  } | null>(null);

  // ── App mode ──────────────────────────────────────────────────────────────
  const [appTab, setAppTab] = useState<AppTab>('marketplace');

  // ── Mode B: AOI draw state ─────────────────────────────────────────────────
  const [drawnAOI, setDrawnAOI] = useState<{
    polygon: AOIGeometry;
    area_ha: number;
  } | null>(null);

  // ── Mode A: buyer filters + search (lifted from ProjectPanel) ──────────────
  const [filters, setFilters] = useState<MarketplaceFilterState>(DEFAULT_FILTERS);
  const [search,  setSearch]  = useState('');

  // ── Map dimming toggle (dim unmatched vs hard-hide) ────────────────────────
  const [dimMode, setDimMode] = useState(false);

  // ── Scores (projectId → score_0_100) for min-score filter ─────────────────
  const [scores, setScores] = useState<Record<string, number>>({});

  // ── Fetch projects ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/marketplace/projects')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<MarketplaceProjectsResponse>;
      })
      .then((data) => { setProjects(data.projects); setLoading(false); })
      .catch((err: Error) => { setError(err.message); setLoading(false); });
  }, []);

  // ── visibleProjects — single source of truth for what passes the filter ────
  const visibleProjects = useMemo(() => {
    return projects.filter((p) => {
      // Text search — matches name, place, credit class, methodology, land use, ecosystem
      if (search) {
        const q = search.toLowerCase();
        const hit =
          p.name.toLowerCase().includes(q) ||
          (p.place_name ?? '').toLowerCase().includes(q) ||
          (p.administrative_area ?? '').toLowerCase().includes(q) ||
          (p.credit_class ?? '').toLowerCase().includes(q) ||
          (p.credit_class_id ?? '').toLowerCase().includes(q) ||
          (p.project_type ?? '').toLowerCase().includes(q) ||
          (p.methodology?.name ?? '').toLowerCase().includes(q) ||
          (p.vcs_methodology?.name ?? '').toLowerCase().includes(q) ||
          (p.land_use ?? '').toLowerCase().includes(q) ||
          (p.ecosystem_type ?? []).some((t) => t.toLowerCase().includes(q));
        if (!hit) return false;
      }
      // Activity: match against project.project_activities field (from IRI metadata).
      // "Prescribed / Managed Grazing" is the canonical label for all grazing synonyms,
      // including the "Perscribed Grazing" typo variant that appears in the real data.
      if (filters.activity) {
        const projectActivities = p.project_activities ?? [];
        const matchValues =
          filters.activity === 'Prescribed / Managed Grazing'
            ? ['Prescribed Grazing', 'Perscribed Grazing', 'Managed Grazing']
            : [filters.activity];
        if (!matchValues.some((v) => projectActivities.includes(v))) return false;
      }
      // Credit class (exact raw code match)
      if (filters.creditClass) {
        if ((p.credit_class_id ?? '') !== filters.creditClass) return false;
      }
      // Methodology: exact match against methodology/vcs_methodology name (or substring for typed text)
      if (filters.methodology) {
        const q = filters.methodology.toLowerCase();
        const meth = (p.methodology?.name ?? '') + ' ' + (p.vcs_methodology?.name ?? '');
        if (!meth.toLowerCase().includes(q)) return false;
      }
      // Issuance status (exact match against project.status)
      if (filters.issuanceStatus) {
        if ((p.status ?? '') !== filters.issuanceStatus) return false;
      }
      // Region (ISO country prefix)
      if (filters.region) {
        if (jurisdictionLabel(p.jurisdiction) !== filters.region) return false;
      }
      // Min suitability score — treat unscored projects as NOT matching
      if (filters.minScore > 0) {
        const s = scores[p.id];
        if (s === undefined || s < filters.minScore) return false;
      }
      return true;
    });
  }, [projects, search, filters, scores]);

  // ── fadedIds — set of IDs to dim on map when dimMode is on ────────────────
  const fadedIds = useMemo((): Set<string> | undefined => {
    if (!dimMode) return undefined;
    const vis = new Set(visibleProjects.map((p) => p.id));
    return new Set(projects.filter((p) => !vis.has(p.id)).map((p) => p.id));
  }, [dimMode, projects, visibleProjects]);

  // ── Tab switch ────────────────────────────────────────────────────────────
  const handleTabChange = useCallback((tab: AppTab) => {
    setAppTab(tab);
    if (tab === 'explore')      setSelectedId(null);
    if (tab === 'marketplace')  setDrawnAOI(null);
  }, []);

  // ── Map callbacks ─────────────────────────────────────────────────────────
  const handleProjectSelect = useCallback((project: MarketplaceProject) => {
    setSelectedId((prev) => (prev === project.id ? null : project.id));
  }, []);

  const handleBoundsChange = useCallback(
    (bounds: { west: number; south: number; east: number; north: number }) => {
      setViewportBounds(bounds);
    },
    []
  );

  // ── AOI callbacks ─────────────────────────────────────────────────────────
  const handleAOIDrawn = useCallback((polygon: AOIGeometry, area_ha: number) => {
    setDrawnAOI({ polygon, area_ha });
  }, []);

  const handleAOIClear = useCallback(() => {
    setDrawnAOI(null);
  }, []);

  // ── Score callback ────────────────────────────────────────────────────────
  const handleScored = useCallback((projectId: string, score: number) => {
    setScores((prev) => ({ ...prev, [projectId]: score }));
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  const statusSlot = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <TopTabs activeTab={appTab} onChange={handleTabChange} projectCount={projects.length} />
      <span style={{ width: 1, height: 24, background: '#1e3020', margin: '0 8px', flexShrink: 0 }} />
      {loading  && <span style={{ fontSize: 11, color: '#d4a500', fontWeight: 600 }}>{t('status.loading')}</span>}
      {error    && <span style={{ fontSize: 11, color: '#f87171', fontWeight: 600 }}>⚠ {error}</span>}
      {!loading && !error && <span style={{ fontSize: 11, color: '#4a6650', fontWeight: 500 }}>{t('status.projects_count', { count: projects.length })}</span>}
    </div>
  );

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0f1a12', color: '#e8f5ec', fontFamily: "'Mulish', sans-serif" }}>
      <NavHeader currentRoute="/" statusSlot={statusSlot} />

      {appTab === 'marketplace' && (
        <MarketplaceStatsBar projectCount={projects.length} />
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {appTab === 'marketplace' ? (
          <ProjectPanel
            allProjects={projects}
            visibleProjects={visibleProjects}
            viewportBounds={viewportBounds}
            selectedId={selectedId}
            onSelect={handleProjectSelect}
            filters={filters}
            onFiltersChange={setFilters}
            scores={scores}
            onScored={handleScored}
            search={search}
            onSearchChange={setSearch}
            dimMode={dimMode}
            onDimModeChange={setDimMode}
          />
        ) : (
          <ExplorePanel drawnAOI={drawnAOI} onClear={handleAOIClear} />
        )}

        <MapView
          projects={dimMode ? projects : visibleProjects}
          fadedIds={fadedIds}
          selectedId={selectedId}
          onProjectSelect={handleProjectSelect}
          onBoundsChange={handleBoundsChange}
          mode={appTab}
          onAOIDrawn={handleAOIDrawn}
          onAOIClear={handleAOIClear}
          hasDrawnAOI={drawnAOI !== null}
        />
      </div>
    </div>
  );
}
