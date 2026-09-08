import { Fragment, useMemo, useState, type FormEvent } from 'react';
import { Layout } from '../routes/Layout';
import { useAuth } from '../auth/useAuth';
import { useStudentGrades } from '../hooks/useStudentGrades';
import { useStudentProfile } from '../hooks/useStudentProfile';
import { useTeacherGrades } from '../hooks/useTeacherGrades';
import { useTeacherStudentLookup } from '../hooks/useTeacherStudentLookup';
import { useAdminGrades } from '../hooks/useAdminGrades';
import { useAdminStudentRoster } from '../hooks/useAdminStudentRoster';
import { useGradeEditor } from '../hooks/useGradeEditor';
import { useAddGradeForm } from '../hooks/useAddGradeForm';
import { GradeFieldsForm } from '../components/GradeFieldsForm';
import { ConfirmDeleteButton } from '../components/ConfirmDeleteButton';
import { byCreatedAt, FAIL_GRADE, gradeTypeLabel, groupBy, naturalCompare } from '../utils/grades';
import type { AdminGradeSummary, StudentRosterSummary } from '../types';

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];
const RECENT_COUNT = 10;

/**
 * Specialty and group are optional on a student profile, so a student the
 * admin hasn't filled in a profile for yet still needs a bucket to land in —
 * same reasoning as StudentsPage.
 */
const UNKNOWN = 'Без специалност/група';

function displayValue(value: string | number | null | undefined): string | number {
  return value === null || value === undefined || value === '' ? '—' : value;
}

