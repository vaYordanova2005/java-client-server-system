import { useLanguage } from '../i18n/useLanguage';

export function LanguageToggle({ className }: { className?: string }) {
  const { language, t, setLanguage } = useLanguage();

  return (
    <div className={className ? `lang-toggle ${className}` : 'lang-toggle'} role="group" aria-label={t('languageToggle.label')}>
      <button
        type="button"
        className={language === 'en' ? 'lang-toggle-active' : undefined}
        aria-pressed={language === 'en'}
        onClick={() => setLanguage('en')}
      >
        {t('languageToggle.en')}
      </button>
      <button
        type="button"
        className={language === 'bg' ? 'lang-toggle-active' : undefined}
        aria-pressed={language === 'bg'}
        onClick={() => setLanguage('bg')}
      >
        {t('languageToggle.bg')}
      </button>
    </div>
  );
}
