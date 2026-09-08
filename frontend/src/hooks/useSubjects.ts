import { createResourceCache } from '../api/resourceCache';
import { useApiResource } from './useApiResource';
import type { Subject } from '../types';

const subjectsCache = createResourceCache<Subject[]>();

const NO_SUBJECTS: Subject[] = [];

export function useSubjects(enabled = true) {
  const { data, error, loading, reload } = useApiResource<Subject[]>('/admin/subjects', enabled, subjectsCache);
  return { subjects: data ?? NO_SUBJECTS, error, loading, reload };
}
