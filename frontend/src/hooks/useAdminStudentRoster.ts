import { createResourceCache } from '../api/resourceCache';
import { useApiResource } from './useApiResource';
import type { StudentRosterSummary } from '../types';

// Admin's Journal page builds its specialty/group tree from this and
// overlays useAdminGrades on top, same reasoning as useAllStudents.
const adminRosterCache = createResourceCache<StudentRosterSummary[]>();

const NO_STUDENTS: StudentRosterSummary[] = [];

export function useAdminStudentRoster(enabled = true) {
  const { data, error, loading, reload } = useApiResource<StudentRosterSummary[]>(
    '/admin/students',
    enabled,
    adminRosterCache
  );
  return { students: data ?? NO_STUDENTS, error, loading, reload };
}
