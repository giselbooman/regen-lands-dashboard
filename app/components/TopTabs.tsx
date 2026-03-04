'use client';

/**
 * TopTabs — prominent two-tab navigation for the main app modes.
 *
 * Tabs:
 *   🌍 Marketplace Projects  →  tab = "marketplace"
 *   ✏️ Explore New Land      →  tab = "explore"
 *
 * Designed to sit in the header row, giving clear affordance for mode switching.
 * Labels are translated via react-i18next.
 */

import { useTranslation } from 'react-i18next';

export type AppTab = 'marketplace' | 'explore';

interface Props {
  activeTab: AppTab;
  onChange: (tab: AppTab) => void;
  projectCount?: number;
}

const TABS: { id: AppTab; emoji: string; labelKey: string }[] = [
  { id: 'marketplace', emoji: '🌍', labelKey: 'tabs.marketplace' },
  { id: 'explore',     emoji: '✏️',  labelKey: 'tabs.explore'     },
];

export function TopTabs({ activeTab, onChange, projectCount }: Props) {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: 'flex',
        gap: 0,
        alignItems: 'flex-end',
        height: '100%',
        fontFamily: "'Mulish', sans-serif",
      }}
    >
      {TABS.map(({ id, emoji, labelKey }) => {
        const isActive = id === activeTab;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '0 22px',
              height: 38,
              fontSize: 15,
              fontWeight: isActive ? 800 : 600,
              color: isActive ? '#071209' : '#7a9e82',
              background: isActive ? '#4fb573' : 'rgba(79,181,115,0.04)',
              border: `1.5px solid ${isActive ? '#4fb573' : '#1e3020'}`,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
              borderRadius: 7,
              letterSpacing: '0.01em',
              boxShadow: isActive ? '0 0 14px rgba(79,181,115,0.35)' : 'none',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLButtonElement).style.color = '#b3d9bb';
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#2e5033';
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(79,181,115,0.09)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLButtonElement).style.color = '#7a9e82';
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#1e3020';
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(79,181,115,0.04)';
              }
            }}
          >
            <span style={{ fontSize: 14 }}>{emoji}</span>
            {t(labelKey)}
            {id === 'marketplace' && projectCount !== undefined && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  background: isActive ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.06)',
                  color: isActive ? '#071209' : '#7a9e82',
                  padding: '1px 6px',
                  borderRadius: 10,
                  marginLeft: 2,
                  border: isActive ? '1px solid rgba(0,0,0,0.15)' : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {projectCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
