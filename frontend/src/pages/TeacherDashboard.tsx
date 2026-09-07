import { useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../routes/Layout';
import { ChartIcon, JournalIcon, TrophyIcon, BooksIcon } from '../components/icons';
import { useTeacherGrades } from '../hooks/useTeacherGrades';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { average, byCreatedAt, FAIL_GRADE, gradeColor, groupBy, tierColor } from '../utils/grades';
import { formatDateShort, toDateKey, TYPE_LABELS } from '../utils/calendar';

const RECENT_COUNT = 5;
const UPCOMING_COUNT = 5;
const WATCHLIST_COUNT = 6;
// Below this, a student's own average already reads red via tierColor — no
// need for a fail grade specifically to land them on the watchlist too.
const WATCHLIST_AVG_THRESHOLD = 3.5;

export function TeacherDashboard() {
  const { grades, error, loading } = useTeacherGrades();
  const { events } = useCalendarEvents();

  const stats = useMemo(() => {
    if (grades.length === 0) return null;
    return {
      // grades.length > 0 here, so this can never be the empty-input case.
      overallAvg: average(grades.map((g) => g.grade))!,
      studentCount: new Set(grades.map((g) => g.studentUsername)).size,
      subjectCount: new Set(grades.map((g) => g.subject)).size,
    };
  }, [grades]);

  // The backend already orders by createdAt desc, but that's an
  // implementation detail of one endpoint — sorting explicitly here means
  // the preview stays correct even if that ordering ever changes.
  const recentGrades = useMemo(() => [...grades].sort(byCreatedAt).reverse().slice(0, RECENT_COUNT), [grades]);

  // Worst average first — a teacher glancing at the home page wants to know
  // who to check on, not who's already fine. Unlike Students/Statistics,
  // nothing else in the app ranks individual students by risk.
  const watchlist = useMemo(() => {
    return [...groupBy(grades, (g) => g.studentUsername).entries()]
      .map(([studentUsername, entries]) => ({
        studentUsername,
        facultyNumber: entries[0].facultyNumber,
        // entries comes from groupBy, so it's never empty.
        avg: average(entries.map((g) => g.grade))!,
        failSubjects: [...new Set(entries.filter((g) => g.grade === FAIL_GRADE).map((g) => g.subject))],
      }))
      .filter((s) => s.failSubjects.length > 0 || s.avg < WATCHLIST_AVG_THRESHOLD)
      .sort((a, b) => a.avg - b.avg)
      .slice(0, WATCHLIST_COUNT);
  }, [grades]);

  const upcomingEvents = useMemo(() => {
    const todayKey = toDateKey(new Date());
    return [...events]
      .filter((e) => (e.endDate ?? e.startDate) >= todayKey)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, UPCOMING_COUNT);
  }, [events]);

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
          <p>
            Все още нямате въведени оценки. Започнете от <Link to="/journal">Дневника</Link>.
          </p>
        </section>
      )}

      {!loading && stats && (
        <>
          <div className="stat-strip">
            <Link
              to="/statistics"
              className="stat-tile"
              style={{ '--tile-accent': tierColor(stats.overallAvg) } as CSSProperties}
            >
              <ChartIcon />
              <div>
                <strong>{stats.overallAvg.toFixed(2)}</strong>
                <span>Среден успех</span>
              </div>
            </Link>
            <Link to="/journal" className="stat-tile">
              <JournalIcon />
              <div>
                <strong>{grades.length}</strong>
                <span>Оценки</span>
              </div>
            </Link>
            <Link to="/students" className="stat-tile">
              <TrophyIcon />
              <div>
                <strong>{stats.studentCount}</strong>
                <span>Студенти</span>
              </div>
            </Link>
            <Link to="/statistics" className="stat-tile">
              <BooksIcon />
              <div>
                <strong>{stats.subjectCount}</strong>
                <span>Предмети</span>
              </div>
            </Link>
          </div>

          <section className="card">
            <div className="card-heading">
              <h2>Последно въведени оценки</h2>
              <Link to="/journal" className="card-link">
                Виж всички →
              </Link>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Студент</th>
                  <th>Предмет</th>
                  <th>Сем.</th>
                  <th>Оценка</th>
                  <th>Дата</th>
                </tr>
              </thead>
              <tbody>
                {recentGrades.map((g) => (
                  <tr key={g.id}>
                    <td>{g.studentUsername}</td>
                    <td>{g.subject}</td>
                    <td>{g.semester}</td>
                    <td>{g.grade}</td>
                    <td>{new Date(g.createdAt).toLocaleDateString('bg-BG')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card">
            <div className="card-heading">
              <h2>Нуждаят се от внимание</h2>
              <Link to="/students" className="card-link">
                Всички студенти →
              </Link>
            </div>
            {watchlist.length === 0 ? (
              <p>Никой от студентите ви няма слаба оценка или нисък успех в момента.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Студент</th>
                    <th>Ср. успех</th>
                    <th>Слаби оценки по</th>
                  </tr>
                </thead>
                <tbody>
                  {watchlist.map(({ studentUsername, facultyNumber, avg, failSubjects }) => (
                    <tr key={studentUsername}>
                      <td>
                        {studentUsername}
                        {facultyNumber ? <small style={{ opacity: 0.6 }}> ({facultyNumber})</small> : null}
                      </td>
                      <td style={{ color: tierColor(avg) }}>{avg.toFixed(2)}</td>
                      <td style={{ color: failSubjects.length ? gradeColor(FAIL_GRADE) : undefined }}>
                        {failSubjects.length ? failSubjects.join(', ') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card">
            <div className="card-heading">
              <h2>Предстоящо в календара</h2>
              <Link to="/calendar" className="card-link">
                Целият календар →
              </Link>
            </div>
            {upcomingEvents.length === 0 ? (
              <p>Няма предстоящи записи.</p>
            ) : (
              <ul className="calendar-event-list">
                {upcomingEvents.map((e) => (
                  <li key={e.id} className="calendar-event-item">
                    <span className={`calendar-pill calendar-pill-${e.type.toLowerCase()}`} />
                    <div>
                      <strong>{e.title}</strong>{' '}
                      <span className="calendar-event-type">
                        ({TYPE_LABELS[e.type]}
                        {e.subject ? ` · ${e.subject}` : ''}) · {formatDateShort(e.startDate)}
                        {e.endDate && e.endDate !== e.startDate ? ` – ${formatDateShort(e.endDate)}` : ''}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </Layout>
  );
}
