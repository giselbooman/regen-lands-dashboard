'use client';

/**
 * InfoPopover — ℹ icon that opens a small tooltip with plain-language explanation.
 *
 * Uses `position: fixed` so the tooltip escapes the panel's overflow:auto scroll
 * container and always renders fully visible, even near panel edges.
 *
 * Position is calculated from the button's getBoundingClientRect() at open-time
 * and clamped to stay within the viewport.
 *
 * Content is translated via react-i18next. Domain-specific terms (Carbon Potential,
 * Reversal Risk) are kept in English in all locales.
 *
 * Usage:
 *   <InfoPopover id="suitability" />
 *   <InfoPopover id="carbon" />
 */

import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export type InfoId = 'suitability' | 'carbon' | 'reversal_risk' | 'confidence';

const POPOVER_WIDTH = 230;
// Conservatively estimated max height; used only to decide above-vs-below placement.
const POPOVER_EST_HEIGHT = 150;
const GAP = 6; // px gap between button and popover
const EDGE_MARGIN = 8; // minimum distance from viewport edges

interface Props {
  id: InfoId;
}

export function InfoPopover({ id }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean }>({
    top: 0, left: 0, above: true,
  });
  const btnRef = useRef<HTMLButtonElement>(null);
  const { t } = useTranslation();

  const title = t(`info.${id}.title`);
  const body  = t(`info.${id}.body`);

  function handleToggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();

      // Horizontal: centre on button, clamped within viewport
      const rawLeft = r.left + r.width / 2 - POPOVER_WIDTH / 2;
      const left = Math.max(
        EDGE_MARGIN,
        Math.min(rawLeft, window.innerWidth - POPOVER_WIDTH - EDGE_MARGIN),
      );

      // Vertical: prefer above; fall back to below if too close to top
      const above = r.top > POPOVER_EST_HEIGHT + GAP + EDGE_MARGIN;
      const top = above
        ? r.top - GAP             // popover bottom aligns near button top (via translateY(-100%))
        : r.bottom + GAP;         // popover top aligns just below button

      setPos({ top, left, above });
    }
    setOpen((v) => !v);
  }

  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        ref={btnRef}
        onClick={handleToggle}
        title={`About: ${title}`}
        aria-label={`Info about ${title}`}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0 3px',
          color: '#6b7280',
          fontSize: 13,
          lineHeight: 1,
        }}
      >
        ℹ
      </button>

      {open && (
        <>
          {/* Invisible full-screen backdrop to close on outside click */}
          <span
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 1000 }}
            aria-hidden
          />

          {/*
           * Popover — position:fixed escapes every overflow:hidden / overflow:auto
           * ancestor, so it is never clipped by the scroll panel.
           *
           * above=true  → translate up 100% so its bottom sits at pos.top
           * above=false → no translate; its top sits at pos.top (below button)
           */}
          <span
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              transform: pos.above ? 'translateY(-100%)' : 'none',
              zIndex: 1001,
              width: POPOVER_WIDTH,
              background: '#1f2937',
              border: '1px solid #374151',
              borderRadius: 8,
              padding: '10px 12px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              // Ensure text never inherits any writing-mode quirks from map layers
              writingMode: 'horizontal-tb',
              direction: 'ltr',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f9fafb', marginBottom: 6 }}>
              {title}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.5 }}>
              {body}
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                position: 'absolute',
                top: 6,
                right: 8,
                background: 'none',
                border: 'none',
                color: '#6b7280',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              ×
            </button>
          </span>
        </>
      )}
    </span>
  );
}
