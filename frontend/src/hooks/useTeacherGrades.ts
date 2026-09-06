import { createResourceCache } from '../api/resourceCache';
import { useApiResource } from './useApiResource';
import type { TeacherGradeSummary } from '../types';

// Начало, Дневник and Статистики (teacher role) all render this same list,
// so without a shared cache every navigation between them refetches identical
// data — same reasoning as useStudentGrades.
const teacherGradesCache = createResourceCache<TeacherGradeSummary[]>();

const NO_GRADES: TeacherGradeSummary[] = [];

export function useTeacherGrades(enabled = true) {
  const { data, error, loading, reload } = useApiResource<TeacherGradeSummary[]>(
    '/teacher/grades',
    enabled,
    teacherGradesCache
  );
  return { grades: data ?? NO_GRADES, error, loading, reload };
}
