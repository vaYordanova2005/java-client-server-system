import { useMemo, type CSSProperties } from 'react';
import { Layout } from '../routes/Layout';
import { ChartIcon, JournalIcon, TrophyIcon, BooksIcon } from '../components/icons';
import { useTeacherGrades } from '../hooks/useTeacherGrades';
import { average, tierColor } from '../utils/grades';

export function TeacherDashboard() {
  const { grades } = useTeacherGrades();

  const stats = useMemo(() => {
    if (grades.length === 0) return null;
    return {
      overallAvg: average(grades.map((g) => g.grade)),
      studentCount: new Set(grades.map((g) => g.studentUsername)).size,
      subjectCount: new Set(grades.map((g) => g.subject)).size,
    };
  }, [grades]);

  return (
    <Layout>
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
            <span>Студенти</span>
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
    </Layout>
  );
}
