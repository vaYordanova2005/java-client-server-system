import { useEffect, useState } from 'react';
import apiClient, { extractErrorMessage } from '../api/client';
import type { PageResponse, UserSummary } from '../types';

const EMPTY_PAGE: PageResponse<UserSummary> = { content: [], page: 0, size: 50, totalElements: 0, totalPages: 0 };

interface Loaded {
  /** Which request this data answers; `null` until the first one settles. */
  key: string | null;
  result: PageResponse<UserSummary>;
  error: string | null;
}

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
  const [reloadToken, setReloadToken] = useState(0);
  const [loaded, setLoaded] = useState<Loaded>({ key: null, result: EMPTY_PAGE, error: null });

  const key = `${page}|${size}|${reloadToken}`;
  // Derived rather than its own `setLoading(true)` at the top of the effect:
  // setting state synchronously in an effect body is a cascading render (and
  // a react-hooks lint error). "The data on screen doesn't answer the
  // request we're currently making" is the same condition, read straight off
  // the state instead of maintained as a second copy of it.
  const loading = loaded.key !== key;

  useEffect(() => {
    let ignore = false;
    apiClient.get<PageResponse<UserSummary>>('/admin/users', { params: { page, size } }).then(
      (response) => {
        if (ignore) return;
        setLoaded({ key, result: response.data, error: null });
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
        setLoaded((previous) => ({ key, result: previous.result, error: extractErrorMessage(err) }));
      }
    );
    return () => {
      ignore = true;
    };
  }, [key, page, size]);

  return {
    result: loaded.result,
    error: loaded.error,
    loading,
    reload: () => setReloadToken((t) => t + 1),
  };
}