export function JournalPage() {
  const { user } = useAuth();

  if (user?.role === 'STUDENT') return <StudentJournal />;
  if (user?.role === 'TEACHER') return <TeacherJournal />;
  if (user?.role === 'ADMIN') return <AdminJournal />;

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
                                      <div>Тип: {gradeTypeLabel(g.gradeType)}</div>
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
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const addForm = useAddGradeForm(reload);
  const editor = useGradeEditor(reload);

  // The backend already orders by createdAt desc, so the first N are the
  // most recently entered grades.
  const recentGrades = grades.slice(0, RECENT_COUNT);

  // Suggestions for the subject combobox: this teacher's own subjects. A
  // teacher with no grades on record yet just sees an empty, still-typable
  // list instead of being blocked — the input itself accepts free text.
  const subjects = useMemo(() => [...new Set(grades.map((g) => g.subject))].sort(), [grades]);

  const handleLookup = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitSuccess(null);
    await lookup(query);
  };

  const handleChangeStudent = () => {
    resetLookup();
    setQuery('');
    setSubmitSuccess(null);
    addForm.reset();
  };

  const handleSubmitGrade = async (event: FormEvent) => {
    event.preventDefault();
    if (!student) return;
    setSubmitSuccess(null);
    const subjectAtSubmit = addForm.subject;
    const gradeAtSubmit = addForm.grade;
    const ok = await addForm.submit(student.username);
    if (ok) {
      setSubmitSuccess(`Оценка ${gradeAtSubmit} по ${subjectAtSubmit} записана за ${student.username}`);
      // Subject clears so the next grade for the same student starts blank;
      // semester/grade stay as a convenience when entering several in a row.
      addForm.setSubject('');
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

            <GradeFieldsForm
              onSubmit={handleSubmitGrade}
              subject={addForm.subject}
              onSubjectChange={addForm.setSubject}
              subjectOptions={subjects}
              datalistId="journal-add-subjects"
              semester={addForm.semester}
              onSemesterChange={addForm.setSemester}
              grade={addForm.grade}
              onGradeChange={addForm.setGrade}
              gradeType={addForm.gradeType}
              onGradeTypeChange={addForm.setGradeType}
              submitting={addForm.submitting}
              submitLabel="Запиши"
              submittingLabel="Записване..."
            />
          </>
        )}
        {addForm.error && <p className="error">{addForm.error}</p>}
        {submitSuccess && <p className="success">{submitSuccess}</p>}
      </section>

      <details className="card">
        <summary>Последно въведени оценки</summary>
        {gradesLoading && <p>Зареждане...</p>}
        {gradesError && <p className="error">{gradesError}</p>}
        {editor.deleteError && <p className="error">{editor.deleteError}</p>}
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
                editor.editingId === g.id ? (
                  <tr key={g.id}>
                    <td colSpan={6}>
                      <GradeFieldsForm
                        onSubmit={editor.handleSaveEdit}
                        leading={<span>{g.studentUsername}</span>}
                        subject={editor.editSubject}
                        onSubjectChange={editor.setEditSubject}
                        subjectOptions={subjects}
                        datalistId="journal-edit-subjects"
                        semester={editor.editSemester}
                        onSemesterChange={editor.setEditSemester}
                        grade={editor.editGrade}
                        onGradeChange={editor.setEditGrade}
                        gradeType={editor.editGradeType}
                        onGradeTypeChange={editor.setEditGradeType}
                        submitting={editor.editSubmitting}
                        submitLabel="Запази"
                        submittingLabel="Записване..."
                        onCancel={editor.cancelEditing}
                      />
                      {editor.editError && <p className="error">{editor.editError}</p>}
                    </td>
                  </tr>
                ) : (
                  <tr key={g.id}>
                    <td>{g.studentUsername}</td>
                    <td>{g.subject}</td>
                    <td>{g.semester}</td>
                    <td>{g.grade}</td>
                    <td>{gradeTypeLabel(g.gradeType)}</td>
                    <td className="user-actions">
                      <button type="button" onClick={() => editor.startEditing(g)}>
                        Редактирай
                      </button>
                      <ConfirmDeleteButton
                        id={g.id}
                        confirmingDeleteId={editor.confirmingDeleteId}
                        deletingId={editor.deletingId}
                        onRequestDelete={editor.requestDelete}
                        onCancelDelete={editor.cancelDelete}
                        onConfirmDelete={editor.confirmDelete}
                      />
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

interface AdminJournalStudentEntry {
  studentUsername: string;
  facultyNumber: string | null;
  bySemester: { semester: number; subjectRows: { subject: string; entries: AdminGradeSummary[] }[] }[];
}

/**
 * Read-only, system-wide counterpart to {@link StudentsPage}'s accordion:
 * same specialty -> group -> student -> semester -> subject structure, built
 * from every teacher's grades instead of one teacher's own, with a teacher
 * column added and no add/edit/delete controls — an admin reads the journal
 * here, they don't grade through it.
 */
function AdminJournal() {
  const { students, error: rosterError, loading: rosterLoading } = useAdminStudentRoster();
  const { grades, error: gradesError, loading: gradesLoading } = useAdminGrades();

  const [studentFilter, setStudentFilter] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');

  const loading = rosterLoading || gradesLoading;
  const error = rosterError ?? gradesError;

  const subjects = useMemo(() => [...new Set(grades.map((g) => g.subject))].sort(), [grades]);
  const semesters = useMemo(() => [...new Set(grades.map((g) => g.semester))].sort((a, b) => a - b), [grades]);
  const specialties = useMemo(
    () => [...new Set(students.map((s) => s.specialty ?? UNKNOWN))].sort(naturalCompare),
    [students]
  );
  const groupNumbers = useMemo(
    () => [
      ...new Set(
        students
          .filter((s) => !specialtyFilter || (s.specialty ?? UNKNOWN) === specialtyFilter)
          .map((s) => s.groupNumber ?? UNKNOWN)
      ),
    ].sort(naturalCompare),
    [students, specialtyFilter]
  );

  const gradesByStudent = useMemo(() => groupBy(grades, (g) => g.studentUsername), [grades]);

  const filteredRoster = useMemo(() => {
    const needle = studentFilter.trim().toLowerCase();
    return students.filter(
      (s) =>
        (!needle ||
          s.studentUsername.toLowerCase().includes(needle) ||
          (s.facultyNumber ?? '').toLowerCase().includes(needle)) &&
        (!specialtyFilter || (s.specialty ?? UNKNOWN) === specialtyFilter) &&
        (!groupFilter || (s.groupNumber ?? UNKNOWN) === groupFilter)
    );
  }, [students, studentFilter, specialtyFilter, groupFilter]);

  const bySpecialty = useMemo(() => {
    const studentsOf = (entries: StudentRosterSummary[]): AdminJournalStudentEntry[] =>
      entries
        .map((r): AdminJournalStudentEntry | null => {
          const studentGrades = (gradesByStudent.get(r.studentUsername) ?? []).filter(
            (g) =>
              (!subjectFilter || g.subject === subjectFilter) &&
              (!semesterFilter || g.semester === Number(semesterFilter))
          );
          if ((subjectFilter || semesterFilter) && studentGrades.length === 0) return null;
          return {
            studentUsername: r.studentUsername,
            facultyNumber: r.facultyNumber,
            bySemester: [...groupBy(studentGrades, (g) => g.semester).entries()]
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
          };
        })
        .filter((s): s is AdminJournalStudentEntry => s !== null)
        .sort((a, b) => naturalCompare(a.studentUsername, b.studentUsername));

    return [...groupBy(filteredRoster, (r) => r.specialty ?? UNKNOWN).entries()]
      .map(([specialty, specialtyEntries]) => {
        const byGroup = [...groupBy(specialtyEntries, (r) => r.groupNumber ?? UNKNOWN).entries()]
          .map(([groupNumber, groupEntries]) => ({
            groupNumber,
            students: studentsOf(groupEntries),
          }))
          .filter((g) => g.students.length > 0)
          .sort((a, b) => naturalCompare(a.groupNumber, b.groupNumber));
        return {
          specialty,
          studentCount: byGroup.reduce((sum, g) => sum + g.students.length, 0),
          byGroup,
        };
      })
      .filter((s) => s.byGroup.length > 0)
      .sort((a, b) => naturalCompare(a.specialty, b.specialty));
  }, [filteredRoster, gradesByStudent, subjectFilter, semesterFilter]);

  return (
    <Layout title="Дневник">
      <section className="card">
        <form className="inline-form" onSubmit={(e) => e.preventDefault()}>
          <label>
            Студент (имейл или фак. №)
            <input
              value={studentFilter}
              onChange={(e) => setStudentFilter(e.target.value)}
              placeholder="напр. student1@uni-sofia.bg или 62501"
            />
          </label>
          <label>
            Специалност
            <select
              value={specialtyFilter}
              onChange={(e) => {
                setSpecialtyFilter(e.target.value);
                setGroupFilter('');
              }}
            >
              <option value="">Всички</option>
              {specialties.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            Група
            <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
              <option value="">Всички</option>
              {groupNumbers.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
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
      {!loading && !error && bySpecialty.length === 0 && (
        <section className="card">
          <p>Няма студенти, отговарящи на филтъра.</p>
        </section>
      )}

      {bySpecialty.map(({ specialty, studentCount, byGroup }) => (
        <details className="card" key={specialty} open={bySpecialty.length === 1}>
          <summary>
            {specialty} <small style={{ opacity: 0.6 }}>({studentCount} студенти)</small>
          </summary>
          {byGroup.map(({ groupNumber, students: groupStudents }) => (
            <details key={groupNumber} open={byGroup.length === 1}>
              <summary>Група {groupNumber}</summary>
              {groupStudents.map(({ studentUsername, facultyNumber, bySemester }) => (
                <details key={studentUsername} open={bySpecialty.length === 1 && byGroup.length === 1 && groupStudents.length === 1}>
                  <summary>
                    {studentUsername}
                    {facultyNumber ? <small style={{ opacity: 0.6 }}> ({facultyNumber})</small> : null}
                  </summary>
                  {bySemester.length === 0 && <p>Няма въведени оценки.</p>}
                  {bySemester.map(({ semester, subjectRows }) => (
                    <table key={semester}>
                      <thead>
                        <tr>
                          <th colSpan={4}>Семестър {semester}</th>
                        </tr>
                        <tr>
                          <th>Предмет</th>
                          <th>Оценка</th>
                          <th>Тип</th>
                          <th>Учител</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subjectRows.flatMap(({ subject, entries }) =>
                          entries.map((g) => (
                            <tr key={g.id}>
                              <td>{subject}</td>
                              <td className={g.grade === FAIL_GRADE ? 'grade-btn-fail' : undefined}>{g.grade}</td>
                              <td>{gradeTypeLabel(g.gradeType)}</td>
                              <td>{g.teacherUsername ?? '—'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  ))}
                </details>
              ))}
            </details>
          ))}
        </details>
      ))}
    </Layout>
  );
}
