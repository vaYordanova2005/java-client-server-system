interface DeleteGradeButtonProps {
  gradeId: number;
  confirmingDeleteId: number | null;
  deletingId: number | null;
  onRequestDelete: (id: number) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (id: number) => void;
}

/**
 * Two-step inline confirm instead of `window.confirm`/`window.alert` — the
 * only place left in the app reaching for a browser dialog instead of its
 * own UI for a destructive action.
 */
export function DeleteGradeButton({
  gradeId,
  confirmingDeleteId,
  deletingId,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: DeleteGradeButtonProps) {
  if (confirmingDeleteId === gradeId) {
    return (
      <>
        <span>Сигурни ли сте?</span>
        <button type="button" onClick={() => onConfirmDelete(gradeId)} disabled={deletingId === gradeId}>
          {deletingId === gradeId ? 'Изтриване...' : 'Да, изтрий'}
        </button>
        <button type="button" onClick={onCancelDelete}>
          Отказ
        </button>
      </>
    );
  }
  return (
    <button type="button" onClick={() => onRequestDelete(gradeId)}>
      Изтрий
    </button>
  );
}
