import { useState } from 'react';
import apiClient, { extractErrorMessage } from '../api/client';
import { translate } from '../i18n/activeTranslator';
import type { GradeType } from '../types';

/**
 * The add-grade half of the duplicated CRUD block — shared by the journal's
 * single "add for the looked-up student" form and the students page's
 * per-student "Добави оценка" form. `reload` is the caller's own grade-list
 * refetch, called after a successful save.
 */
export function useAddGradeForm(reload: () => void) {
  const [subject, setSubject] = useState('');
  const [semester, setSemester] = useState<number | ''>(1);
  const [grade, setGrade] = useState<number | ''>(6);
  const [gradeType, setGradeType] = useState<GradeType>('REGULAR');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setSubject('');
    setSemester(1);
    setGrade(6);
    setGradeType('REGULAR');
    setError(null);
  };

  const submit = async (studentUsername: string): Promise<boolean> => {
    setError(null);
    if (semester === '' || grade === '') {
      setError(translate('errors.missingSemesterGrade'));
      return false;
    }
    setSubmitting(true);
    try {
      await apiClient.post('/teacher/grades', { studentUsername, subject, semester, grade, gradeType });
      reload();
      return true;
    } catch (err) {
      setError(extractErrorMessage(err));
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return {
    subject,
    setSubject,
    semester,
    setSemester,
    grade,
    setGrade,
    gradeType,
    setGradeType,
    submitting,
    error,
    submit,
    reset,
  };
}
