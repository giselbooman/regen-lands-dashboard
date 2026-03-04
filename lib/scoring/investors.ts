/**
 * SCORING_V1 — Investor Profiles (in-memory store)
 *
 * Source of truth: spec/INVESTOR_MATCH_V1.md
 *
 * MVP: profiles stored in-memory. No database, no email alerts.
 * V1 heuristic — pending review with actual investor partners.
 */

import type { InvestorProfile } from './types';

export const INVESTOR_PROFILES: InvestorProfile[] = [
  {
    id: 'inv-001',
    name: 'Terra Capital Partners',
    regions_allowed: ['LATAM', 'NAM'],
    ticket_min: 500_000,
    ticket_max: 5_000_000,
    practice_preferences: ['agroforestry', 'reforestation', 'food_forests'],
    risk_tolerance: 'low',
    impact_priorities: ['carbon', 'biodiversity'],
    stage_preferences: ['pipeline', 'verified'],
  },
  {
    id: 'inv-002',
    name: 'Green Growth Fund',
    regions_allowed: ['GLOBAL'],
    ticket_min: 100_000,
    ticket_max: 2_000_000,
    practice_preferences: ['cover_crops', 'no_till', 'pasture_grazing', 'agroforestry'],
    risk_tolerance: 'medium',
    impact_priorities: ['carbon', 'water'],
    stage_preferences: ['explore', 'pipeline', 'verified'],
  },
  {
    id: 'inv-003',
    name: 'SoilFirst Ventures',
    regions_allowed: ['NAM', 'EUR'],
    ticket_min: 250_000,
    ticket_max: 3_000_000,
    practice_preferences: ['no_till', 'cover_crops', 'pasture_grazing'],
    risk_tolerance: 'medium',
    impact_priorities: ['soil', 'carbon'],
    stage_preferences: ['pipeline', 'verified'],
  },
  {
    id: 'inv-004',
    name: 'Biodiversity Alliance Fund',
    regions_allowed: ['GLOBAL'],
    ticket_min: 50_000,
    ticket_max: 1_000_000,
    practice_preferences: ['food_forests', 'reforestation', 'agroforestry'],
    risk_tolerance: 'low',
    impact_priorities: ['biodiversity', 'water'],
    stage_preferences: ['explore', 'pipeline'],
  },
];
