'use client';

/**
 * ActivitySelect — dropdown for Regen taxonomy activities.
 *
 * Attempts to fetch the live list from regen-data-standards.pages.dev/activity/
 * at first render; falls back to FALLBACK_ACTIVITIES on any failure.
 *
 * Grazing activities (Prescribed Grazing, Regenerative Grazing) → pasture_grazing in API.
 * All others → "Model coming soon" (compute disabled).
 *
 * Activity names are kept in English as domain-specific terms per i18n policy.
 * The surrounding UI text (label, warning, placeholder option) is translated.
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { PracticeId } from '@/lib/scoring/types';

// ── Activity taxonomy ─────────────────────────────────────────────────────────

export const FALLBACK_ACTIVITIES: string[] = [
  'Prescribed Grazing',
  'Regenerative Grazing',
  'Agroforestry',
  'Forest Farming',
  'Silvopasture',
  'Biochar Production',
  'Artisanal Biochar Production',
  'Industrial Biochar Production',
  'Conservation Keystone Species',
  'Conservation Umbrella Species',
  'Cover Cropping',
  'Ecosystem Restoration',
  'Ecotourism',
  'Improved Forest Management',
  'Non-Urban Forest Improvement',
  'Urban Forest Improvement',
  'Photocatalyst Application',
  'Residue and Tillage Management',
  'Riparian Forest Buffers',
  'Soil Amendments Biochar',
  'Compost Amendments',
  'Enhanced Rock Weathering',
  'Tree Planting',
  'Afforestation',
  'Reforestation',
];

/** Activities the current scoring engine supports */
export const GRAZING_ACTIVITIES = new Set(['Prescribed Grazing', 'Regenerative Grazing']);

export const DEFAULT_ACTIVITY = 'Prescribed Grazing';

/**
 * Maps a user-visible activity name to the API PracticeId.
 * Returns null if the activity is not yet modelled.
 */
export function activityToPracticeId(activity: string): PracticeId | null {
  if (GRAZING_ACTIVITIES.has(activity)) return 'pasture_grazing';
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  value: string;
  onChange: (activity: string) => void;
  /** Optional label override — caller can pass a pre-translated string.
   *  Omit to use the default translated 'Activity' label. */
  label?: string;
  /** Style override for the select element */
  selectStyle?: React.CSSProperties;
}

export function ActivitySelect({ value, onChange, label, selectStyle }: Props) {
  const { t } = useTranslation();
  const [activities, setActivities] = useState<string[]>(FALLBACK_ACTIVITIES);

  useEffect(() => {
    // Best-effort remote fetch — ignore on failure
    const controller = new AbortController();
    fetch('https://regen-data-standards.pages.dev/activity/', {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.text() : null))
      .then((html) => {
        if (!html) return;
        // Parse activity names from <li> or <a> elements containing activity labels
        const matches = [...html.matchAll(/<(?:li|a)[^>]*>\s*([A-Z][^<]{3,60})\s*<\/(?:li|a)>/gi)]
          .map((m) => m[1].trim())
          .filter((s) => s.length > 3 && s.length < 80 && !/^\d/.test(s));
        if (matches.length >= 5) {
          // Merge: ensure grazing activities are always present
          const merged = [
            'Prescribed Grazing',
            'Regenerative Grazing',
            ...matches.filter((a) => !GRAZING_ACTIVITIES.has(a)),
          ];
          setActivities(merged);
        }
      })
      .catch(() => {/* keep fallback */});

    return () => controller.abort();
  }, []);

  // value === '' means "All Activities" (no activity filter)
  const isSpecific  = value !== '';
  const isSupported = GRAZING_ACTIVITIES.has(value);

  // Use provided label or default translated label
  const displayLabel = label ?? t('explore.activityLabel');

  return (
    <div>
      {displayLabel && (
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>{displayLabel}</div>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '5px 8px',
          borderRadius: 5,
          border: '1px solid #374151',
          background: '#1f2937',
          color: '#f9fafb',
          fontSize: 12,
          ...selectStyle,
        }}
      >
        <option value="">{t('activity.allActivities')}</option>
        {activities.map((a) => (
          <option key={a} value={a}>
            {a}
            {GRAZING_ACTIVITIES.has(a) ? '' : t('activity.modelComingSoon')}
          </option>
        ))}
      </select>
      {isSpecific && !isSupported && (
        <div style={{
          marginTop: 4,
          padding: '4px 8px',
          background: '#451a03',
          border: '1px solid #854d0e',
          borderRadius: 4,
          fontSize: 11,
          color: '#f59e0b',
        }}>
          {t('activity.modelWarn')}
        </div>
      )}
    </div>
  );
}
