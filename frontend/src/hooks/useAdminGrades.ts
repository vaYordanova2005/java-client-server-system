import { createResourceCache } from '../api/resourceCache';
import { useApiResource } from './useApiResource';
import type { AdminGradeSummary } from '../types';

// Admin's Journal and Statistics pages both render this same list, same
// sharing reasoning as useTeacherGrades.
const adminGradesCache = createResourceCache<AdminGradeSummary[]>();

const NO_GRADES: AdminGradeSummary[] = [];

export function useAdminGrades(enabled = true) {
  const { data, error, loading, reload } = useApiResource<AdminGradeSummary[]>(
    '/admin/grades',
    enabled,
    adminGradesCache
  );
  return { grades: data ?? NO_GRADES, error, loading, reload };
}
