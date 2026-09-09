import { useMemo, useState, type FormEvent } from 'react';
import { Layout } from '../routes/Layout';
import { useLanguage } from '../i18n/useLanguage';
import { useTeacherGrades } from '../hooks/useTeacherGrades';
import { useAllStudents } from '../hooks/useAllStudents';
import { useGradeEditor } from '../hooks/useGradeEditor';
import { useAddGradeForm } from '../hooks/useAddGradeForm';
import { GradeFieldsForm } from '../components/GradeFieldsForm';
import { ConfirmDeleteButton } from '../components/ConfirmDeleteButton';
import { byCreatedAt, FAIL_GRADE, gradeTypeLabel, groupBy, naturalCompare } from '../utils/grades';
import type { StudentRosterSummary, TeacherGradeSummary } from '../types';

interface StudentEntry {
  studentUsername: string;
  facultyNumber: string | null;
  bySemester: { semester: number; subjectRows: { subject: string; entries: TeacherGradeSummary[] }[] }[];
}

export function StudentsPage() {
  const { t } = useLanguage();
  const UNKNOWN = t('common.unspecifiedGroup');

  // The roster (every student, from every teacher's perspective) drives who
  // shows up on the page; `grades` (this teacher's own) is overlaid onto
  // each roster entry. Building the page from `grades` alone — as it used
  // to — meant a student nobody has graded yet, or one this teacher has
  // never taught, simply never appeared.
  const { students, error: rosterError, loading: rosterLoading } = useAllStudents();
  const { grades, error: gradesError, loading: gradesLoading, reload } = useTeacherGrades();

  const [studentFilter, setStudentFilter] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');

  const editor = useGradeEditor(reload);
  const addForm = useAddGradeForm(reload);
  const [addingFor, setAddingFor] = useState<string | null>(null);

  const loading = rosterLoading || gradesLoading;
  const error = rosterError ?? gradesError;

  const subjects = useMemo(() => [...new Set(grades.map((g) => g.subject))].sort(), [grades]);
  const semesters = useMemo(() => [...new Set(grades.map((g) => g.semester))].sort((a, b) => a - b), [grades]);
  const specialties = useMemo(
    () => [...new Set(students.map((s) => s.specialty ?? UNKNOWN))].sort(naturalCompare),
    [students, UNKNOWN]
  );

  // Group numbers repeat across specialties (every specialty has a group 1),
  // so once a specialty is picked the list narrows to that specialty's own
  // groups — otherwise the dropdown would offer combinations with no rows.
  const groupNumbers = useMemo(
    () => [
      ...new Set(
        students
          .filter((s) => !specialtyFilter || (s.specialty ?? UNKNOWN) === specialtyFilter)
          .map((s) => s.groupNumber ?? UNKNOWN)
      ),
    ].sort(naturalCompare),
    [students, specialtyFilter, UNKNOWN]
  );

  const gradesByStudent = useMemo(() => groupBy(grades, (g) => g.studentUsername), [grades]);

  const filteredRoster = useMemo(() => {
    const needle = studentFilter.trim().toLowerCase();
    return students.filter(
      (s) =>
        // Email or faculty number — a roster usually carries faculty numbers,
        // the same reason /teacher/students/lookup accepts either.
        (!needle ||
          s.studentUsername.toLowerCase().includes(needle) ||
          (s.facultyNumber ?? '').toLowerCase().includes(needle)) &&
        (!specialtyFilter || (s.specialty ?? UNKNOWN) === specialtyFilter) &&
        (!groupFilter || (s.groupNumber ?? UNKNOWN) === groupFilter)
    );
  }, [students, studentFilter, specialtyFilter, groupFilter, UNKNOWN]);

  /**
   * Specialty -> group -> student -> semester -> subject. A teacher works
   * with one group at a time, so a flat student list would mean scrolling
   * past every other specialty's students to reach the right one.
   *
   * The subject/semester filters narrow which of *this teacher's* grades
   * show under a student, not which students appear — except when one of
   * them is set, in which case a student with no matching grade drops out
   * entirely (the filter is asking "who has a grade in X", so an empty
   * result for that student isn't useful to show).
   */
  const bySpecialty = useMemo(() => {
    const studentsOf = (entries: StudentRosterSummary[]): StudentEntry[] =>
      entries
        .map((r): StudentEntry | null => {
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
        .filter((s): s is StudentEntry => s !== null)
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
  }, [filteredRoster, gradesByStudent, subjectFilter, semesterFilter, UNKNOWN]);

  const singleStudent =
    bySpecialty.length === 1 && bySpecialty[0].byGroup.length === 1 && bySpecialty[0].byGroup[0].students.length === 1;

  const startAdding = (studentUsername: string) => {
    setAddingFor(studentUsername);
    addForm.reset();
  };

  const cancelAdding = () => {
    setAddingFor(null);
  };

  const handleAddGrade = async (event: FormEvent) => {
    event.preventDefault();
    if (addingFor === null) return;
    const ok = await addForm.submit(addingFor);
    if (ok) setAddingFor(null);
  };

  return (
    <Layout>
      <section className="card">
        <form className="inline-form" onSubmit={(e) => e.preventDefault()}>
          <label>
            {t('filters.studentLabel')}
            <input
              value={studentFilter}
              onChange={(e) => setStudentFilter(e.target.value)}
              placeholder={t('filters.studentPlaceholder')}
            />
          </label>
          <label>
            {t('filters.specialtyLabel')}
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
              <option value="">{t('filters.allOption')}</option>
              {specialties.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('filters.groupLabel')}
            <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
              <option value="">{t('filters.allOption')}</option>
              {groupNumbers.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('filters.subjectLabel')}
            <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
              <option value="">{t('filters.allOption')}</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('filters.semesterLabel')}
            <select value={semesterFilter} onChange={(e) => setSemesterFilter(e.target.value)}>
              <option value="">{t('filters.allOption')}</option>
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
          <p>{t('common.loading')}</p>
        </section>
      )}
      {error && (
        <section className="card">
          <p className="error">{error}</p>
        </section>
      )}
      {editor.deleteError && (
        <section className="card">
          <p className="error">{editor.deleteError}</p>
        </section>
      )}
      {!loading && !error && bySpecialty.length === 0 && (
        <section className="card">
          <p>{t('students.noStudents')}</p>
        </section>
      )}

      {bySpecialty.map(({ specialty, studentCount, byGroup }) => (
        <details className="card" key={specialty} open={bySpecialty.length === 1}>
          <summary>
            {specialty} <small style={{ opacity: 0.6 }}>({t('students.studentsCount', { count: studentCount })})</small>
          </summary>
          {byGroup.map(({ groupNumber, students: groupStudents }) => (
            <details key={groupNumber} open={byGroup.length === 1}>
              <summary>{t('students.groupHeading', { group: groupNumber })}</summary>
              {groupStudents.map(({ studentUsername, facultyNumber, bySemester }) => (
                <details key={studentUsername} open={singleStudent}>
                  <summary>
                    {studentUsername}
                    {facultyNumber ? <small style={{ opacity: 0.6 }}> ({facultyNumber})</small> : null}
                  </summary>
                  <p>
                    <button type="button" onClick={() => startAdding(studentUsername)}>
                      {t('grades.addGrade')}
                    </button>
                  </p>
                  {addingFor === studentUsername && (
                    <GradeFieldsForm
                      onSubmit={handleAddGrade}
                      subject={addForm.subject}
                      onSubjectChange={addForm.setSubject}
                      subjectOptions={subjects}
                      datalistId="students-add-subjects"
                      semester={addForm.semester}
                      onSemesterChange={addForm.setSemester}
                      grade={addForm.grade}
                      onGradeChange={addForm.setGrade}
                      gradeType={addForm.gradeType}
                      onGradeTypeChange={addForm.setGradeType}
                      submitting={addForm.submitting}
                      submitLabel={t('grades.save')}
                      submittingLabel={t('grades.saving')}
                      onCancel={cancelAdding}
                    />
                  )}
                  {addingFor === studentUsername && addForm.error && <p className="error">{addForm.error}</p>}
                  {bySemester.length === 0 && <p>{t('grades.noGradesEntered')}</p>}
                  {bySemester.map(({ semester, subjectRows }) => (
                    <table key={semester}>
                      <thead>
                        <tr>
                          <th colSpan={3}>{t('grades.semesterHeading', { semester })}</th>
                        </tr>
                        <tr>
                          <th>{t('grades.colSubject')}</th>
                          <th>{t('grades.colGrade')}</th>
                          <th>{t('grades.colAction')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subjectRows.flatMap(({ subject, entries }) =>
                          entries.map((g) =>
                            editor.editingId === g.id ? (
                              <tr key={g.id}>
                                <td colSpan={3}>
                                  <GradeFieldsForm
                                    onSubmit={editor.handleSaveEdit}
                                    subject={editor.editSubject}
                                    onSubjectChange={editor.setEditSubject}
                                    subjectOptions={subjects}
                                    datalistId="students-edit-subjects"
                                    semester={editor.editSemester}
                                    onSemesterChange={editor.setEditSemester}
                                    grade={editor.editGrade}
                                    onGradeChange={editor.setEditGrade}
                                    gradeType={editor.editGradeType}
                                    onGradeTypeChange={editor.setEditGradeType}
                                    submitting={editor.editSubmitting}
                                    submitLabel={t('common.save')}
                                    submittingLabel={t('common.saving')}
                                    onCancel={editor.cancelEditing}
                                  />
                                  {editor.editError && <p className="error">{editor.editError}</p>}
                                </td>
                              </tr>
                            ) : (
                              <tr key={g.id}>
                                <td>{subject}</td>
                                <td className={g.grade === FAIL_GRADE ? 'grade-btn-fail' : undefined}>
                                  {g.grade}
                                  <small style={{ opacity: 0.6 }}> ({gradeTypeLabel(g.gradeType, t)})</small>
                                </td>
                                <td className="user-actions">
                                  <button type="button" onClick={() => editor.startEditing(g)}>
                                    {t('common.edit')}
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
