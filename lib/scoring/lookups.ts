/**
 * SCORING_V1 — Lookup tables for texture_fit and landcover_compatibility
 *
 * Source of truth: spec/LOOKUPS_V1.md
 * All entries have Rule IDs for traceability in explain blocks.
 * Missing combinations → fallback = 0.5 (TEX-FALLBACK / LC-FALLBACK).
 *
 * NOTE: V1 heuristic — not peer-reviewed agronomic data.
 */

import type { PracticeId, TextureClass, LandcoverClass } from './types';

export interface LookupEntry {
  value: number;
  rule_id: string;
}

const FALLBACK_TEXTURE: LookupEntry  = { value: 0.5, rule_id: 'TEX-FALLBACK' };
const FALLBACK_LANDCOVER: LookupEntry = { value: 0.5, rule_id: 'LC-FALLBACK' };

// ============================================================
// TEXTURE FIT TABLE
// texture_fit[practice][texture_class] → LookupEntry
// ============================================================

const TEXTURE_FIT: Record<PracticeId, Partial<Record<TextureClass, LookupEntry>>> = {
  pasture_grazing: {
    loam:             { value: 0.90, rule_id: 'TEX-01' },
    silt_loam:        { value: 0.85, rule_id: 'TEX-02' },
    clay_loam:        { value: 0.80, rule_id: 'TEX-03' },
    sandy_loam:       { value: 0.75, rule_id: 'TEX-04' },
    silty_clay_loam:  { value: 0.70, rule_id: 'TEX-05' },
    clay:             { value: 0.55, rule_id: 'TEX-06' },
    sand:             { value: 0.40, rule_id: 'TEX-07' },
    loamy_sand:       { value: 0.50, rule_id: 'TEX-08' },
  },
  cover_crops: {
    loam:             { value: 0.95, rule_id: 'TEX-09' },
    silt_loam:        { value: 0.90, rule_id: 'TEX-10' },
    clay_loam:        { value: 0.80, rule_id: 'TEX-11' },
    silty_clay_loam:  { value: 0.75, rule_id: 'TEX-12' },
    sandy_loam:       { value: 0.70, rule_id: 'TEX-13' },
    clay:             { value: 0.60, rule_id: 'TEX-14' },
    sand:             { value: 0.35, rule_id: 'TEX-15' },
    loamy_sand:       { value: 0.45, rule_id: 'TEX-16' },
  },
  agroforestry: {
    loam:             { value: 0.90, rule_id: 'TEX-17' },
    silt_loam:        { value: 0.88, rule_id: 'TEX-18' },
    clay_loam:        { value: 0.82, rule_id: 'TEX-19' },
    silty_clay_loam:  { value: 0.78, rule_id: 'TEX-20' },
    sandy_loam:       { value: 0.72, rule_id: 'TEX-21' },
    clay:             { value: 0.65, rule_id: 'TEX-22' },
    sandy_clay:       { value: 0.60, rule_id: 'TEX-23' },
    sand:             { value: 0.35, rule_id: 'TEX-24' },
    loamy_sand:       { value: 0.45, rule_id: 'TEX-25' },
  },
  no_till: {
    loam:             { value: 0.95, rule_id: 'TEX-26' },
    silt_loam:        { value: 0.92, rule_id: 'TEX-27' },
    clay_loam:        { value: 0.85, rule_id: 'TEX-28' },
    silty_clay_loam:  { value: 0.80, rule_id: 'TEX-29' },
    sandy_loam:       { value: 0.75, rule_id: 'TEX-30' },
    clay:             { value: 0.65, rule_id: 'TEX-31' },
    sand:             { value: 0.40, rule_id: 'TEX-32' },
    silty_clay:       { value: 0.70, rule_id: 'TEX-33' },
  },
  biochar: {
    sand:             { value: 0.90, rule_id: 'TEX-34' }, // biochar most beneficial in coarse soils
    loamy_sand:       { value: 0.85, rule_id: 'TEX-35' },
    sandy_loam:       { value: 0.80, rule_id: 'TEX-36' },
    loam:             { value: 0.70, rule_id: 'TEX-37' },
    silt_loam:        { value: 0.65, rule_id: 'TEX-38' },
    clay:             { value: 0.55, rule_id: 'TEX-39' },
    clay_loam:        { value: 0.60, rule_id: 'TEX-40' },
  },
  reforestation: {
    loam:             { value: 0.90, rule_id: 'TEX-41' },
    silt_loam:        { value: 0.88, rule_id: 'TEX-42' },
    clay_loam:        { value: 0.80, rule_id: 'TEX-43' },
    silty_clay_loam:  { value: 0.75, rule_id: 'TEX-44' },
    sandy_loam:       { value: 0.70, rule_id: 'TEX-45' },
    clay:             { value: 0.60, rule_id: 'TEX-46' },
    sand:             { value: 0.40, rule_id: 'TEX-47' },
  },
  food_forests: {
    loam:             { value: 0.92, rule_id: 'TEX-48' },
    silt_loam:        { value: 0.90, rule_id: 'TEX-49' },
    clay_loam:        { value: 0.82, rule_id: 'TEX-50' },
    silty_clay_loam:  { value: 0.78, rule_id: 'TEX-51' },
    sandy_loam:       { value: 0.72, rule_id: 'TEX-52' },
    clay:             { value: 0.60, rule_id: 'TEX-53' },
    sand:             { value: 0.38, rule_id: 'TEX-54' },
    loamy_sand:       { value: 0.50, rule_id: 'TEX-55' },
  },
};

