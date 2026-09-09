import { useLanguage } from '../i18n/useLanguage';

interface ConfirmDeleteButtonProps {
  id: number;
  confirmingDeleteId: number | null;
  deletingId: number | null;
  onRequestDelete: (id: number) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (id: number) => void;
  /** Applied to both the initial "Изтрий" button and the "Да, изтрий" confirm button. */
  className?: string;
  /**
   * Wraps the confirm-state controls in a `<span>` with this class instead of
   * a fragment — only needed when that wrapper has to carry its own layout
   * (e.g. flex spacing), since a plain fragment leaves the controls as direct
   * flex items of whatever container renders this component.
   */
  confirmWrapperClassName?: string;
}

/**
 * Two-step inline confirm instead of `window.confirm`/`window.alert` — the
 * only place left in the app reaching for a browser dialog instead of its
 * own UI for a destructive action.
 */
export function ConfirmDeleteButton({
  id,
  confirmingDeleteId,
  deletingId,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
  className,
  confirmWrapperClassName,
}: ConfirmDeleteButtonProps) {
  const { t } = useLanguage();

  if (confirmingDeleteId === id) {
    const controls = (
      <>
        <span>{t('confirmDelete.areYouSure')}</span>
        <button type="button" className={className} onClick={() => onConfirmDelete(id)} disabled={deletingId === id}>
          {deletingId === id ? t('confirmDelete.deleting') : t('confirmDelete.yesDelete')}
        </button>
        <button type="button" onClick={onCancelDelete}>
          {t('common.cancel')}
        </button>
      </>
    );
    return confirmWrapperClassName ? <span className={confirmWrapperClassName}>{controls}</span> : controls;
  }
  return (
    <button type="button" className={className} onClick={() => onRequestDelete(id)}>
      {t('confirmDelete.delete')}
    </button>
  );
}
