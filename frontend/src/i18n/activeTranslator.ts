import type { TranslationKey } from './translations';

export type Translator = (key: TranslationKey, vars?: Record<string, string | number>) => string;

// Non-component code (the axios client, form-validation hooks) has no access
// to the LanguageContext, so LanguageProvider keeps this module-level
// reference in sync with the active language instead.
let active: Translator = (key) => key;

export function setActiveTranslator(translator: Translator): void {
  active = translator;
}

export function translate(key: TranslationKey, vars?: Record<string, string | number>): string {
  return active(key, vars);
}
