import { useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../routes/Layout';
import { useLanguage } from '../i18n/useLanguage';
import { ChartIcon, JournalIcon, TrophyIcon, BooksIcon } from '../components/icons';
import { useTeacherGrades } from '../hooks/useTeacherGrades';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { average, byCreatedAt, FAIL_GRADE, gradeColor, groupBy, tierColor } from '../utils/grades';
import { eventTypeLabel, formatDateOnly, formatDateShort, toDateKey } from '../utils/calendar';

const RECENT_COUNT = 5;
const UPCOMING_COUNT = 5;
const WATCHLIST_COUNT = 6;
// Below this, a student's own average already reads red via tierColor — no
// need for a fail grade specifically to land them on the watchlist too.
const WATCHLIST_AVG_THRESHOLD = 3.5;

export function TeacherDashboard() {
  const { t, language } = useLanguage();
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
          <p>{t('common.loading')}</p>
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
            {t('teacherDashboard.noGradesPrefix')}
            <Link to="/journal">{t('teacherDashboard.noGradesLink')}</Link>
            {t('teacherDashboard.noGradesSuffix')}
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
                <span>{t('teacherDashboard.statAverage')}</span>
              </div>
            </Link>
            <Link to="/journal" className="stat-tile">
              <JournalIcon />
              <div>
                <strong>{grades.length}</strong>
                <span>{t('teacherDashboard.statGrades')}</span>
              </div>
            </Link>
            <Link to="/students" className="stat-tile">
              <TrophyIcon />
              <div>
                <strong>{stats.studentCount}</strong>
                <span>{t('teacherDashboard.statStudents')}</span>
              </div>
            </Link>
            <Link to="/statistics" className="stat-tile">
              <BooksIcon />
              <div>
                <strong>{stats.subjectCount}</strong>
                <span>{t('teacherDashboard.statSubjects')}</span>
              </div>
            </Link>
          </div>

          <section className="card">
            <div className="card-heading">
              <h2>{t('teacherDashboard.recentHeading')}</h2>
              <Link to="/journal" className="card-link">
                {t('teacherDashboard.viewAll')}
              </Link>
            </div>
            <table>
              <thead>
                <tr>
                  <th>{t('teacherDashboard.colStudent')}</th>
                  <th>{t('teacherDashboard.colSubject')}</th>
                  <th>{t('teacherDashboard.colSemester')}</th>
                  <th>{t('teacherDashboard.colGrade')}</th>
                  <th>{t('teacherDashboard.colDate')}</th>
                </tr>
              </thead>
              <tbody>
                {recentGrades.map((g) => (
                  <tr key={g.id}>
                    <td>{g.studentUsername}</td>
                    <td>{g.subject}</td>
                    <td>{g.semester}</td>
                    <td>{g.grade}</td>
                    <td>{formatDateOnly(new Date(g.createdAt), language)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card">
            <div className="card-heading">
              <h2>{t('teacherDashboard.watchlistHeading')}</h2>
              <Link to="/students" className="card-link">
                {t('teacherDashboard.allStudents')}
              </Link>
            </div>
            {watchlist.length === 0 ? (
              <p>{t('teacherDashboard.watchlistEmpty')}</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>{t('teacherDashboard.colStudent')}</th>
                    <th>{t('teacherDashboard.colAvg')}</th>
                    <th>{t('teacherDashboard.colFailSubjects')}</th>
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
              <h2>{t('teacherDashboard.upcomingHeading')}</h2>
              <Link to="/calendar" className="card-link">
                {t('teacherDashboard.fullCalendar')}
              </Link>
            </div>
            {upcomingEvents.length === 0 ? (
              <p>{t('teacherDashboard.upcomingEmpty')}</p>
            ) : (
              <ul className="calendar-event-list">
                {upcomingEvents.map((e) => (
                  <li key={e.id} className="calendar-event-item">
                    <span className={`calendar-pill calendar-pill-${e.type.toLowerCase()}`} />
                    <div>
                      <strong>{e.title}</strong>{' '}
                      <span className="calendar-event-type">
                        ({eventTypeLabel(e.type, t)}
                        {e.subject ? ` · ${e.subject}` : ''}) · {formatDateShort(e.startDate, language)}
                        {e.endDate && e.endDate !== e.startDate ? ` – ${formatDateShort(e.endDate, language)}` : ''}
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
