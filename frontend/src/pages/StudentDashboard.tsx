import { useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../routes/Layout';
import { useLanguage } from '../i18n/useLanguage';
import { ChartIcon, JournalIcon, TrophyIcon, BooksIcon } from '../components/icons';
import { useStudentGrades } from '../hooks/useStudentGrades';
import { average, semesterAverages, subjectAverages, tierColor, TOP_GRADE } from '../utils/grades';

export function StudentDashboard() {
  const { t } = useLanguage();
  const { grades, error, loading } = useStudentGrades();

  const stats = useMemo(() => {
    if (grades.length === 0) return null;
    // grades.length > 0 here, so this can never be the empty-input case.
    const overallAvg = average(grades.map((g) => g.grade))!;
    const excellentCount = grades.filter((g) => g.grade >= TOP_GRADE).length;
    const subjects = new Set(grades.map((g) => g.subject));

    return {
      overallAvg,
      excellentCount,
      subjectCount: subjects.size,
      subjectAverages: subjectAverages(grades),
      semesterAverages: semesterAverages(grades),
    };
  }, [grades]);

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
          <p>{t('studentDashboard.noGrades')}</p>
        </section>
      )}

      {!loading && stats && (
        <>
          <div className="stat-strip">
            <Link
              to="/journal"
              className="stat-tile"
              style={{ '--tile-accent': tierColor(stats.overallAvg) } as CSSProperties}
            >
              <ChartIcon />
              <div>
                <strong>{stats.overallAvg.toFixed(2)}</strong>
                <span>{t('studentDashboard.statAverage')}</span>
              </div>
            </Link>
            <Link to="/journal" className="stat-tile">
              <JournalIcon />
              <div>
                <strong>{grades.length}</strong>
                <span>{t('studentDashboard.statGrades')}</span>
              </div>
            </Link>
            <div className="stat-tile" style={{ '--tile-accent': 'var(--success)' } as CSSProperties}>
              <TrophyIcon />
              <div>
                <strong>{stats.excellentCount}</strong>
                <span>{t('studentDashboard.statExcellent')}</span>
              </div>
            </div>
            <div className="stat-tile">
              <BooksIcon />
              <div>
                <strong>{stats.subjectCount}</strong>
                <span>{t('studentDashboard.statSubjects')}</span>
              </div>
            </div>
          </div>

          <section className="card">
            <h2>{t('studentDashboard.bySubjectHeading')}</h2>
            <div className="subject-bars">
              {stats.subjectAverages.map(({ subject, avg, count }) => (
                <div className="subject-bar-row" key={subject}>
                  <span className="subject-bar-label">{subject}</span>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${(avg / TOP_GRADE) * 100}%`, background: tierColor(avg) }}
                    />
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
              <h2>{t('studentDashboard.bySemesterHeading')}</h2>
              <div className="semester-trend">
                {stats.semesterAverages.map(({ semester, avg }) => (
                  <div className="semester-pill" key={semester}>
                    <span className="semester-pill-label">{t('studentDashboard.semesterShort', { semester })}</span>
                    <span className="semester-pill-value" style={{ color: tierColor(avg) }}>
                      {avg.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </Layout>
  );
}
