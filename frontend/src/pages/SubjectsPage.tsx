import { useEffect, useState, type FormEvent } from 'react';
import apiClient, { extractErrorMessage } from '../api/client';
import { Layout } from '../routes/Layout';
import { useSubjects } from '../hooks/useSubjects';
import { ConfirmDeleteButton } from '../components/ConfirmDeleteButton';
import type { Subject, SubjectTeacherAssignment } from '../types';

interface SubjectFormState {
  name: string;
  faculty: string;
  specialty: string;
}

const EMPTY_FORM: SubjectFormState = { name: '', faculty: '', specialty: '' };

export function SubjectsPage() {
  const { subjects, error, loading, reload } = useSubjects();

  // --- create ---
  const [createForm, setCreateForm] = useState<SubjectFormState>(EMPTY_FORM);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setCreateError(null);
    setCreateSubmitting(true);
    try {
      await apiClient.post('/admin/subjects', {
        name: createForm.name,
        faculty: createForm.faculty || null,
        specialty: createForm.specialty || null,
      });
      setCreateForm(EMPTY_FORM);
      reload();
    } catch (err) {
      setCreateError(extractErrorMessage(err));
    } finally {
      setCreateSubmitting(false);
    }
  };

  // --- edit ---
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<SubjectFormState>(EMPTY_FORM);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const startEdit = (subject: Subject) => {
    setEditingId(subject.id);
    setEditForm({ name: subject.name, faculty: subject.faculty ?? '', specialty: subject.specialty ?? '' });
    setEditError(null);
  };
  const cancelEdit = () => setEditingId(null);

  const handleSaveEdit = async (event: FormEvent, subject: Subject) => {
    event.preventDefault();
    setEditError(null);
    setEditSubmitting(true);
    try {
      await apiClient.put(`/admin/subjects/${subject.id}`, {
        name: editForm.name,
        faculty: editForm.faculty || null,
        specialty: editForm.specialty || null,
        active: subject.active,
      });
      setEditingId(null);
      reload();
    } catch (err) {
      setEditError(extractErrorMessage(err));
    } finally {
      setEditSubmitting(false);
    }
  };

  // --- activate / deactivate (reactivation is the same PUT, with active=true) ---
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const handleToggleActive = async (subject: Subject) => {
    setToggleError(null);
    setTogglingId(subject.id);
    try {
      await apiClient.put(`/admin/subjects/${subject.id}`, {
        name: subject.name,
        faculty: subject.faculty,
        specialty: subject.specialty,
        active: !subject.active,
      });
      reload();
    } catch (err) {
      setToggleError(extractErrorMessage(err));
    } finally {
      setTogglingId(null);
    }
  };

  // --- hard delete (only possible once no assignments reference the subject —
  // the backend answers 409 otherwise, surfaced here as toggleError since it
  // shares the same catalog-table error slot) ---
  const [hardDeleteConfirmingId, setHardDeleteConfirmingId] = useState<number | null>(null);
  const [hardDeletingId, setHardDeletingId] = useState<number | null>(null);

  const handleHardDelete = async (id: number) => {
    setToggleError(null);
    setHardDeletingId(id);
    try {
      await apiClient.delete(`/admin/subjects/${id}/permanent`);
      setHardDeleteConfirmingId(null);
      reload();
    } catch (err) {
      setToggleError(extractErrorMessage(err));
    } finally {
      setHardDeletingId(null);
    }
  };

  // --- assignments for the selected subject ---
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<SubjectTeacherAssignment[]>([]);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  // Tracks which subject's assignments are currently reflected in `assignments`,
  // so `assignmentsLoading` can be derived rather than set synchronously inside
  // the effect below (react-hooks/set-state-in-effect).
  const [assignmentsLoadedForId, setAssignmentsLoadedForId] = useState<number | null>(null);
  const assignmentsLoading = selectedSubjectId !== null && assignmentsLoadedForId !== selectedSubjectId;
  const [assignmentsToken, setAssignmentsToken] = useState(0);
  const reloadAssignments = () => setAssignmentsToken((t) => t + 1);

  useEffect(() => {
    if (selectedSubjectId === null) return;
    let ignore = false;
    apiClient.get<SubjectTeacherAssignment[]>(`/admin/subjects/${selectedSubjectId}/assignments`).then(
      (response) => {
        if (ignore) return;
        setAssignments(response.data);
        setAssignmentsError(null);
        setAssignmentsLoadedForId(selectedSubjectId);
      },
      (err) => {
        if (ignore) return;
        setAssignmentsError(extractErrorMessage(err));
        setAssignmentsLoadedForId(selectedSubjectId);
      }
    );
    return () => {
      ignore = true;
    };
  }, [selectedSubjectId, assignmentsToken]);

  const [assignTeacherUsername, setAssignTeacherUsername] = useState('');
  const [assignGroupNumber, setAssignGroupNumber] = useState('');
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const handleAddAssignment = async (event: FormEvent) => {
    event.preventDefault();
    if (selectedSubjectId === null) return;
    setAssignError(null);
    setAssignSubmitting(true);
    try {
      await apiClient.post(`/admin/subjects/${selectedSubjectId}/assignments`, {
        teacherUsername: assignTeacherUsername,
        groupNumber: assignGroupNumber || null,
      });
      setAssignTeacherUsername('');
      setAssignGroupNumber('');
      reloadAssignments();
    } catch (err) {
      setAssignError(extractErrorMessage(err));
    } finally {
      setAssignSubmitting(false);
    }
  };

  const [assignmentConfirmingId, setAssignmentConfirmingId] = useState<number | null>(null);
  const [assignmentDeletingId, setAssignmentDeletingId] = useState<number | null>(null);

  const handleDeleteAssignment = async (id: number) => {
    if (selectedSubjectId === null) return;
    setAssignmentDeletingId(id);
    try {
      await apiClient.delete(`/admin/subjects/assignments/${id}`);
      setAssignmentConfirmingId(null);
      reloadAssignments();
    } catch (err) {
      setAssignmentsError(extractErrorMessage(err));
    } finally {
      setAssignmentDeletingId(null);
    }
  };

  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId) ?? null;

  return (
    <Layout title="Предмети">
      <section className="card">
        <h2>Нов предмет</h2>
        <form onSubmit={handleCreate} className="inline-form">
          <label>
            Име
            <input
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </label>
          <label>
            Факултет
            <input
              value={createForm.faculty}
              onChange={(e) => setCreateForm((f) => ({ ...f, faculty: e.target.value }))}
            />
          </label>
          <label>
            Специалност
            <input
              value={createForm.specialty}
              onChange={(e) => setCreateForm((f) => ({ ...f, specialty: e.target.value }))}
            />
          </label>
          <button type="submit" disabled={createSubmitting}>
            {createSubmitting ? 'Създаване...' : 'Създай'}
          </button>
        </form>
        {createError && <p className="error">{createError}</p>}
      </section>

      <section className="card">
        <h2>Каталог с предмети</h2>
        {loading && <p>Зареждане...</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !error && (
          <table>
            <thead>
              <tr>
                <th>Име</th>
                <th>Факултет</th>
                <th>Специалност</th>
                <th>Статус</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) =>
                editingId === s.id ? (
                  <tr key={s.id}>
                    <td colSpan={5}>
                      <form onSubmit={(e) => handleSaveEdit(e, s)} className="inline-form">
                        <label>
                          Име
                          <input
                            value={editForm.name}
                            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                            required
                          />
                        </label>
                        <label>
                          Факултет
                          <input
                            value={editForm.faculty}
                            onChange={(e) => setEditForm((f) => ({ ...f, faculty: e.target.value }))}
                          />
                        </label>
                        <label>
                          Специалност
                          <input
                            value={editForm.specialty}
                            onChange={(e) => setEditForm((f) => ({ ...f, specialty: e.target.value }))}
                          />
                        </label>
                        <button type="submit" disabled={editSubmitting}>
                          {editSubmitting ? 'Записване...' : 'Запази'}
                        </button>
                        <button type="button" onClick={cancelEdit}>
                          Отказ
                        </button>
                      </form>
                      {editError && <p className="error">{editError}</p>}
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.faculty ?? '—'}</td>
                    <td>{s.specialty ?? '—'}</td>
                    <td>{s.active ? 'Активен' : 'Неактивен'}</td>
                    <td className="user-actions">
                      <button type="button" onClick={() => startEdit(s)}>
                        Редактирай
                      </button>
                      <button type="button" onClick={() => handleToggleActive(s)} disabled={togglingId === s.id}>
                        {s.active ? 'Деактивирай' : 'Възстанови'}
                      </button>
                      <button type="button" onClick={() => setSelectedSubjectId(s.id)}>
                        Разпределение
                      </button>
                      {!s.active && (
                        <ConfirmDeleteButton
                          id={s.id}
                          confirmingDeleteId={hardDeleteConfirmingId}
                          deletingId={hardDeletingId}
                          onRequestDelete={setHardDeleteConfirmingId}
                          onCancelDelete={() => setHardDeleteConfirmingId(null)}
                          onConfirmDelete={handleHardDelete}
                        />
                      )}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
        {toggleError && <p className="error">{toggleError}</p>}
      </section>

      {selectedSubject && (
        <section className="card">
          <h2>Разпределение по учители — {selectedSubject.name}</h2>
          <form onSubmit={handleAddAssignment} className="inline-form">
            <label>
              Имейл на учителя
              <input
                type="email"
                value={assignTeacherUsername}
                onChange={(e) => setAssignTeacherUsername(e.target.value)}
                required
              />
            </label>
            <label>
              Група (по избор — празно означава целия предмет)
              <input value={assignGroupNumber} onChange={(e) => setAssignGroupNumber(e.target.value)} />
            </label>
            <button type="submit" disabled={assignSubmitting}>
              {assignSubmitting ? 'Добавяне...' : 'Добави'}
            </button>
          </form>
          {assignError && <p className="error">{assignError}</p>}

          {assignmentsLoading && <p>Зареждане...</p>}
          {assignmentsError && <p className="error">{assignmentsError}</p>}
          {!assignmentsLoading && !assignmentsError && (
            <table>
              <thead>
                <tr>
                  <th>Учител</th>
                  <th>Група</th>
                  <th>Действие</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id}>
                    <td>{a.teacherUsername}</td>
                    <td>{a.groupNumber ?? 'Целия предмет'}</td>
                    <td>
                      <ConfirmDeleteButton
                        id={a.id}
                        confirmingDeleteId={assignmentConfirmingId}
                        deletingId={assignmentDeletingId}
                        onRequestDelete={setAssignmentConfirmingId}
                        onCancelDelete={() => setAssignmentConfirmingId(null)}
                        onConfirmDelete={handleDeleteAssignment}
                      />
                    </td>
                  </tr>
                ))}
                {assignments.length === 0 && (
                  <tr>
                    <td colSpan={3}>Няма разпределени учители за този предмет.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </section>
      )}
    </Layout>
  );
}
