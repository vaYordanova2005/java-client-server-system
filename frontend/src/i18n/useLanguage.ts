import { createContext, useContext } from 'react';
import type { Language } from './translations';

export interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

/**
 * The context and its hook live apart from {@code LanguageContext.tsx} for
 * the same reason as {@link AuthContext}/{@code useAuth}: a module exporting
 * both a component and something else opts out of React Fast Refresh.
 */
export const LanguageContext = createContext<LanguageContextValue | null>(null);

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}
