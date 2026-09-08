import { useMemo, type CSSProperties } from 'react';
import { Layout } from '../routes/Layout';
import { useAuth } from '../auth/useAuth';
import { useStudentGrades } from '../hooks/useStudentGrades';
import { useTeacherGrades } from '../hooks/useTeacherGrades';
import { useAdminGrades } from '../hooks/useAdminGrades';
import { ChartIcon, JournalIcon, TrophyIcon, BooksIcon, StudentsIcon } from '../components/icons';
import {
  average,
  averagesByKey,
  FAIL_GRADE,
  gradeColor,
  groupBy,
  semesterAverages,
  subjectAverages,
  tierColor,
} from '../utils/grades';

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];
const GRADE_VALUES = [2, 3, 4, 5, 6];

const CHART_WIDTH = 640;
const CHART_HEIGHT = 180;
const CHART_PAD_X = 34;
const CHART_PAD_Y = 20;

// `domain` is normally SEMESTERS (1..8), but a grade with a semester outside
// the backend-validated 1..8 range — a legacy row, same case the journal
// handles — would otherwise plot past CHART_WIDTH: dividing by the fixed
// SEMESTERS range instead of the actual domain silently clipped it off the
// chart. See `chartSemesters` below, which extends the domain to match.
function chartX(semester: number, domain: number[]): number {
  const first = domain[0];
  const last = domain[domain.length - 1];
  return CHART_PAD_X + ((semester - first) / (last - first)) * (CHART_WIDTH - CHART_PAD_X * 2);
}

function chartY(avg: number): number {
  const [minGrade, maxGrade] = [GRADE_VALUES[0], GRADE_VALUES[GRADE_VALUES.length - 1]];
  return CHART_HEIGHT - CHART_PAD_Y - ((avg - minGrade) / (maxGrade - minGrade)) * (CHART_HEIGHT - CHART_PAD_Y * 2);
}

export function StatisticsPage() {
  const { user } = useAuth();

  if (user?.role === 'STUDENT') return <StudentStatistics />;
  if (user?.role === 'TEACHER') return <TeacherStatistics />;
  if (user?.role === 'ADMIN') return <AdminStatistics />;

  return (
    <Layout title="Статистики">
      <section className="card">
        <p>Тази секция е в процес на разработка.</p>
      </section>
    </Layout>
  );
}

