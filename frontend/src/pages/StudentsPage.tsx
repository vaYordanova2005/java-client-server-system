import { useMemo, useState, type FormEvent } from 'react';
import { Layout } from '../routes/Layout';
import { useTeacherGrades } from '../hooks/useTeacherGrades';
import apiClient, { extractErrorMessage } from '../api/client';
import { byCreatedAt, FAIL_GRADE, GRADE_TYPE_LABELS, GRADE_TYPES, groupBy, naturalCompare } from '../utils/grades';
import type { GradeType, TeacherGradeSummary } from '../types';

/**
 * Specialty and group are optional on a student profile, so grades for a
 * student the admin hasn't filled in a profile for yet still need a bucket
 * to land in — dropping them would hide real grades from the teacher who
 * entered them.
 */
const UNKNOWN = 'Без специалност/група';

export function StudentsPage() {
  const { grades, error, loading, reload } = useTeacherGrades();

  const [studentFilter, setStudentFilter] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');

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
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [addSubject, setAddSubject] = useState('');
  const [addSemester, setAddSemester] = useState<number | ''>(1);
  const [addGrade, setAddGrade] = useState<number | ''>(6);
  const [addGradeType, setAddGradeType] = useState<GradeType>('REGULAR');
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const subjects = useMemo(() => [...new Set(grades.map((g) => g.subject))].sort(), [grades]);
  const semesters = useMemo(() => [...new Set(grades.map((g) => g.semester))].sort((a, b) => a - b), [grades]);
  const specialties = useMemo(
    () => [...new Set(grades.map((g) => g.specialty ?? UNKNOWN))].sort(naturalCompare),
    [grades]
  );

  // Group numbers repeat across specialties (every specialty has a group 1),
  // so once a specialty is picked the list narrows to that specialty's own
  // groups — otherwise the dropdown would offer combinations with no rows.
  const groupNumbers = useMemo(
    () => [
      ...new Set(
        grades
          .filter((g) => !specialtyFilter || (g.specialty ?? UNKNOWN) === specialtyFilter)
          .map((g) => g.groupNumber ?? UNKNOWN)
      ),
    ].sort(naturalCompare),
    [grades, specialtyFilter]
  );

  const filteredGrades = useMemo(() => {
    const needle = studentFilter.trim().toLowerCase();
    return grades.filter(
      (g) =>
        // Email or faculty number — a roster usually carries faculty numbers,
        // the same reason /teacher/students/lookup accepts either.
        (!needle ||
          g.studentUsername.toLowerCase().includes(needle) ||
          (g.facultyNumber ?? '').toLowerCase().includes(needle)) &&
        (!specialtyFilter || (g.specialty ?? UNKNOWN) === specialtyFilter) &&
        (!groupFilter || (g.groupNumber ?? UNKNOWN) === groupFilter) &&
        (!subjectFilter || g.subject === subjectFilter) &&
        (!semesterFilter || g.semester === Number(semesterFilter))
    );
  }, [grades, studentFilter, specialtyFilter, groupFilter, subjectFilter, semesterFilter]);

  /**
   * Specialty -> group -> student -> semester -> subject. A teacher works
   * with one group at a time, so a flat student list would mean scrolling
   * past every other specialty's students to reach the right one.
   */
  const bySpecialty = useMemo(() => {
    const studentsOf = (entries: TeacherGradeSummary[]) =>
      [...groupBy(entries, (g) => g.studentUsername).entries()]
        .map(([studentUsername, studentEntries]) => ({
          studentUsername,
          facultyNumber: studentEntries[0].facultyNumber,
          bySemester: [...groupBy(studentEntries, (g) => g.semester).entries()]
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
        .sort((a, b) => naturalCompare(a.studentUsername, b.studentUsername));

    return [...groupBy(filteredGrades, (g) => g.specialty ?? UNKNOWN).entries()]
      .map(([specialty, specialtyEntries]) => ({
        specialty,
        studentCount: new Set(specialtyEntries.map((g) => g.studentUsername)).size,
        byGroup: [...groupBy(specialtyEntries, (g) => g.groupNumber ?? UNKNOWN).entries()]
          .map(([groupNumber, groupEntries]) => ({
            groupNumber,
            students: studentsOf(groupEntries),
          }))
          .sort((a, b) => naturalCompare(a.groupNumber, b.groupNumber)),
      }))
      .sort((a, b) => naturalCompare(a.specialty, b.specialty));
  }, [filteredGrades]);

  const singleStudent =
    bySpecialty.length === 1 && bySpecialty[0].byGroup.length === 1 && bySpecialty[0].byGroup[0].students.length === 1;

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

  const startAdding = (studentUsername: string) => {
    setAddingFor(studentUsername);
    setAddSubject('');
    setAddSemester(1);
    setAddGrade(6);
    setAddGradeType('REGULAR');
    setAddError(null);
  };

  const cancelAdding = () => {
    setAddingFor(null);
    setAddError(null);
  };

  const handleAddGrade = async (event: FormEvent) => {
    event.preventDefault();
    if (addingFor === null) return;
    setAddError(null);
    if (addSemester === '' || addGrade === '') {
      setAddError('Моля, въведете семестър и оценка.');
      return;
    }
    setAddSubmitting(true);
    try {
      await apiClient.post('/teacher/grades', {
        studentUsername: addingFor,
        subject: addSubject,
        semester: addSemester,
        grade: addGrade,
        gradeType: addGradeType,
      });
      setAddingFor(null);
      reload();
    } catch (err) {
      setAddError(extractErrorMessage(err));
    } finally {
      setAddSubmitting(false);
    }
  };

  return (
    <Layout>
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
                // The previously chosen group may not exist in the new
                // specialty, which would leave the list empty with both
                // filters looking valid.
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
      {!loading && !error && filteredGrades.length === 0 && (
        <section className="card">
          <p>Няма оценки, отговарящи на филтъра.</p>
        </section>
      )}

      {bySpecialty.map(({ specialty, studentCount, byGroup }) => (
        <details className="card" key={specialty} open={bySpecialty.length === 1}>
          <summary>
            {specialty} <small style={{ opacity: 0.6 }}>({studentCount} студенти)</small>
          </summary>
          {byGroup.map(({ groupNumber, students }) => (
            <details key={groupNumber} open={byGroup.length === 1}>
              <summary>Група {groupNumber}</summary>
              {students.map(({ studentUsername, facultyNumber, bySemester }) => (
                <details key={studentUsername} open={singleStudent}>
                  <summary>
                    {studentUsername}
                    {facultyNumber ? <small style={{ opacity: 0.6 }}> ({facultyNumber})</small> : null}
                  </summary>
                  <p>
                    <button type="button" onClick={() => startAdding(studentUsername)}>
                      Добави оценка
                    </button>
                  </p>
                  {addingFor === studentUsername && (
                    <form onSubmit={handleAddGrade} className="inline-form">
                      <label>
                        Предмет
                        <select value={addSubject} onChange={(e) => setAddSubject(e.target.value)} required>
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
                          value={addSemester}
                          onChange={(e) => setAddSemester(e.target.value === '' ? '' : Number(e.target.value))}
                          required
                        />
                      </label>
                      <label>
                        Оценка
                        <input
                          type="number"
                          min={2}
                          max={6}
                          value={addGrade}
                          onChange={(e) => setAddGrade(e.target.value === '' ? '' : Number(e.target.value))}
                          required
                        />
                      </label>
                      <label>
                        Тип
                        <select value={addGradeType} onChange={(e) => setAddGradeType(e.target.value as GradeType)}>
                          {GRADE_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {GRADE_TYPE_LABELS[t]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="submit" disabled={addSubmitting}>
                        {addSubmitting ? 'Записване...' : 'Запиши'}
                      </button>
                      <button type="button" onClick={cancelAdding}>
                        Отказ
                      </button>
                    </form>
                  )}
                  {addingFor === studentUsername && addError && <p className="error">{addError}</p>}
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
                        <td>{subject}</td>
                        <td className={g.grade === FAIL_GRADE ? 'grade-btn-fail' : undefined}>
                          {g.grade}
                          <small style={{ opacity: 0.6 }}> ({GRADE_TYPE_LABELS[g.gradeType]})</small>
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
            </details>
          ))}
        </details>
      ))}
    </Layout>
  );
}
