'use client';

/**
 * NavHeader — shared navigation header for all pages.
 *
 * Props:
 *   currentRoute  — highlights the active nav link (e.g. "/" or "/score")
 *   statusSlot    — optional React node rendered on the right side
 *                   (used by the map page for loading / error / count)
 *
 * Language selector: small EN / ES / FR toggle rendered on the far right,
 * before the statusSlot. Calls i18n.changeLanguage() and persists to
 * localStorage under the key 'regen-lang'.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';

interface Props {
  currentRoute: string;
  statusSlot?: ReactNode;
}

const SUPPORTED_LANGS = ['en', 'es', 'fr'] as const;
type Lang = typeof SUPPORTED_LANGS[number];

const NAV_LINKS: { href: string; labelKey: string }[] = [
  { href: '/', labelKey: 'nav.map' },
];

export function NavHeader({ currentRoute, statusSlot }: Props) {
  const { t, i18n: i18nInstance } = useTranslation();
  const currentLang = (i18nInstance.language ?? 'en').slice(0, 2) as Lang;

  function handleLangChange(lang: Lang) {
    i18n.changeLanguage(lang);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('regen-lang', lang);
    }
  }

  return (
    <header
      style={{
        height: 48,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 16,
        background: '#091410',
        borderBottom: '1px solid #1e3020',
        fontFamily: "'Mulish', sans-serif",
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/regen-favicon.png" alt="Regen" width={28} height={28} style={{ borderRadius: 4, display: 'block' }} />
        <span style={{ fontSize: 15, fontWeight: 800, color: '#4fb573', letterSpacing: '-0.3px' }}>
          Regen Lands
        </span>
      </div>

      {/* Divider */}
      <span style={{ width: 1, height: 20, background: '#1e3020', flexShrink: 0 }} />

      {/* Nav links */}
      <nav style={{ display: 'flex', gap: 4 }}>
        {NAV_LINKS.map(({ href, labelKey }) => {
          const isActive = currentRoute === href;
          return (
            <Link
              key={href}
              href={href}
              style={{
                padding: '0 10px',
                height: 28,
                lineHeight: '28px',
                borderRadius: 5,
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? '#4fb573' : '#7a9e82',
                textDecoration: 'none',
                borderBottom: isActive ? '2px solid #4fb573' : '2px solid transparent',
                transition: 'color 0.15s',
              }}
            >
              {t(labelKey)}
            </Link>
          );
        })}
      </nav>

      {/* Right-side: language selector + status slot */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Language selector — EN / ES / FR */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 0,
            border: '1px solid #1e3020',
            borderRadius: 5,
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {SUPPORTED_LANGS.map((lang, idx) => {
            const isActive = currentLang === lang;
            return (
              <button
                key={lang}
                onClick={() => handleLangChange(lang)}
                style={{
                  padding: '2px 8px',
                  fontSize: 11,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#4fb573' : '#4a6650',
                  background: isActive ? '#0d2818' : 'transparent',
                  border: 'none',
                  borderLeft: idx > 0 ? '1px solid #1e3020' : 'none',
                  cursor: isActive ? 'default' : 'pointer',
                  transition: 'all 0.12s',
                  letterSpacing: '0.02em',
                  fontFamily: "'Mulish', sans-serif",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = '#7a9e82';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = '#4a6650';
                }}
              >
                {t(`lang.${lang}`)}
              </button>
            );
          })}
        </div>

        {statusSlot && statusSlot}
      </div>
    </header>
  );
}
