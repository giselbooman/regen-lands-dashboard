'use client';

/**
 * MapView — full-viewport MapLibre GL map.
 *
 * Features:
 *   - Stadia Alidade Smooth Dark tiles (NEXT_PUBLIC_STADIA_API_KEY)
 *   - Falls back to blank OSM raster tiles if key is not set
 *   - GeoJSON source with clustering
 *   - Mode A (marketplace): click project → popup + onProjectSelect
 *   - Mode B (explore):     native polygon draw tool, emits onAOIDrawn / onAOIClear
 *   - Activity-driven dimming: dims non-classifiable points in Mode A when grazing activity active
 *   - MarketplaceMapLegend overlay
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import type { MarketplaceProject } from '@/lib/marketplace/types';
import type { AOIGeometry } from '@/lib/scoring/types';
import { buildPopupHTML } from './ProjectPopup';
import { geometryCentroid } from '@/lib/geo/centroid';
import { MarketplaceMapLegend } from './MarketplaceMapLegend';

// MapLibre is a client-only library — dynamic import via useEffect
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MaplibreMap = any;

interface Props {
  projects: MarketplaceProject[];
  selectedId: string | null;
  onProjectSelect: (project: MarketplaceProject) => void;
  onBoundsChange: (bounds: { west: number; south: number; east: number; north: number }) => void;
  /** App mode: "marketplace" = browse projects, "explore" = draw polygon AOI */
  mode: 'marketplace' | 'explore';
  /** IDs of projects to dim on the map (when dimMode is on). undefined = no dimming. */
  fadedIds?: Set<string>;
  /** Called when a polygon AOI is drawn (explore mode) */
  onAOIDrawn: (polygon: AOIGeometry, area_ha: number) => void;
  /** Called when the drawn AOI is cleared */
  onAOIClear: () => void;
  /** True when the parent has a drawn AOI; false means it was cleared externally */
  hasDrawnAOI: boolean;
}

const SOURCE_ID           = 'projects';
const LAYER_CLUSTERS      = 'clusters';
const LAYER_CLUSTER_COUNT = 'cluster-count';
const LAYER_UNCLUSTERED   = 'unclustered-point';
const LAYER_SELECTED      = 'selected-point';

const DRAW_SOURCE         = 'draw-aoi';
const DRAW_PREVIEW_SOURCE = 'draw-preview';
const DRAW_FILL_LAYER     = 'draw-aoi-fill';
const DRAW_LINE_LAYER     = 'draw-aoi-line';
const DRAW_VERTEX_LAYER   = 'draw-aoi-vertices';
const DRAW_PREVIEW_LAYER  = 'draw-aoi-preview';

/** Deterministic color per credit class prefix */
function classColor(creditClass?: string): string {
  const p: Record<string, string> = {
    BT: '#a78bfa', C0: '#60a5fa', C1: '#60a5fa', C2: '#60a5fa',
    C3: '#60a5fa', C5: '#60a5fa', C6: '#60a5fa', C7: '#60a5fa',
    C8: '#60a5fa', KS: '#34d399', MB: '#22d3ee', US: '#f472b6',
  };
  return p[(creditClass ?? '').slice(0, 2).toUpperCase()] ?? '#9ca3af';
}

/** Polygon area in hectares via shoelace + haversine (≈ ±2% accuracy). */
function polygonAreaHa(pts: [number, number][]): number {
  const R = 6_371_009;
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const avgLat = ((pts[i][1] + pts[j][1]) / 2) * (Math.PI / 180);
    const x1 = pts[i][0] * (Math.PI / 180) * R * Math.cos(avgLat);
    const y1 = pts[i][1] * (Math.PI / 180) * R;
    const x2 = pts[j][0] * (Math.PI / 180) * R * Math.cos(avgLat);
    const y2 = pts[j][1] * (Math.PI / 180) * R;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2) / 10_000;
}

function emptyFC() {
  return { type: 'FeatureCollection' as const, features: [] as unknown[] };
}

