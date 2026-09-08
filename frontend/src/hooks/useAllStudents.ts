import { createResourceCache } from '../api/resourceCache';
import { useApiResource } from './useApiResource';
import type { StudentRosterSummary } from '../types';

// StudentsPage builds its specialty/group tree from this and overlays
// useTeacherGrades on top, so both need to stay independently cacheable —
// same reasoning as useTeacherGrades.
const rosterCache = createResourceCache<StudentRosterSummary[]>();

const NO_STUDENTS: StudentRosterSummary[] = [];

export function useAllStudents(enabled = true) {
  const { data, error, loading, reload } = useApiResource<StudentRosterSummary[]>(
    '/teacher/students',
    enabled,
    rosterCache
  );
  return { students: data ?? NO_STUDENTS, error, loading, reload };
}
