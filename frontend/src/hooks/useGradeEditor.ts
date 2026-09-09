import { useState, type FormEvent } from 'react';
import apiClient, { extractErrorMessage } from '../api/client';
import { translate } from '../i18n/activeTranslator';
import type { GradeType, TeacherGradeSummary } from '../types';

/**
 * The edit/delete half of the grade CRUD block that used to be copied
 * verbatim into {@code TeacherJournal} and {@code StudentsPage} — every
 * future change (a new field, a validation rule) had to be made twice.
 * `reload` is the caller's own list refetch (from {@link useTeacherGrades}),
 * called after a successful save/delete.
 *
 * Delete asks for confirmation inline (two-step button) rather than with
 * {@code window.confirm}/{@code window.alert} — the only place in the app
 * that used to reach for a browser dialog instead of the app's own UI.
 */
export function useGradeEditor(reload: () => void) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSubject, setEditSubject] = useState('');
  // '' while the field is empty mid-edit — coercing straight to 0 on every
  // keystroke (via `Number('')`) meant clearing the field to type a new
  // value showed a flashing "0" instead of staying blank.
  const [editSemester, setEditSemester] = useState<number | ''>(1);
  const [editGrade, setEditGrade] = useState<number | ''>(6);
  const [editGradeType, setEditGradeType] = useState<GradeType>('REGULAR');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const startEditing = (g: TeacherGradeSummary) => {
    setEditingId(g.id);
    setEditSubject(g.subject);
    setEditSemester(g.semester);
    setEditGrade(g.grade);
    setEditGradeType(g.gradeType);
    setEditError(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditError(null);
  };

  const handleSaveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (editingId === null) return;
    setEditError(null);
    if (editSemester === '' || editGrade === '') {
      setEditError(translate('errors.missingSemesterGrade'));
      return;
    }
    setEditSubmitting(true);
    try {
      await apiClient.put(`/teacher/grades/${editingId}`, {
        subject: editSubject,
        semester: editSemester,
        grade: editGrade,
        gradeType: editGradeType,
      });
      setEditingId(null);
      reload();
    } catch (err) {
      setEditError(extractErrorMessage(err));
    } finally {
      setEditSubmitting(false);
    }
  };

  const requestDelete = (id: number) => {
    setDeleteError(null);
    setConfirmingDeleteId(id);
  };

  const cancelDelete = () => {
    setConfirmingDeleteId(null);
  };

  const confirmDelete = async (id: number) => {
    setConfirmingDeleteId(null);
    setDeleteError(null);
    setDeletingId(id);
    try {
      await apiClient.delete(`/teacher/grades/${id}`);
      reload();
    } catch (err) {
      setDeleteError(extractErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  return {
    editingId,
    editSubject,
    setEditSubject,
    editSemester,
    setEditSemester,
    editGrade,
    setEditGrade,
    editGradeType,
    setEditGradeType,
    editSubmitting,
    editError,
    startEditing,
    cancelEditing,
    handleSaveEdit,
    confirmingDeleteId,
    deletingId,
    deleteError,
    requestDelete,
    cancelDelete,
    confirmDelete,
  };
}