export function MapView({
  projects, selectedId, onProjectSelect, onBoundsChange,
  mode, fadedIds, onAOIDrawn, onAOIClear, hasDrawnAOI,
}: Props) {
  const containerRef       = useRef<HTMLDivElement>(null);
  const mapRef             = useRef<MaplibreMap>(null);
  const popupRef           = useRef<MaplibreMap>(null);
  const latestProjectsRef  = useRef<MarketplaceProject[]>(projects);

  // Draw state refs (no re-render during interactive draw)
  const drawPointsRef      = useRef<[number, number][]>([]);
  const drawActiveRef      = useRef(false);
  const drawCompletedRef   = useRef(false);
  const lastDblClickRef    = useRef(0);
  const pulseIntervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stable callback refs
  const modeRef            = useRef(mode);
  const onAOIDrawnRef      = useRef(onAOIDrawn);
  const onAOIClearRef      = useRef(onAOIClear);

  // Stable ref for fadedIds (accessed inside map event callbacks)
  const fadedIdsRef = useRef<Set<string>>(new Set());

  // React state for draw button / count display only
  const [drawActive,    setDrawActive]    = useState(false);
  const [drawPtCount,   setDrawPtCount]   = useState(0);

  useEffect(() => { modeRef.current       = mode; },       [mode]);
  useEffect(() => { onAOIDrawnRef.current = onAOIDrawn; }, [onAOIDrawn]);
  useEffect(() => { onAOIClearRef.current = onAOIClear; },  [onAOIClear]);

  // ── Build GeoJSON FeatureCollection ───────────────────────────────────────
  const buildFC = useCallback((projs: MarketplaceProject[], faded?: Set<string>) => {
    const features = projs
      .filter((p) => p.location.type !== 'unknown')
      .map((p) => {
        let lon: number, lat: number;
        if (p.location.type === 'point' && p.location.lat !== undefined && p.location.lon !== undefined) {
          lon = p.location.lon; lat = p.location.lat;
        } else if (p.location.type === 'polygon' && p.location.geometry) {
          [lon, lat] = geometryCentroid(p.location.geometry);
        } else { return null; }
        return {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [lon, lat] },
          properties: {
            id: p.id, name: p.name,
            credit_class: p.credit_class ?? '',
            precision: p.location.precision,
            color: classColor(p.credit_class),
            faded: faded?.has(p.id) ? 1 : 0,
          },
        };
      }).filter(Boolean);
    return { type: 'FeatureCollection' as const, features };
  }, []);

  // ── Sync draw sources ─────────────────────────────────────────────────────
  const syncDraw = useCallback((map: MaplibreMap, preview?: [number, number]) => {
    const pts   = drawPointsRef.current;
    const done  = drawCompletedRef.current;
    const ds = map.getSource(DRAW_SOURCE);
    const ps = map.getSource(DRAW_PREVIEW_SOURCE);
    if (!ds || !ps) return;

    const feats: unknown[] = [];
    feats.push(...pts.map((c, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: { kind: 'v', i } })));
    if (pts.length >= 2) {
      feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: done ? [...pts, pts[0]] : pts }, properties: { kind: 'ol' } });
    }
    if (done && pts.length >= 3) {
      feats.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...pts, pts[0]]] }, properties: { kind: 'fill' } });
    }
    ds.setData({ type: 'FeatureCollection', features: feats });

    if (drawActiveRef.current && pts.length >= 1 && preview) {
      ps.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [pts[pts.length - 1], preview] }, properties: {} }] });
    } else {
      ps.setData(emptyFC());
    }
  }, []);

  // ── Clear draw ────────────────────────────────────────────────────────────
  const clearDraw = useCallback((map: MaplibreMap | null) => {
    drawPointsRef.current   = [];
    drawActiveRef.current   = false;
    drawCompletedRef.current = false;
    setDrawActive(false);
    setDrawPtCount(0);
    if (map) {
      map.getSource(DRAW_SOURCE)?.setData(emptyFC());
      map.getSource(DRAW_PREVIEW_SOURCE)?.setData(emptyFC());
      map.getCanvas().style.cursor = '';
    }
  }, []);

  // ── Init map (runs once) ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    let map: MaplibreMap;
    let cancelled = false;

    async function init() {
      const ml = await import('maplibre-gl');
      if (cancelled || !containerRef.current) return;

      const key   = process.env.NEXT_PUBLIC_STADIA_API_KEY;
      const style = key
        ? `https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json?api_key=${key}`
        : { version: 8 as const, glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf', sources: { osm: { type: 'raster' as const, tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap', maxzoom: 19 } }, layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }] };

      map = new ml.Map({ container: containerRef.current, style, center: [0, 20], zoom: 2 });
      mapRef.current = map;

      map.on('load', () => {
        const fc = buildFC(latestProjectsRef.current, fadedIdsRef.current);

        // Projects
        map.addSource(SOURCE_ID, { type: 'geojson', data: fc, cluster: true, clusterMaxZoom: 12, clusterRadius: 50 });
        map.addLayer({ id: LAYER_CLUSTERS, type: 'circle', source: SOURCE_ID, filter: ['has', 'point_count'], paint: { 'circle-color': ['step', ['get', 'point_count'], '#4fb573', 10, '#f59e0b', 25, '#f87171'], 'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 25, 30], 'circle-opacity': 0.85 } });
        map.addLayer({ id: LAYER_CLUSTER_COUNT, type: 'symbol', source: SOURCE_ID, filter: ['has', 'point_count'], layout: { 'text-field': '{point_count_abbreviated}', 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'], 'text-size': 13 }, paint: { 'text-color': '#111827' } });
        map.addLayer({ id: LAYER_UNCLUSTERED, type: 'circle', source: SOURCE_ID, filter: ['!', ['has', 'point_count']], paint: { 'circle-color': ['get', 'color'], 'circle-radius': 7, 'circle-stroke-width': 1.5, 'circle-stroke-color': '#1f2937', 'circle-opacity': 0.9 } });
        map.addLayer({ id: LAYER_SELECTED, type: 'circle', source: SOURCE_ID, filter: ['==', 'id', ''], paint: { 'circle-color': 'transparent', 'circle-radius': 12, 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' } });

        // Draw AOI
        map.addSource(DRAW_SOURCE, { type: 'geojson', data: emptyFC() });
        map.addSource(DRAW_PREVIEW_SOURCE, { type: 'geojson', data: emptyFC() });
        map.addLayer({ id: DRAW_FILL_LAYER,    type: 'fill',   source: DRAW_SOURCE,         filter: ['==', ['geometry-type'], 'Polygon'],    paint: { 'fill-color': '#4fb573', 'fill-opacity': 0.12 } });
        map.addLayer({ id: DRAW_LINE_LAYER,    type: 'line',   source: DRAW_SOURCE,         filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#4fb573', 'line-width': 2, 'line-dasharray': [3, 2] } });
        map.addLayer({ id: DRAW_VERTEX_LAYER,  type: 'circle', source: DRAW_SOURCE,         filter: ['==', ['geometry-type'], 'Point'],      paint: { 'circle-color': '#4fb573', 'circle-radius': 5, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } });
        map.addLayer({ id: DRAW_PREVIEW_LAYER, type: 'line',   source: DRAW_PREVIEW_SOURCE, paint: { 'line-color': '#4fb573', 'line-width': 1.5, 'line-dasharray': [2, 3], 'line-opacity': 0.7 } });
      });

      map.on('click', LAYER_UNCLUSTERED, (e: MaplibreMap) => {
        if (drawActiveRef.current || modeRef.current !== 'marketplace') return;
        const feat = e.features?.[0];
        if (!feat) return;
        const proj = latestProjectsRef.current.find((p) => p.id === feat.properties.id);
        if (!proj) return;
        onProjectSelect(proj);
        if (popupRef.current) popupRef.current.remove();
        popupRef.current = new ml.Popup({ closeButton: true, maxWidth: '300px', className: 'regen-popup' }).setLngLat(feat.geometry.coordinates).setHTML(buildPopupHTML(proj)).addTo(map);
      });

      map.on('click', LAYER_CLUSTERS, (e: MaplibreMap) => {
        if (drawActiveRef.current) return;
        const feats = map.queryRenderedFeatures(e.point, { layers: [LAYER_CLUSTERS] });
        if (!feats.length) return;
        const clusterId = feats[0].properties.cluster_id;
        map.getSource(SOURCE_ID).getClusterExpansionZoom(clusterId, (err: Error, zoom: number) => {
          if (err) return;
          map.easeTo({ center: feats[0].geometry.coordinates, zoom });
        });
      });

      map.on('mouseenter', LAYER_CLUSTERS,    () => { if (!drawActiveRef.current) map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', LAYER_CLUSTERS,    () => { if (!drawActiveRef.current) map.getCanvas().style.cursor = ''; });
      map.on('mouseenter', LAYER_UNCLUSTERED, () => { if (!drawActiveRef.current) map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', LAYER_UNCLUSTERED, () => { if (!drawActiveRef.current) map.getCanvas().style.cursor = ''; });

      // Draw: click = add vertex
      map.on('click', (e: MaplibreMap) => {
        if (!drawActiveRef.current) return;
        if (Date.now() - lastDblClickRef.current < 300) return;
        const pt: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        drawPointsRef.current = [...drawPointsRef.current, pt];
        setDrawPtCount(drawPointsRef.current.length);
        syncDraw(map);
      });

      // Draw: dblclick = close polygon
      map.on('dblclick', (e: MaplibreMap) => {
        if (!drawActiveRef.current) return;
        e.preventDefault();
        lastDblClickRef.current = Date.now();
        const pts = drawPointsRef.current;
        if (pts.length < 3) return;
        drawActiveRef.current   = false;
        drawCompletedRef.current = true;
        setDrawActive(false);
        map.getCanvas().style.cursor = '';
        syncDraw(map);
        onAOIDrawnRef.current(
          { type: 'Polygon', coordinates: [[...pts, pts[0]]] },
          polygonAreaHa(pts)
        );
      });

      // Draw: mousemove = rubber band
      map.on('mousemove', (e: MaplibreMap) => {
        if (!drawActiveRef.current) return;
        syncDraw(map, [e.lngLat.lng, e.lngLat.lat]);
      });

      // Esc = cancel draw
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape' && drawActiveRef.current) {
          clearDraw(map);
          onAOIClearRef.current();
        }
      };
      window.addEventListener('keydown', onKey);

      const emitBounds = () => {
        const b = map.getBounds();
        onBoundsChange({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
      };
      map.on('moveend', emitBounds);
      map.on('load', emitBounds);

      (map as Record<string, unknown>).__cleanupKey = onKey;
    }

    init();
    return () => {
      cancelled = true;
      if (popupRef.current) { popupRef.current.remove(); popupRef.current = null; }
      if (mapRef.current) {
        const m = mapRef.current;
        const k = (m as Record<string, unknown>).__cleanupKey as ((ev: KeyboardEvent) => void) | undefined;
        if (k) window.removeEventListener('keydown', k);
        m.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push updated projects data (also re-applies current faded state)
  useEffect(() => {
    latestProjectsRef.current = projects;
    const map = mapRef.current;
    if (!map?.isStyleLoaded?.()) return;
    map.getSource(SOURCE_ID)?.setData(buildFC(projects, fadedIdsRef.current));
  }, [projects, buildFC]);

  // Highlight selected point + pan map to it + pulse animation
  useEffect(() => {
    const map = mapRef.current;

    // Clear any existing pulse
    if (pulseIntervalRef.current) {
      clearInterval(pulseIntervalRef.current);
      pulseIntervalRef.current = null;
    }

    if (!map?.isStyleLoaded?.()) return;
    if (!map.getLayer(LAYER_SELECTED)) return;

    if (!selectedId) {
      map.setFilter(LAYER_SELECTED, ['==', 'id', '']);
      map.setPaintProperty(LAYER_SELECTED, 'circle-radius', 12);
      map.setPaintProperty(LAYER_SELECTED, 'circle-stroke-width', 3);
      return;
    }

    // Show selection ring
    map.setFilter(LAYER_SELECTED, ['==', 'id', selectedId]);

    // Pan map to the selected project
    const proj = latestProjectsRef.current.find((p) => p.id === selectedId);
    if (proj) {
      let lon: number | undefined, lat: number | undefined;
      if (proj.location.type === 'point' && proj.location.lat !== undefined && proj.location.lon !== undefined) {
        lon = proj.location.lon; lat = proj.location.lat;
      } else if (proj.location.type === 'polygon' && proj.location.geometry) {
        [lon, lat] = geometryCentroid(proj.location.geometry);
      }
      if (lon !== undefined && lat !== undefined) {
        map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 5), duration: 900 });
      }
    }

    // Pulse animation — oscillate circle-radius via setInterval (MapLibre doesn't support CSS animations)
    let tick = 0;
    pulseIntervalRef.current = setInterval(() => {
      const m = mapRef.current;
      if (!m?.getLayer?.(LAYER_SELECTED)) return;
      const phase = (tick % 40) / 40; // 0→1 over 2s at 50ms/tick
      const r     = 10 + 10 * Math.abs(Math.sin(phase * Math.PI));
      const sw    = 2  + 2  * Math.abs(Math.sin(phase * Math.PI));
      m.setPaintProperty(LAYER_SELECTED, 'circle-radius', r);
      m.setPaintProperty(LAYER_SELECTED, 'circle-stroke-width', sw);
      tick++;
    }, 50);

    return () => {
      if (pulseIntervalRef.current) {
        clearInterval(pulseIntervalRef.current);
        pulseIntervalRef.current = null;
      }
    };
  }, [selectedId]);

  // Dimming: sync fadedIds → faded property on GeoJSON features + paint opacity
  useEffect(() => {
    fadedIdsRef.current = fadedIds ?? new Set();
    const map = mapRef.current;
    if (!map?.isStyleLoaded?.()) return;
    // Rebuild source data with updated faded flags
    map.getSource(SOURCE_ID)?.setData(buildFC(latestProjectsRef.current, fadedIds));
    // Update paint properties
    if (!map.getLayer(LAYER_UNCLUSTERED)) return;
    const hasFaded = (fadedIds?.size ?? 0) > 0;
    map.setPaintProperty(LAYER_UNCLUSTERED, 'circle-opacity',
      hasFaded ? ['case', ['==', ['get', 'faded'], 1], 0.12, 0.9] : 0.9
    );
    map.setPaintProperty(LAYER_UNCLUSTERED, 'circle-stroke-opacity',
      hasFaded ? ['case', ['==', ['get', 'faded'], 1], 0.15, 1.0] : 1.0
    );
  }, [fadedIds, buildFC]);

  // Mode switch → clear draw on marketplace
  useEffect(() => {
    if (mode === 'marketplace' && (drawActiveRef.current || drawCompletedRef.current)) {
      clearDraw(mapRef.current);
    }
  }, [mode, clearDraw]);

  // External clear (ExplorePanel "Clear AOI")
  useEffect(() => {
    if (!hasDrawnAOI && drawCompletedRef.current) clearDraw(mapRef.current);
  }, [hasDrawnAOI, clearDraw]);

  // Toggle draw button
  const handleDrawToggle = useCallback(() => {
    const map = mapRef.current;
    if (drawActiveRef.current) {
      clearDraw(map);
      onAOIClearRef.current();
    } else if (drawCompletedRef.current) {
      clearDraw(map);
      onAOIClearRef.current();
    } else {
      drawActiveRef.current    = true;
      drawPointsRef.current    = [];
      drawCompletedRef.current = false;
      setDrawActive(true);
      setDrawPtCount(0);
      if (map) map.getCanvas().style.cursor = 'crosshair';
    }
  }, [clearDraw]);

  return (
    <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Draw controls (Explore mode only) */}
      {mode === 'explore' && (
        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          <button
            onClick={handleDrawToggle}
            style={{
              padding: '7px 14px',
              borderRadius: 6,
              border: '1px solid',
              borderColor: drawActive ? '#ef4444' : '#0d2e18',
              background: drawActive ? '#7f1d1d' : '#0d2e18',
              color: drawActive ? '#fca5a5' : '#4fb573',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}
          >
            {drawActive ? '✕ Cancel' : drawCompletedRef.current ? '⊠ Clear AOI' : '⬡ Draw AOI'}
          </button>

          {drawActive && (
            <div style={{ background: 'rgba(9,20,16,0.92)', border: '1px solid #1e3020', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#9ca3af', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
              {drawPtCount === 0 ? 'Click to start drawing' : drawPtCount < 3 ? `${drawPtCount} point${drawPtCount > 1 ? 's' : ''} placed — need ≥3` : `${drawPtCount} points — double-click to close`}
            </div>
          )}
        </div>
      )}

      {/* Map legend (Marketplace mode only) */}
      {mode === 'marketplace' && <MarketplaceMapLegend dimActive={(fadedIds?.size ?? 0) > 0} />}
    </div>
  );
}
