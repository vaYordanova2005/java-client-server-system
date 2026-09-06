import { Fragment, useMemo, useState, type FormEvent } from 'react';
import { Layout } from '../routes/Layout';
import { useAuth } from '../auth/useAuth';
import { useStudentGrades } from '../hooks/useStudentGrades';
import { useStudentProfile } from '../hooks/useStudentProfile';
import { useTeacherGrades } from '../hooks/useTeacherGrades';
import { useTeacherStudentLookup } from '../hooks/useTeacherStudentLookup';
import apiClient, { extractErrorMessage } from '../api/client';
import { byCreatedAt, FAIL_GRADE, GRADE_TYPE_LABELS, GRADE_TYPES, groupBy } from '../utils/grades';
import type { GradeType, TeacherGradeSummary } from '../types';

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];
const RECENT_COUNT = 10;

function displayValue(value: string | number | null | undefined): string | number {
  return value === null || value === undefined || value === '' ? '—' : value;
}

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
                                      <div>Тип: {GRADE_TYPE_LABELS[g.gradeType]}</div>
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
  const { grades, error: gradesError, loading: gradesLoading, reload } = useTeacherGrades();
  const {
    result: student,
    error: lookupError,
    loading: lookupLoading,
    lookup,
    reset: resetLookup,
  } = useTeacherStudentLookup();

  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('');
  // '' while the field is empty mid-edit — coercing straight to 0 on every
  // keystroke (via `Number('')`) meant clearing the field to type a new
  // value showed a flashing "0" instead of staying blank.
  const [semester, setSemester] = useState<number | ''>(1);
  const [gradeValue, setGradeValue] = useState<number | ''>(6);
  const [gradeType, setGradeType] = useState<GradeType>('REGULAR');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editSemester, setEditSemester] = useState<number | ''>(1);
  const [editGrade, setEditGrade] = useState<number | ''>(6);
  const [editGradeType, setEditGradeType] = useState<GradeType>('REGULAR');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // The backend already orders by createdAt desc, so the first N are the
  // most recently entered grades.
  const recentGrades = grades.slice(0, RECENT_COUNT);

  const subjects = useMemo(() => [...new Set(grades.map((g) => g.subject))].sort(), [grades]);

  const handleLookup = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);
    await lookup(query);
  };

  const handleChangeStudent = () => {
    resetLookup();
    setQuery('');
    setSubmitError(null);
    setSubmitSuccess(null);
  };

  const handleSubmitGrade = async (event: FormEvent) => {
    event.preventDefault();
    if (!student) return;
    setSubmitError(null);
    setSubmitSuccess(null);
    if (semester === '' || gradeValue === '') {
      setSubmitError('Моля, въведете семестър и оценка.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post('/teacher/grades', {
        studentUsername: student.username,
        subject,
        semester,
        grade: gradeValue,
        gradeType,
      });
      setSubmitSuccess(`Оценка ${gradeValue} по ${subject} записана за ${student.username}`);
      // Subject clears so the next grade for the same student starts blank;
      // semester/grade stay as a convenience when entering several in a row.
      setSubject('');
      reload();
    } catch (err) {
      setSubmitError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

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
      setEditError('Моля, въведете семестър и оценка.');
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
    <Layout>
      <section className="card">
        <h2>Добави оценка</h2>
        {!student && (
          <form onSubmit={handleLookup} className="inline-form">
            <label>
              Факултетен номер или имейл
              <input value={query} onChange={(e) => setQuery(e.target.value)} required />
            </label>
            <button type="submit" disabled={lookupLoading}>
              {lookupLoading ? 'Търсене...' : 'Провери'}
            </button>
          </form>
        )}
        {lookupError && <p className="error">{lookupError}</p>}

        {student && (
          <>
            <div className="profile-info-grid">
              <div className="profile-info-row">
                <span className="profile-info-label">Имейл</span>
                <span className="profile-info-value">{student.username}</span>
              </div>
              <div className="profile-info-row">
                <span className="profile-info-label">Фак. номер</span>
                <span className="profile-info-value">{displayValue(student.facultyNumber)}</span>
              </div>
              <div className="profile-info-row">
                <span className="profile-info-label">Специалност</span>
                <span className="profile-info-value">{displayValue(student.specialty)}</span>
              </div>
              <div className="profile-info-row">
                <span className="profile-info-label">Група</span>
                <span className="profile-info-value">{displayValue(student.groupNumber)}</span>
              </div>
            </div>
            <p>
              <button type="button" onClick={handleChangeStudent}>
                Смени студента
              </button>
            </p>

            <form onSubmit={handleSubmitGrade} className="inline-form">
              <label>
                Предмет
                <select value={subject} onChange={(e) => setSubject(e.target.value)} required>
                  <option value="" disabled>
                    Изберете предмет
                  </option>
                  {subjects.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Семестър
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={semester}
                  onChange={(e) => setSemester(e.target.value === '' ? '' : Number(e.target.value))}
                  required
                />
              </label>
              <label>
                Оценка
                <input
                  type="number"
                  min={2}
                  max={6}
                  value={gradeValue}
                  onChange={(e) => setGradeValue(e.target.value === '' ? '' : Number(e.target.value))}
                  required
                />
              </label>
              <label>
                Тип
                <select value={gradeType} onChange={(e) => setGradeType(e.target.value as GradeType)}>
                  {GRADE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {GRADE_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={submitting}>
                {submitting ? 'Записване...' : 'Запиши'}
              </button>
            </form>
          </>
        )}
        {submitError && <p className="error">{submitError}</p>}
        {submitSuccess && <p className="success">{submitSuccess}</p>}
      </section>

      <details className="card">
        <summary>Последно въведени оценки</summary>
        {gradesLoading && <p>Зареждане...</p>}
        {gradesError && <p className="error">{gradesError}</p>}
        {!gradesLoading && !gradesError && recentGrades.length === 0 && <p>Все още няма въведени оценки.</p>}
        {recentGrades.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Студент</th>
                <th>Предмет</th>
                <th>Сем.</th>
                <th>Оценка</th>
                <th>Тип</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {recentGrades.map((g) =>
                editingId === g.id ? (
                  <tr key={g.id}>
                    <td colSpan={6}>
                      <form onSubmit={handleSaveEdit} className="inline-form">
                        <span>{g.studentUsername}</span>
                        <label>
                          Предмет
                          <select value={editSubject} onChange={(e) => setEditSubject(e.target.value)} required>
                            {subjects.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Семестър
                          <input
                            type="number"
                            min={1}
                            max={8}
                            value={editSemester}
                            onChange={(e) => setEditSemester(e.target.value === '' ? '' : Number(e.target.value))}
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
                            onChange={(e) => setEditGrade(e.target.value === '' ? '' : Number(e.target.value))}
                            required
                          />
                        </label>
                        <label>
                          Тип
                          <select value={editGradeType} onChange={(e) => setEditGradeType(e.target.value as GradeType)}>
                            {GRADE_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {GRADE_TYPE_LABELS[t]}
                              </option>
                            ))}
                          </select>
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
                    <td>{g.studentUsername}</td>
                    <td>{g.subject}</td>
                    <td>{g.semester}</td>
                    <td>{g.grade}</td>
                    <td>{GRADE_TYPE_LABELS[g.gradeType]}</td>
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
              )}
            </tbody>
          </table>
        )}
      </details>
    </Layout>
  );
}