// ============================================================
// LANDCOVER COMPATIBILITY TABLE
// landcover_compatibility[practice][landcover_class] → LookupEntry
// ============================================================

const LANDCOVER_COMPAT: Record<PracticeId, Partial<Record<LandcoverClass, LookupEntry>>> = {
  pasture_grazing: {
    grassland:  { value: 0.95, rule_id: 'LC-01' },
    shrubland:  { value: 0.80, rule_id: 'LC-02' },
    cropland:   { value: 0.70, rule_id: 'LC-03' },
    barren:     { value: 0.55, rule_id: 'LC-04' },
    forest:     { value: 0.30, rule_id: 'LC-05' },
    wetland:    { value: 0.25, rule_id: 'LC-06' },
    urban:      { value: 0.10, rule_id: 'LC-07' },
    water:      { value: 0.00, rule_id: 'LC-08' },
  },
  cover_crops: {
    cropland:   { value: 0.98, rule_id: 'LC-09' },
    grassland:  { value: 0.60, rule_id: 'LC-10' },
    shrubland:  { value: 0.50, rule_id: 'LC-11' },
    barren:     { value: 0.40, rule_id: 'LC-12' },
    forest:     { value: 0.20, rule_id: 'LC-13' },
    wetland:    { value: 0.20, rule_id: 'LC-14' },
    urban:      { value: 0.10, rule_id: 'LC-15' },
    water:      { value: 0.00, rule_id: 'LC-16' },
  },
  agroforestry: {
    cropland:   { value: 0.90, rule_id: 'LC-17' },
    grassland:  { value: 0.85, rule_id: 'LC-18' },
    shrubland:  { value: 0.75, rule_id: 'LC-19' },
    barren:     { value: 0.60, rule_id: 'LC-20' },
    forest:     { value: 0.40, rule_id: 'LC-21' },
    wetland:    { value: 0.30, rule_id: 'LC-22' },
    urban:      { value: 0.15, rule_id: 'LC-23' },
    water:      { value: 0.00, rule_id: 'LC-24' },
  },
  no_till: {
    cropland:   { value: 0.98, rule_id: 'LC-25' },
    grassland:  { value: 0.70, rule_id: 'LC-26' },
    shrubland:  { value: 0.55, rule_id: 'LC-27' },
    barren:     { value: 0.40, rule_id: 'LC-28' },
    forest:     { value: 0.15, rule_id: 'LC-29' },
    wetland:    { value: 0.15, rule_id: 'LC-30' },
    urban:      { value: 0.05, rule_id: 'LC-31' },
    water:      { value: 0.00, rule_id: 'LC-32' },
  },
  biochar: {
    cropland:   { value: 0.90, rule_id: 'LC-33' },
    grassland:  { value: 0.80, rule_id: 'LC-34' },
    barren:     { value: 0.75, rule_id: 'LC-35' },
    shrubland:  { value: 0.65, rule_id: 'LC-36' },
    forest:     { value: 0.50, rule_id: 'LC-37' },
    wetland:    { value: 0.30, rule_id: 'LC-38' },
    urban:      { value: 0.20, rule_id: 'LC-39' },
    water:      { value: 0.00, rule_id: 'LC-40' },
  },
  reforestation: {
    barren:     { value: 0.95, rule_id: 'LC-41' },
    grassland:  { value: 0.85, rule_id: 'LC-42' },
    shrubland:  { value: 0.80, rule_id: 'LC-43' },
    cropland:   { value: 0.70, rule_id: 'LC-44' },
    wetland:    { value: 0.30, rule_id: 'LC-45' },
    forest:     { value: 0.20, rule_id: 'LC-46' }, // native_forest hard stop handled separately
    urban:      { value: 0.10, rule_id: 'LC-47' },
    water:      { value: 0.00, rule_id: 'LC-48' },
  },
  food_forests: {
    cropland:   { value: 0.88, rule_id: 'LC-49' },
    grassland:  { value: 0.85, rule_id: 'LC-50' },
    shrubland:  { value: 0.75, rule_id: 'LC-51' },
    barren:     { value: 0.65, rule_id: 'LC-52' },
    forest:     { value: 0.40, rule_id: 'LC-53' },
    wetland:    { value: 0.25, rule_id: 'LC-54' },
    urban:      { value: 0.12, rule_id: 'LC-55' },
    water:      { value: 0.00, rule_id: 'LC-56' },
  },
};

// ============================================================
// PUBLIC ACCESSORS
// ============================================================

export function getTextureFit(
  practice: PracticeId,
  texture: TextureClass
): LookupEntry {
  return TEXTURE_FIT[practice]?.[texture] ?? FALLBACK_TEXTURE;
}

export function getLandcoverCompatibility(
  practice: PracticeId,
  landcover: LandcoverClass
): LookupEntry {
  return LANDCOVER_COMPAT[practice]?.[landcover] ?? FALLBACK_LANDCOVER;
}