function StudentStatistics() {
  const { grades, error, loading } = useStudentGrades();

  const stats = useMemo(() => {
    if (grades.length === 0) return null;

    // grades.length > 0 here, so this can never be the empty-input case.
    const overallAvg = average(grades.map((g) => g.grade))!;

    const distribution = GRADE_VALUES.map((value) => {
      const count = grades.filter((g) => g.grade === value).length;
      return { value, count, pct: (count / grades.length) * 100 };
    });

    const bySubject = subjectAverages(grades);
    const bestSubject = bySubject[0] ?? null;

    const bySemesterAvg = semesterAverages(grades);
    const presentSemesters = bySemesterAvg.map((s) => s.semester);

    const gradesBySubject = groupBy(grades, (g) => g.subject);
    const subjectMatrix = bySubject.map(({ subject }) => {
      const bySem = new Map<number, number>();
      for (const [semester, entries] of groupBy(gradesBySubject.get(subject) ?? [], (g) => g.semester)) {
        // Same as above: entries comes from groupBy, so it's never empty.
        bySem.set(semester, average(entries.map((g) => g.grade))!);
      }
      const measured = [...bySem.entries()].sort((a, b) => a[0] - b[0]);
      let trend: 'up' | 'down' | 'flat' | null = null;
      if (measured.length > 1) {
        const diff = measured[measured.length - 1][1] - measured[0][1];
        trend = diff > 0.25 ? 'up' : diff < -0.25 ? 'down' : 'flat';
      }
      return { subject, bySem, trend };
    });

    const retakes = grades.filter((g) => g.gradeType === 'RETAKE');
    const regular = grades.filter((g) => g.gradeType !== 'RETAKE');

    // Same fixed-list-plus-overflow approach as the journal: keeps the usual
    // 1..8 axis stable while still giving an out-of-range semester its own
    // tick instead of clipping it. Sorted as a whole rather than appended,
    // since chartX reads domain[0]/domain[last] as the axis bounds — an
    // unsorted domain (e.g. a legacy semester 0 tacked on after 8) would put
    // the smaller bound last and invert/overflow the whole line, which is
    // exactly the case this is meant to fix.
    const unexpectedSemesters = presentSemesters.filter((s) => !SEMESTERS.includes(s));
    const chartSemesters = unexpectedSemesters.length
      ? [...SEMESTERS, ...unexpectedSemesters].sort((a, b) => a - b)
      : SEMESTERS;

    return {
      overallAvg,
      total: grades.length,
      distribution,
      subjectAverages: bySubject,
      bestSubject,
      semesterAverages: bySemesterAvg,
      presentSemesters,
      chartSemesters,
      subjectMatrix,
      retakeCount: retakes.length,
      retakeAvg: retakes.length ? average(retakes.map((g) => g.grade)) : null,
      regularAvg: regular.length ? average(regular.map((g) => g.grade)) : null,
    };
  }, [grades]);

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

      {!loading && stats && (
        <>
          <div className="stat-strip">
            <div className="stat-tile" style={{ '--tile-accent': tierColor(stats.overallAvg) } as CSSProperties}>
              <ChartIcon />
              <div>
                <strong>{stats.overallAvg.toFixed(2)}</strong>
                <span>Общ успех</span>
              </div>
            </div>
            <div className="stat-tile">
              <JournalIcon />
              <div>
                <strong>{stats.total}</strong>
                <span>Оценки</span>
              </div>
            </div>
            <div className="stat-tile" style={{ '--tile-accent': 'var(--success)' } as CSSProperties}>
              <TrophyIcon />
              <div>
                <strong>{stats.bestSubject ? stats.bestSubject.avg.toFixed(2) : '—'}</strong>
                <span>{stats.bestSubject?.subject ?? 'Най-силен предмет'}</span>
              </div>
            </div>
            <div className="stat-tile">
              <BooksIcon />
              <div>
                <strong>{stats.retakeCount}</strong>
                <span>Поправителни</span>
              </div>
            </div>
          </div>

          <section className="card">
            <h2>Разпределение на оценките</h2>
            <div className="subject-bars">
              {stats.distribution.map(({ value, count, pct }) => (
                <div className="subject-bar-row" key={value}>
                  <span className="subject-bar-label">Оценка {value}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${pct}%`, background: gradeColor(value) }} />
                  </div>
                  <span className="subject-bar-value">
                    {count} <small>({pct.toFixed(0)}%)</small>
                  </span>
                </div>
              ))}
            </div>
          </section>

          {stats.semesterAverages.length > 1 && (
            <section className="card">
              <h2>Тенденция по семестри</h2>
              <div className="trend-chart-wrap">
                <svg
                  className="trend-chart"
                  viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                  preserveAspectRatio="xMidYMid meet"
                >
                  {GRADE_VALUES.map((value) => (
                    <g key={value}>
                      <line
                        x1={CHART_PAD_X}
                        x2={CHART_WIDTH - CHART_PAD_X}
                        y1={chartY(value)}
                        y2={chartY(value)}
                        className="trend-grid-line"
                      />
                      <text x={4} y={chartY(value) + 4} className="trend-axis-label">
                        {value}
                      </text>
                    </g>
                  ))}
                  {stats.chartSemesters.map((semester) => (
                    <text
                      key={semester}
                      x={chartX(semester, stats.chartSemesters)}
                      y={CHART_HEIGHT - 2}
                      textAnchor="middle"
                      className="trend-axis-label"
                    >
                      Сем. {semester}
                    </text>
                  ))}
                  <polyline
                    className="trend-line"
                    points={stats.semesterAverages
                      .map(({ semester, avg }) => `${chartX(semester, stats.chartSemesters)},${chartY(avg)}`)
                      .join(' ')}
                  />
                  {stats.semesterAverages.map(({ semester, avg }) => (
                    <circle
                      key={semester}
                      cx={chartX(semester, stats.chartSemesters)}
                      cy={chartY(avg)}
                      r={5}
                      className="trend-point"
                      style={{ fill: tierColor(avg) }}
                    />
                  ))}
                </svg>
              </div>
            </section>
          )}

          <section className="card">
            <h2>По предмети</h2>
            <div className="subject-matrix-wrap">
              <table className="subject-matrix">
                <thead>
                  <tr>
                    <th>Предмет</th>
                    {stats.presentSemesters.map((semester) => (
                      <th key={semester}>Сем. {semester}</th>
                    ))}
                    <th>Среден</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.subjectMatrix.map(({ subject, bySem, trend }) => {
                    const subjectAvg = stats.subjectAverages.find((s) => s.subject === subject)!.avg;
                    return (
                      <tr key={subject}>
                        <td>{subject}</td>
                        {stats.presentSemesters.map((semester) => (
                          <td key={semester}>{bySem.has(semester) ? bySem.get(semester)!.toFixed(2) : '—'}</td>
                        ))}
                        <td className={trend ? `delta-${trend}` : undefined}>
                          {subjectAvg.toFixed(2)}
                          {trend === 'up' && ' ↑'}
                          {trend === 'down' && ' ↓'}
                          {trend === 'flat' && ' →'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {stats.retakeCount > 0 && (
            <section className="card">
              <h2>Редовна срещу поправителна сесия</h2>
              <div className="retake-split">
                <div className="retake-tile">
                  <strong>{stats.regularAvg?.toFixed(2) ?? '—'}</strong>
                  <span>Редовна сесия</span>
                </div>
                <div className="retake-tile">
                  <strong>{stats.retakeAvg?.toFixed(2) ?? '—'}</strong>
                  <span>Поправителна сесия ({stats.retakeCount})</span>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </Layout>
  );
}

function TeacherStatistics() {
  const { grades, error, loading } = useTeacherGrades();

  const stats = useMemo(() => {
    if (grades.length === 0) return null;

    // grades.length > 0 here, so this can never be the empty-input case.
    const overallAvg = average(grades.map((g) => g.grade))!;
    const distribution = GRADE_VALUES.map((value) => {
      const count = grades.filter((g) => g.grade === value).length;
      return { value, count, pct: (count / grades.length) * 100 };
    });
    const studentCount = new Set(grades.map((g) => g.studentUsername)).size;
    const bySubject = subjectAverages(grades);
    const bySemesterAvg = semesterAverages(grades);

    const retakes = grades.filter((g) => g.gradeType === 'RETAKE');
    const regular = grades.filter((g) => g.gradeType !== 'RETAKE');

    return {
      overallAvg,
      total: grades.length,
      distribution,
      studentCount,
      subjectAverages: bySubject,
      semesterAverages: bySemesterAvg,
      retakeCount: retakes.length,
      retakeAvg: retakes.length ? average(retakes.map((g) => g.grade)) : null,
      regularAvg: regular.length ? average(regular.map((g) => g.grade)) : null,
    };
  }, [grades]);

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
          <p>Все още няма въведени оценки.</p>
        </section>
      )}

      {!loading && stats && (
        <>
          <div className="stat-strip">
            <div className="stat-tile" style={{ '--tile-accent': tierColor(stats.overallAvg) } as CSSProperties}>
              <ChartIcon />
              <div>
                <strong>{stats.overallAvg.toFixed(2)}</strong>
                <span>Среден успех</span>
              </div>
            </div>
            <div className="stat-tile">
              <JournalIcon />
              <div>
                <strong>{stats.total}</strong>
                <span>Оценки</span>
              </div>
            </div>
            <div className="stat-tile" style={{ '--tile-accent': 'var(--success)' } as CSSProperties}>
              <TrophyIcon />
              <div>
                <strong>{stats.studentCount}</strong>
                <span>Студенти</span>
              </div>
            </div>
            <div className="stat-tile">
              <BooksIcon />
              <div>
                <strong>{stats.retakeCount}</strong>
                <span>Поправителни</span>
              </div>
            </div>
          </div>

          <section className="card">
            <h2>Разпределение на оценките</h2>
            <div className="subject-bars">
              {stats.distribution.map(({ value, count, pct }) => (
                <div className="subject-bar-row" key={value}>
                  <span className="subject-bar-label">Оценка {value}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${pct}%`, background: gradeColor(value) }} />
                  </div>
                  <span className="subject-bar-value">
                    {count} <small>({pct.toFixed(0)}%)</small>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>По предмети</h2>
            <div className="subject-bars">
              {stats.subjectAverages.map(({ subject, avg, count }) => (
                <div className="subject-bar-row" key={subject}>
                  <span className="subject-bar-label">{subject}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${(avg / GRADE_VALUES[GRADE_VALUES.length - 1]) * 100}%`, background: tierColor(avg) }} />
                  </div>
                  <span className="subject-bar-value">
                    {avg.toFixed(2)} <small>({count})</small>
                  </span>
                </div>
              ))}
            </div>
          </section>

          {stats.semesterAverages.length > 1 && (
            <section className="card">
              <h2>Развитие по семестри</h2>
              <div className="semester-trend">
                {stats.semesterAverages.map(({ semester, avg }) => (
                  <div className="semester-pill" key={semester}>
                    <span className="semester-pill-label">Сем. {semester}</span>
                    <span className="semester-pill-value" style={{ color: tierColor(avg) }}>
                      {avg.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {stats.retakeCount > 0 && (
            <section className="card">
              <h2>Редовна срещу поправителна сесия</h2>
              <div className="retake-split">
                <div className="retake-tile">
                  <strong>{stats.regularAvg?.toFixed(2) ?? '—'}</strong>
                  <span>Редовна сесия</span>
                </div>
                <div className="retake-tile">
                  <strong>{stats.retakeAvg?.toFixed(2) ?? '—'}</strong>
                  <span>Поправителна сесия ({stats.retakeCount})</span>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </Layout>
  );
}

function KeyedAverageBars({ title, entries }: { title: string; entries: { key: string; avg: number; count: number }[] }) {
  if (entries.length === 0) return null;
  return (
    <section className="card">
      <h2>{title}</h2>
      <div className="subject-bars">
        {entries.map(({ key, avg, count }) => (
          <div className="subject-bar-row" key={key}>
            <span className="subject-bar-label">{key}</span>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: `${(avg / GRADE_VALUES[GRADE_VALUES.length - 1]) * 100}%`, background: tierColor(avg) }}
              />
            </div>
            <span className="subject-bar-value">
              {avg.toFixed(2)} <small>({count})</small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * System-wide counterpart to {@link TeacherStatistics}: same stat-tile and
 * bar-chart building blocks, but spanning every teacher's grades, with a
 * pass/fail rate tile and faculty/specialty/group breakdowns on top — none
 * of which a single teacher's own statistics need.
 */
function AdminStatistics() {
  const { grades, error, loading } = useAdminGrades();

  const stats = useMemo(() => {
    if (grades.length === 0) return null;

    // grades.length > 0 here, so this can never be the empty-input case.
    const overallAvg = average(grades.map((g) => g.grade))!;
    const distribution = GRADE_VALUES.map((value) => {
      const count = grades.filter((g) => g.grade === value).length;
      return { value, count, pct: (count / grades.length) * 100 };
    });
    const studentCount = new Set(grades.map((g) => g.studentUsername)).size;
    const passCount = grades.filter((g) => g.grade > FAIL_GRADE).length;
    const passRate = (passCount / grades.length) * 100;

    const byFaculty = averagesByKey(
      grades.filter((g): g is typeof g & { faculty: string } => !!g.faculty),
      (g) => g.faculty
    );
    const bySpecialty = averagesByKey(
      grades.filter((g): g is typeof g & { specialty: string } => !!g.specialty),
      (g) => g.specialty
    );
    const byGroup = averagesByKey(
      grades.filter((g): g is typeof g & { groupNumber: string } => !!g.groupNumber),
      (g) => g.groupNumber
    );

    return { overallAvg, total: grades.length, distribution, studentCount, passRate, byFaculty, bySpecialty, byGroup };
  }, [grades]);

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
          <p>Все още няма въведени оценки.</p>
        </section>
      )}

      {!loading && stats && (
        <>
          <div className="stat-strip">
            <div className="stat-tile" style={{ '--tile-accent': tierColor(stats.overallAvg) } as CSSProperties}>
              <ChartIcon />
              <div>
                <strong>{stats.overallAvg.toFixed(2)}</strong>
                <span>Общ успех</span>
              </div>
            </div>
            <div className="stat-tile">
              <JournalIcon />
              <div>
                <strong>{stats.total}</strong>
                <span>Оценки</span>
              </div>
            </div>
            <div className="stat-tile" style={{ '--tile-accent': 'var(--success)' } as CSSProperties}>
              <StudentsIcon />
              <div>
                <strong>{stats.studentCount}</strong>
                <span>Студенти</span>
              </div>
            </div>
            <div className="stat-tile">
              <TrophyIcon />
              <div>
                <strong>{stats.passRate.toFixed(0)}%</strong>
                <span>Успеваемост</span>
              </div>
            </div>
          </div>

          <section className="card">
            <h2>Разпределение на оценките</h2>
            <div className="subject-bars">
              {stats.distribution.map(({ value, count, pct }) => (
                <div className="subject-bar-row" key={value}>
                  <span className="subject-bar-label">Оценка {value}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${pct}%`, background: gradeColor(value) }} />
                  </div>
                  <span className="subject-bar-value">
                    {count} <small>({pct.toFixed(0)}%)</small>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <KeyedAverageBars title="По факултет" entries={stats.byFaculty} />
          <KeyedAverageBars title="По специалност" entries={stats.bySpecialty} />
          <KeyedAverageBars title="По група" entries={stats.byGroup} />
        </>
      )}
    </Layout>
  );
}
