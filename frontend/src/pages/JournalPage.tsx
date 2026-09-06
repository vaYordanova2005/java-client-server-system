import { Fragment, useMemo, useState, type FormEvent } from 'react';
import { Layout } from '../routes/Layout';
import { useAuth } from '../auth/useAuth';
import { useStudentGrades } from '../hooks/useStudentGrades';
import { useStudentProfile } from '../hooks/useStudentProfile';
import { useTeacherGrades } from '../hooks/useTeacherGrades';
import apiClient, { extractErrorMessage } from '../api/client';
import { byCreatedAt, classifySessionTypes, FAIL_GRADE, groupBy } from '../utils/grades';
import type { TeacherGradeSummary } from '../types';

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];

export function JournalPage() {
  const { user } = useAuth();

  if (user?.role === 'STUDENT') return <StudentJournal />;
  if (user?.role === 'TEACHER') return <TeacherJournal />;

  return (
    <Layout title="Дневник">
      <section className="card">
        <p>Тази секция е в процес на разработка.</p>
      </section>
    </Layout>
  );
}

function StudentJournal() {
  const { grades, error, loading } = useStudentGrades();
  const { profile } = useStudentProfile();
  const currentSemester = profile?.enrolledSemester ?? null;
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const sessionTypeById = useMemo(() => classifySessionTypes(grades), [grades]);

  // Grades are grouped by subject per semester so a retake sits next to its
  // regular-session grade on the same row instead of a separate row.
  const bySemester = useMemo(() => {
    const result = new Map<number, { subject: string; entries: typeof grades }[]>();
    for (const [semester, entries] of groupBy(grades, (g) => g.semester)) {
      const subjectRows = [...groupBy(entries, (g) => g.subject).entries()]
        .map(([subject, subjectEntries]) => ({
          subject,
          entries: [...subjectEntries].sort(byCreatedAt),
        }))
        .sort((a, b) => a.subject.localeCompare(b.subject));
      result.set(semester, subjectRows);
    }
    return result;
  }, [grades]);

  /**
   * The eight regular semesters, plus any semester the data actually contains
   * outside that range. The backend validates 1..8, so an out-of-range value
   * can only come from a legacy row or a direct database write — rendering the
   * fixed list alone would drop those grades from the page without a word.
   */
  const semesters = useMemo(() => {
    const unexpected = [...bySemester.keys()]
      .filter((semester) => !SEMESTERS.includes(semester))
      .sort((a, b) => a - b);
    return [...SEMESTERS, ...unexpected];
  }, [bySemester]);

  return (
    <Layout>
      {loading && (
        <section className="card">
          <p>Зареждане...</p>
        </section>
      )}
      {error && (
        <section className="card">
          <p className="error">{error}</p>
        </section>
      )}
      {!loading && !error && grades.length === 0 && (
        <section className="card">
          <p>Все още няма вписани оценки.</p>
        </section>
      )}
      {!loading && !error && grades.length > 0 && (
        <>
          {semesters.map((semester) => {
            const subjectRows = bySemester.get(semester) ?? [];
            return (
              <details className="card" key={semester}>
                <summary>Семестър {semester}{semester === currentSemester ? ' (текущ)' : ''}</summary>
                {subjectRows.length ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Предмет</th>
                        <th>Оценки</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjectRows.map(({ subject, entries }) => (
                        <Fragment key={subject}>
                          <tr>
                            <td>{subject}</td>
                            <td className="grade-btn-group">
                              {entries.map((g) => (
                                <button
                                  key={g.id}
                                  type="button"
                                  className={g.grade === FAIL_GRADE ? 'grade-btn grade-btn-fail' : 'grade-btn'}
                                  aria-expanded={expandedId === g.id}
                                  aria-controls={`grade-detail-${g.id}`}
                                  onClick={() => setExpandedId(expandedId === g.id ? null : g.id)}
                                >
                                  {g.grade}
                                </button>
                              ))}
                            </td>
                          </tr>
                          {entries.map(
                            (g) =>
                              expandedId === g.id && (
                                <tr className="grade-detail-row" key={g.id}>
                                  <td colSpan={2}>
                                    <div className="grade-detail" id={`grade-detail-${g.id}`}>
                                      <div>Дата: {new Date(g.createdAt).toLocaleDateString('bg-BG')}</div>
                                      <div>
                                        Тип:{' '}
                                        {sessionTypeById.get(g.id) === 'retake'
                                          ? 'поправителна сесия'
                                          : 'редовна сесия'}
                                      </div>
                                      <div>Преподавател: {g.teacherUsername ?? '—'}</div>
                                    </div>
                                  </td>
                                </tr>
                              )
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>Няма оценки за този семестър.</p>
                )}
              </details>
            );
          })}
        </>
      )}
    </Layout>
  );
}

function TeacherJournal() {
  const { grades, error, loading, reload } = useTeacherGrades();

  const [studentFilter, setStudentFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editSemester, setEditSemester] = useState(1);
  const [editGrade, setEditGrade] = useState(6);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const subjects = useMemo(() => [...new Set(grades.map((g) => g.subject))].sort(), [grades]);
  const semesters = useMemo(() => [...new Set(grades.map((g) => g.semester))].sort((a, b) => a - b), [grades]);

  const filteredGrades = useMemo(() => {
    const needle = studentFilter.trim().toLowerCase();
    return grades.filter(
      (g) =>
        (!needle || g.studentUsername.toLowerCase().includes(needle)) &&
        (!subjectFilter || g.subject === subjectFilter) &&
        (!semesterFilter || g.semester === Number(semesterFilter))
    );
  }, [grades, studentFilter, subjectFilter, semesterFilter]);

  // Computed over the whole filtered set (not per student) so the key stays
  // consistent regardless of how the rows end up grouped below — grouping by
  // student here, but student is still part of the key: without it, two
  // different students' first grade in the same semester+subject would land
  // in the same bucket and one would be mislabeled as a retake.
  const sessionTypeById = useMemo(
    () => classifySessionTypes(filteredGrades, (g) => `${g.studentUsername}::${g.semester}::${g.subject}`),
    [filteredGrades]
  );

  const byStudent = useMemo(() => {
    return [...groupBy(filteredGrades, (g) => g.studentUsername).entries()]
      .map(([studentUsername, entries]) => ({
        studentUsername,
        bySemester: [...groupBy(entries, (g) => g.semester).entries()]
          .map(([semester, semesterEntries]) => ({
            semester,
            subjectRows: [...groupBy(semesterEntries, (g) => g.subject).entries()]
              .map(([subject, subjectEntries]) => ({
                subject,
                entries: [...subjectEntries].sort(byCreatedAt),
              }))
              .sort((a, b) => a.subject.localeCompare(b.subject)),
          }))
          .sort((a, b) => a.semester - b.semester),
      }))
      .sort((a, b) => a.studentUsername.localeCompare(b.studentUsername));
  }, [filteredGrades]);

  const startEditing = (g: TeacherGradeSummary) => {
    setEditingId(g.id);
    setEditSubject(g.subject);
    setEditSemester(g.semester);
    setEditGrade(g.grade);
    setEditError(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditError(null);
  };

  const handleSaveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (editingId === null) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      await apiClient.put(`/teacher/grades/${editingId}`, {
        subject: editSubject,
        semester: editSemester,
        grade: editGrade,
      });
      setEditingId(null);
      reload();
    } catch (err) {
      setEditError(extractErrorMessage(err));
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Да се изтрие ли тази оценка?')) return;
    setDeletingId(id);
    try {
      await apiClient.delete(`/teacher/grades/${id}`);
      reload();
    } catch (err) {
      window.alert(extractErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Layout title="Дневник">
      <section className="card">
        <form className="inline-form" onSubmit={(e) => e.preventDefault()}>
          <label>
            Ученик (имейл)
            <input
              value={studentFilter}
              onChange={(e) => setStudentFilter(e.target.value)}
              placeholder="напр. student1@uni-sofia.bg"
            />
          </label>
          <label>
            Предмет
            <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
              <option value="">Всички</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            Семестър
            <select value={semesterFilter} onChange={(e) => setSemesterFilter(e.target.value)}>
              <option value="">Всички</option>
              {semesters.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </form>
      </section>

      {loading && (
        <section className="card">
          <p>Зареждане...</p>
        </section>
      )}
      {error && (
        <section className="card">
          <p className="error">{error}</p>
        </section>
      )}
      {!loading && !error && filteredGrades.length === 0 && (
        <section className="card">
          <p>Няма оценки, отговарящи на филтъра.</p>
        </section>
      )}

      {byStudent.map(({ studentUsername, bySemester }) => (
        <details className="card" key={studentUsername} open={byStudent.length === 1}>
          <summary>{studentUsername}</summary>
          {bySemester.map(({ semester, subjectRows }) => (
            <table key={semester}>
              <thead>
                <tr>
                  <th colSpan={3}>Семестър {semester}</th>
                </tr>
                <tr>
                  <th>Предмет</th>
                  <th>Оценка</th>
                  <th>Действие</th>
                </tr>
              </thead>
              <tbody>
                {subjectRows.flatMap(({ subject, entries }) =>
                  entries.map((g) =>
                    editingId === g.id ? (
                      <tr key={g.id}>
                        <td colSpan={3}>
                          <form onSubmit={handleSaveEdit} className="inline-form">
                            <label>
                              Предмет
                              <input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} required />
                            </label>
                            <label>
                              Семестър
                              <input
                                type="number"
                                min={1}
                                max={8}
                                value={editSemester}
                                onChange={(e) => setEditSemester(Number(e.target.value))}
                                required
                              />
                            </label>
                            <label>
                              Оценка
                              <input
                                type="number"
                                min={2}
                                max={6}
                                value={editGrade}
                                onChange={(e) => setEditGrade(Number(e.target.value))}
                                required
                              />
                            </label>
                            <button type="submit" disabled={editSubmitting}>
                              {editSubmitting ? 'Записване...' : 'Запази'}
                            </button>
                            <button type="button" onClick={cancelEditing}>
                              Отказ
                            </button>
                          </form>
                          {editError && <p className="error">{editError}</p>}
                        </td>
                      </tr>
                    ) : (
                      <tr key={g.id}>
                        <td>{subject}</td>
                        <td className={g.grade === FAIL_GRADE ? 'grade-btn-fail' : undefined}>
                          {g.grade}
                          <small style={{ opacity: 0.6 }}>
                            {' '}
                            ({sessionTypeById.get(g.id) === 'retake' ? 'поправителна' : 'редовна'})
                          </small>
                        </td>
                        <td className="user-actions">
                          <button type="button" onClick={() => startEditing(g)}>
                            Редактирай
                          </button>
                          <button type="button" onClick={() => handleDelete(g.id)} disabled={deletingId === g.id}>
                            {deletingId === g.id ? 'Изтриване...' : 'Изтрий'}
                          </button>
                        </td>
                      </tr>
                    )
                  )
                )}
              </tbody>
            </table>
          ))}
        </details>
      ))}
    </Layout>
  );
}
