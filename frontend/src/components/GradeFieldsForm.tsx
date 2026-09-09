import type { FormEvent, ReactNode } from 'react';
import { GRADE_TYPES, gradeTypeLabel } from '../utils/grades';
import { useLanguage } from '../i18n/useLanguage';
import type { GradeType } from '../types';

interface GradeFieldsFormProps {
  onSubmit: (event: FormEvent) => void;
  /** Extra markup rendered before the Предмет field — e.g. a read-only student label. */
  leading?: ReactNode;
  subject: string;
  onSubjectChange: (value: string) => void;
  /**
   * Suggestions only — a `datalist`, not a locked `<select>`. A teacher with
   * no grades on record yet (or one entering a subject nobody has used
   * before) can still type it in; `subjectOptions` just speeds up the
   * common case of picking a subject that already exists.
   */
  subjectOptions: string[];
  /** Must be unique on the page — an add form and an edit form can be open at once. */
  datalistId: string;
  semester: number | '';
  onSemesterChange: (value: number | '') => void;
  grade: number | '';
  onGradeChange: (value: number | '') => void;
  gradeType: GradeType;
  onGradeTypeChange: (value: GradeType) => void;
  submitting: boolean;
  submitLabel: string;
  submittingLabel: string;
  onCancel?: () => void;
}

export function GradeFieldsForm({
  onSubmit,
  leading,
  subject,
  onSubjectChange,
  subjectOptions,
  datalistId,
  semester,
  onSemesterChange,
  grade,
  onGradeChange,
  gradeType,
  onGradeTypeChange,
  submitting,
  submitLabel,
  submittingLabel,
  onCancel,
}: GradeFieldsFormProps) {
  const { t } = useLanguage();

  return (
    <form onSubmit={onSubmit} className="inline-form">
      {leading}
      <label>
        {t('gradeFieldsForm.subjectLabel')}
        <input
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          list={datalistId}
          placeholder={t('gradeFieldsForm.subjectPlaceholder')}
          autoComplete="off"
          required
        />
        <datalist id={datalistId}>
          {subjectOptions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>
      <label>
        {t('gradeFieldsForm.semesterLabel')}
        <input
          type="number"
          min={1}
          max={8}
          value={semester}
          onChange={(e) => onSemesterChange(e.target.value === '' ? '' : Number(e.target.value))}
          required
        />
      </label>
      <label>
        {t('gradeFieldsForm.gradeLabel')}
        <input
          type="number"
          min={2}
          max={6}
          value={grade}
          onChange={(e) => onGradeChange(e.target.value === '' ? '' : Number(e.target.value))}
          required
        />
      </label>
      <label>
        {t('gradeFieldsForm.typeLabel')}
        <select value={gradeType} onChange={(e) => onGradeTypeChange(e.target.value as GradeType)}>
          {GRADE_TYPES.map((type) => (
            <option key={type} value={type}>
              {gradeTypeLabel(type, t)}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={submitting}>
        {submitting ? submittingLabel : submitLabel}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      )}
    </form>
  );
}
