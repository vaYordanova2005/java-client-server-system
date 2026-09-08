import { useEffect, useSyncExternalStore } from 'react';
import apiClient, { extractErrorMessage } from '../api/client';
import type { AdminGradeSummary, PageResponse } from '../types';

/**
 * The backend paginates `GET /admin/grades` (bounded query/response per
 * page), but JournalPage's and StatisticsPage's admin views both aggregate
 * client-side over the *entire* admin grade set (by faculty/specialty/group/
 * semester) — so this hook walks every page and concatenates, keeping the
 * same "one flat array" shape those pages already consume. That still costs
 * the same total transfer as the old single unpaginated call, but each
 * individual request/query now stays bounded instead of the backend running
 * one unbounded SELECT whose result only grows over time.
 *
 * The state below (`snapshot`, `inflight`, `generation`) is module-level, not
 * per-hook-call, so every mounted consumer shares one fetch/cache — the point
 * being that JournalPage and StatisticsPage, both calling this hook, read the
 * same grades instead of each paying for their own full walk. That sharing
 * extends to `fetching`/`loading` too: if one of them ever calls `reload()`,
 * both see the same spinner state at the same time, not just the same data —
 * intentional (it's one logical resource, not two), just worth being
 * explicit about since nothing here scopes it per-caller.
 */
const PAGE_SIZE = 500;

interface Snapshot {
  data: AdminGradeSummary[] | null;
  error: string | null;
  loaded: boolean;
  /** A fetch (initial or `reload()`) is currently in flight — shared module-wide, see above. */
  fetching: boolean;
}

let snapshot: Snapshot = { data: null, error: null, loaded: false, fetching: false };
let inflight: Promise<void> | null = null;
let generation = 0;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

async function fetchAllPages(): Promise<AdminGradeSummary[]> {
  const all: AdminGradeSummary[] = [];
  let page = 0;
  let totalPages = 1;
  do {
    const response = await apiClient.get<PageResponse<AdminGradeSummary>>('/admin/grades', {
      params: { page, size: PAGE_SIZE },
    });
    all.push(...response.data.content);
    totalPages = response.data.totalPages;
    page += 1;
  } while (page < totalPages);
  return all;
}

function fetchNow(force: boolean): Promise<void> {
  if (inflight && !force) return inflight;
  if (force) generation += 1;
  const startedAt = generation;

  snapshot = { ...snapshot, fetching: true };
  notify();

  const request = fetchAllPages()
    .then((all) => {
      if (startedAt !== generation) return;
      snapshot = { data: all, error: null, loaded: true, fetching: false };
      notify();
    })
    .catch((err) => {
      if (startedAt !== generation) return;
      // Surfaced even when stale data exists, unlike resourceCache's
      // background revalidation (TTL expiry / window focus): `reload()`
      // here is only ever triggered by an explicit action expecting a
      // response, so swallowing the failure would leave the admin looking
      // at data that might now be wrong with no signal anything went wrong.
      // The old data is still kept on screen (not blanked) — JournalPage's
      // and StatisticsPage's admin views already render their
      // grades-derived content unconditionally alongside an `error` banner,
      // so this surfaces as "stale data + a visible error", not a blank page.
      snapshot = { data: snapshot.data, error: extractErrorMessage(err), loaded: true, fetching: false };
      notify();
    })
    .finally(() => {
      if (inflight === request) inflight = null;
    });

  inflight = request;
  return request;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Snapshot {
  return snapshot;
}

const NO_GRADES: AdminGradeSummary[] = [];

export function useAdminGrades(enabled = true) {
  const current = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    if (enabled && !snapshot.loaded) fetchNow(false);
  }, [enabled]);

  return {
    grades: current.data ?? NO_GRADES,
    error: current.error,
    // `fetching` (not just `!loaded`) so a `reload()` after the first
    // successful load is reflected too, instead of `loading` going stale
    // at `false` forever past the initial fetch.
    loading: enabled && (!current.loaded || current.fetching),
    reload: () => fetchNow(true),
  };
}
