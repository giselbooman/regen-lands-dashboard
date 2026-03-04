/**
 * ProjectPopup — HTML string builder for MapLibre GL Popup content.
 *
 * This is NOT a React component. MapLibre popups receive raw HTML strings.
 *
 * Design: minimal map-label tooltip.
 *   - Project name (block element — no flex, guaranteed horizontal rendering)
 *   - Credit class code · full name  (one line, accent color)
 *
 * Everything else (coordinates, precision, registry link, hint) is in the
 * left panel when the user clicks — no need to repeat it in the popup.
 */

import type { MarketplaceProject } from '@/lib/marketplace/types';

const CLASS_BADGE_COLORS: Record<string, string> = {
  BT:  '#a78bfa',
  C0:  '#60a5fa',
  C1:  '#60a5fa',
  C2:  '#60a5fa',
  C3:  '#60a5fa',
  C5:  '#60a5fa',
  C6:  '#60a5fa',
  C7:  '#60a5fa',
  C8:  '#60a5fa',
  KS:  '#34d399',
  MB:  '#22d3ee',
  US:  '#f472b6',
};

function accentColor(creditClass?: string): string {
  if (!creditClass) return '#4fb573';
  const prefix = creditClass.slice(0, 2).toUpperCase();
  return CLASS_BADGE_COLORS[prefix] ?? '#4fb573';
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generates the HTML string for a MapLibre GL Popup.
 * Minimal tooltip: name + credit class only.
 */
export function buildPopupHTML(project: MarketplaceProject): string {
  const accent = accentColor(project.credit_class);

  // Credit class line: "C02 · Urban Forest Carbon Credit Class"
  const ccLine = project.credit_class_id
    ? `<div style="
        display:block;
        font-size:11px;
        font-weight:500;
        color:${accent};
        margin-top:4px;
        line-height:1.3;
        word-break:break-word;
        white-space:normal;
        writing-mode:horizontal-tb;
        direction:ltr;
      ">${esc(project.credit_class_id)}${project.credit_class ? ` · ${esc(project.credit_class)}` : ''}</div>`
    : '';

  return `
    <div style="
      display:block;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      background:rgba(10,18,12,0.93);
      color:#f9fafb;
      padding:9px 13px;
      border-radius:7px;
      border:1px solid rgba(79,181,115,0.28);
      box-shadow:0 4px 16px rgba(0,0,0,0.55);
      min-width:160px;
      max-width:230px;
      writing-mode:horizontal-tb;
      direction:ltr;
      text-orientation:mixed;
      unicode-bidi:normal;
    ">
      <div style="
        display:block;
        font-size:13px;
        font-weight:700;
        color:#f9fafb;
        line-height:1.35;
        word-break:break-word;
        overflow-wrap:break-word;
        white-space:normal;
        writing-mode:horizontal-tb;
        direction:ltr;
        text-orientation:mixed;
        unicode-bidi:normal;
      ">${esc(project.name)}</div>
      ${ccLine}
    </div>
  `;
}
