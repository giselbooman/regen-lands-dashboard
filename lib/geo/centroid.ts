/**
 * GeoJSON polygon centroid utilities.
 *
 * Used when a project has a polygon geometry and we need a single
 * point for map centering / zoom.
 */

import type { GeoJSONPolygon, GeoJSONMultiPolygon } from '@/lib/marketplace/types';

/**
 * Returns the simple centroid of a GeoJSON Polygon's outer ring.
 * (average of all vertex coordinates — sufficient for point-on-map purposes)
 */
export function polygonCentroid(poly: GeoJSONPolygon): [number, number] {
  const ring = poly.coordinates[0];
  if (!ring || ring.length === 0) return [0, 0];

  let sumLon = 0;
  let sumLat = 0;
  // Exclude the closing vertex (same as first) if it exists
  const n = ring[ring.length - 1][0] === ring[0][0] &&
            ring[ring.length - 1][1] === ring[0][1]
    ? ring.length - 1
    : ring.length;

  for (let i = 0; i < n; i++) {
    sumLon += ring[i][0];
    sumLat += ring[i][1];
  }
  return [sumLon / n, sumLat / n];
}

/**
 * Returns the centroid of a GeoJSON MultiPolygon.
 * Uses simple average of per-polygon centroids (not area-weighted — sufficient for MVP).
 */
export function multiPolygonCentroid(mp: GeoJSONMultiPolygon): [number, number] {
  if (mp.coordinates.length === 0) return [0, 0];

  let sumLon = 0;
  let sumLat = 0;
  const count = mp.coordinates.length;

  for (const polygonCoords of mp.coordinates) {
    const poly: GeoJSONPolygon = { type: 'Polygon', coordinates: polygonCoords };
    const [lon, lat] = polygonCentroid(poly);
    sumLon += lon;
    sumLat += lat;
  }
  return [sumLon / count, sumLat / count];
}

/**
 * Returns [lon, lat] centroid for either geometry type.
 */
export function geometryCentroid(
  geometry: GeoJSONPolygon | GeoJSONMultiPolygon
): [number, number] {
  if (geometry.type === 'Polygon') return polygonCentroid(geometry);
  return multiPolygonCentroid(geometry);
}

/**
 * Generates a rough square buffer polygon around a lat/lon point.
 * Used to create an AOI for scoring when only a centroid is available.
 *
 * @param lat - latitude in degrees
 * @param lon - longitude in degrees
 * @param radiusKm - buffer radius in kilometers (default 5)
 * @returns GeoJSON Polygon + estimated area in hectares
 */
export function pointBuffer(
  lat: number,
  lon: number,
  radiusKm = 5
): { polygon: GeoJSONPolygon; area_ha: number } {
  // 1 degree latitude ≈ 111 km
  const dLat = radiusKm / 111;
  // 1 degree longitude ≈ 111 km * cos(lat)
  const dLon = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));

  const polygon: GeoJSONPolygon = {
    type: 'Polygon',
    coordinates: [[
      [lon - dLon, lat - dLat],
      [lon + dLon, lat - dLat],
      [lon + dLon, lat + dLat],
      [lon - dLon, lat + dLat],
      [lon - dLon, lat - dLat], // close ring
    ]],
  };

  // Area of square: (2*radiusKm)^2 in km² → × 100 for ha
  const area_ha = (2 * radiusKm) * (2 * radiusKm) * 100;

  return { polygon, area_ha };
}
