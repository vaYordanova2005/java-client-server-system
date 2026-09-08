import { useApiResource } from './useApiResource';
import type { AuditLogEntry, PageResponse } from '../types';

export interface AuditLogFilters {
  eventType?: string;
  actorUsername?: string;
  targetUsername?: string;
  involving?: string;
}

const EMPTY_PAGE: PageResponse<AuditLogEntry> = { content: [], page: 0, size: 50, totalElements: 0, totalPages: 0 };

function buildPath(filters: AuditLogFilters, page: number, size: number): string {
  const params = new URLSearchParams();
  if (filters.eventType) params.set('eventType', filters.eventType);
  if (filters.actorUsername) params.set('actorUsername', filters.actorUsername);
  if (filters.targetUsername) params.set('targetUsername', filters.targetUsername);
  if (filters.involving) params.set('involving', filters.involving);
  params.set('page', String(page));
  params.set('size', String(size));
  return `/admin/audit-log?${params.toString()}`;
}

/**
 * No shared cache, unlike useTeacherGrades/useAllStudents/useAdminGrades:
 * the query is parameterized by filters and page, so there is no single
 * fixed path for other components to usefully share.
 */
export function useAuditLog(filters: AuditLogFilters, page: number, size = 50) {
  const path = buildPath(filters, page, size);
  const { data, error, loading, reload } = useApiResource<PageResponse<AuditLogEntry>>(path);
  return { result: data ?? EMPTY_PAGE, error, loading, reload };
}
