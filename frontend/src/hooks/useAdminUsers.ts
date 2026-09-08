import { useEffect, useState } from 'react';
import apiClient, { extractErrorMessage } from '../api/client';
import type { PageResponse, UserSummary } from '../types';

const EMPTY_PAGE: PageResponse<UserSummary> = { content: [], page: 0, size: 50, totalElements: 0, totalPages: 0 };

/**
 * Deliberately not built on {@code useApiResource}/{@code resourceCache}
 * (unlike {@code useAuditLog}): that machinery's `loading` means "has never
 * loaded" — right for a single background-revalidated resource, since it's
 * meant to keep showing what's on screen rather than flash a spinner on
 * every silent refresh. Switching pages here is a foreground action fetching
 * genuinely different rows, so the admin should see that a fetch is under
 * way instead of having one page's data silently swapped for another's with
 * no indication anything happened in between.
 */
export function useAdminUsers(page: number, size = 50) {
  const [result, setResult] = useState<PageResponse<UserSummary>>(EMPTY_PAGE);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    apiClient.get<PageResponse<UserSummary>>('/admin/users', { params: { page, size } }).then(
      (response) => {
        if (ignore) return;
        setResult(response.data);
        setError(null);
        setLoading(false);
      },
      (err) => {
        if (ignore) return;
        // `result` is deliberately left as whatever page was showing before
        // (not reset to EMPTY_PAGE) — same "stale data + a surfaced error"
        // choice as useAdminGrades's reload(), so a failed page turn doesn't
        // wipe out an otherwise-fine table out from under the admin. The
        // caller currently renders the error in place of the table rather
        // than alongside it (see AdminDashboard), but `result` stays correct
        // for a caller that wants to show both.
        setError(extractErrorMessage(err));
        setLoading(false);
      }
    );
    return () => {
      ignore = true;
    };
  }, [page, size, reloadToken]);

  return { result, error, loading, reload: () => setReloadToken((t) => t + 1) };
}
