'use client';

/**
 * I18nProvider — wraps the app with the react-i18next I18nextProvider.
 *
 * Must be a 'use client' component because it accesses localStorage and
 * initialises the i18next singleton on the browser side.
 *
 * Usage in app/layout.tsx:
 *   import { I18nProvider } from '@/lib/i18n/I18nProvider';
 *   <I18nProvider>{children}</I18nProvider>
 */

import { I18nextProvider } from 'react-i18next';
import i18n from './index';

interface Props {
  children: React.ReactNode;
}

export function I18nProvider({ children }: Props) {
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
