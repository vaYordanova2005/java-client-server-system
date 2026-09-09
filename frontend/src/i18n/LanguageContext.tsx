import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { resources, type Language } from './translations';
import { setActiveTranslator } from './activeTranslator';
import { LanguageContext } from './useLanguage';

const STORAGE_KEY = 'markly-language';

function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

function resolve(dict: unknown, path: string[]): unknown {
  return path.reduce<unknown>(
    (acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined),
    dict
  );
}

function detectInitialLanguage(): Language {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'bg' ? 'bg' : 'en';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(detectInitialLanguage);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => setLanguageState(next), []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const path = key.split('.');
      const value = resolve(resources[language], path) ?? resolve(resources.en, path);
      if (typeof value !== 'string') return key;
      return interpolate(value, vars);
    },
    [language]
  );

  // Keeps api/client.ts and the grade-entry hooks (outside React context) in
  // sync so errors raised there are shown in the currently selected language.
  useEffect(() => setActiveTranslator(t), [t]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
