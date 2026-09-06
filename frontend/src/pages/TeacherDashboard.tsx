import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import apiClient, { extractErrorMessage } from '../api/client';
import { Layout } from '../routes/Layout';
import { ChartIcon, JournalIcon, TrophyIcon, BooksIcon } from '../components/icons';
import { useTeacherGrades } from '../hooks/useTeacherGrades';
import { useTeacherStudentLookup } from '../hooks/useTeacherStudentLookup';
import { average, tierColor } from '../utils/grades';
import type { TeacherGradeSummary } from '../types';

const RECENT_COUNT = 10;

function displayValue(value: string | number | null | undefined): string | number {
  return value === null || value === undefined || value === '' ? '—' : value;
}

export function TeacherDashboard() {
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
  const [semester, setSemester] = useState(1);
  const [gradeValue, setGradeValue] = useState(6);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editSemester, setEditSemester] = useState(1);
  const [editGrade, setEditGrade] = useState(6);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const stats = useMemo(() => {
    if (grades.length === 0) return null;
    return {
      overallAvg: average(grades.map((g) => g.grade)),
      studentCount: new Set(grades.map((g) => g.studentUsername)).size,
      subjectCount: new Set(grades.map((g) => g.subject)).size,
    };
  }, [grades]);

  // The backend already orders by createdAt desc, so the first N are the
  // most recently entered grades.
  const recentGrades = grades.slice(0, RECENT_COUNT);

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
    setSubmitting(true);
    try {
      await apiClient.post('/teacher/grades', {
        studentUsername: student.username,
        subject,
        semester,
        grade: gradeValue,
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
    <Layout title="Учител">
      <div className="stat-strip">
        <div
          className="stat-tile"
          style={stats ? ({ '--tile-accent': tierColor(stats.overallAvg) } as CSSProperties) : undefined}
        >
          <ChartIcon />
          <div>
            <strong>{stats ? stats.overallAvg.toFixed(2) : '—'}</strong>
            <span>Среден успех</span>
          </div>
        </div>
        <div className="stat-tile">
          <JournalIcon />
          <div>
            <strong>{grades.length}</strong>
            <span>Оценки</span>
          </div>
        </div>
        <div className="stat-tile">
          <TrophyIcon />
          <div>
            <strong>{stats?.studentCount ?? 0}</strong>
            <span>Ученици</span>
          </div>
        </div>
        <div className="stat-tile">
          <BooksIcon />
          <div>
            <strong>{stats?.subjectCount ?? 0}</strong>
            <span>Предмети</span>
          </div>
        </div>
      </div>

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
                Смени ученика
              </button>
            </p>

            <form onSubmit={handleSubmitGrade} className="inline-form">
              <label>
                Предмет
                <input value={subject} onChange={(e) => setSubject(e.target.value)} required />
              </label>
              <label>
                Семестър
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={semester}
                  onChange={(e) => setSemester(Number(e.target.value))}
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
                  onChange={(e) => setGradeValue(Number(e.target.value))}
                  required
                />
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

      <section className="card">
        <h2>Последно въведени оценки</h2>
        {gradesLoading && <p>Зареждане...</p>}
        {gradesError && <p className="error">{gradesError}</p>}
        {!gradesLoading && !gradesError && recentGrades.length === 0 && <p>Все още няма въведени оценки.</p>}
        {recentGrades.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Ученик</th>
                <th>Предмет</th>
                <th>Сем.</th>
                <th>Оценка</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {recentGrades.map((g) =>
                editingId === g.id ? (
                  <tr key={g.id}>
                    <td colSpan={5}>
                      <form onSubmit={handleSaveEdit} className="inline-form">
                        <span>{g.studentUsername}</span>
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
                    <td>{g.studentUsername}</td>
                    <td>{g.subject}</td>
                    <td>{g.semester}</td>
                    <td>{g.grade}</td>
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
      </section>
    </Layout>
  );
}
