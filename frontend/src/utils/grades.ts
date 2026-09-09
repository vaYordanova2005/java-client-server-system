import type { GradeSummary, GradeType } from '../types';

export const TOP_GRADE = 6;
export const FAIL_GRADE = 2;
const EXCELLENT_THRESHOLD = 5.5;
const GOOD_THRESHOLD = 4.5;

/**
 * `null` for an empty input rather than `0` — a 0 renders identically to a
 * genuine average of 0 (and `tierColor(0)` would paint it red as if it were
 * a real, terrible average), silently lying about there being data at all.
 * Every current caller already guards with a `.length` check before calling
 * this, so `null` never actually reaches them; it exists for the next
 * caller that doesn't.
 */
export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** For averages. A single grade should use {@link gradeColor} instead. */
export function tierColor(avg: number): string {
  if (avg >= EXCELLENT_THRESHOLD) return 'var(--success)';
  if (avg >= GOOD_THRESHOLD) return 'var(--primary)';
  return 'var(--error)';
}

/**
 * The {@link tierColor} thresholds are tuned for averages, where anything
 * below 4.5 is weak; applied to a single grade they paint a 4 in the same
 * alarming red as a 2. On its own only a 2 is a failing grade.
 */
export function gradeColor(grade: number): string {
  if (grade >= TOP_GRADE) return 'var(--success)';
  if (grade <= FAIL_GRADE) return 'var(--error)';
  return 'var(--primary)';
}

export function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = groups.get(k);
    if (bucket) bucket.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

/**
 * `localeCompare` alone orders `student10` before `student2`, since it
 * compares the digits character by character. The numeric collator compares
 * runs of digits as numbers, so `student2 < student10` — the order a teacher
 * scanning a roster expects. Also used for group numbers, which are short
 * numeric strings for the same reason.
 */
const collator = new Intl.Collator('bg', { numeric: true, sensitivity: 'base' });

export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b);
}

export interface SubjectAverage {
  subject: string;
  avg: number;
  count: number;
}

export interface SemesterAverage {
  semester: number;
  avg: number;
  count: number;
}

/**
 * Best first — every caller so far ranks subjects by success. Generic over
 * `{ subject, grade }` (not just {@link GradeSummary}) so a teacher's
 * `TeacherGradeSummary[]` — which spans many students but shares the same
 * subject/grade fields — can reuse this without a parallel copy.
 */
export function subjectAverages<T extends { subject: string; grade: number }>(grades: T[]): SubjectAverage[] {
  return [...groupBy(grades, (g) => g.subject).entries()]
    .map(([subject, entries]) => ({
      subject,
      // groupBy only ever creates a bucket by pushing to it, so `entries` is
      // never empty here — average() only returns null for `[]`.
      avg: average(entries.map((g) => g.grade))!,
      count: entries.length,
    }))
    .sort((a, b) => b.avg - a.avg);
}

/**
 * Chronological — these feed trend lines, which have to read left to right.
 * Generic for the same reason as {@link subjectAverages}.
 */
export function semesterAverages<T extends { semester: number; grade: number }>(grades: T[]): SemesterAverage[] {
  return [...groupBy(grades, (g) => g.semester).entries()]
    .map(([semester, entries]) => ({
      semester,
      // Same reasoning as subjectAverages above: entries is never empty.
      avg: average(entries.map((g) => g.grade))!,
      count: entries.length,
    }))
    .sort((a, b) => a.semester - b.semester);
}

export interface KeyedAverage {
  key: string;
  avg: number;
  count: number;
}

/**
 * Generic counterpart to {@link subjectAverages}/{@link semesterAverages}:
 * the admin statistics page breaks grades down by faculty, specialty, and
 * group — three different string keys on the same {@code AdminGradeSummary}
 * shape — so a single by-any-key-that-groups-cleanly-into-a-string helper
 * covers all three instead of three near-identical copies.
 */
export function averagesByKey<T extends { grade: number }>(items: T[], key: (item: T) => string): KeyedAverage[] {
  return [...groupBy(items, key).entries()]
    .map(([k, entries]) => ({
      key: k,
      // groupBy only ever creates a bucket by pushing to it, so `entries` is
      // never empty here — average() only returns null for `[]`.
      avg: average(entries.map((e) => e.grade))!,
      count: entries.length,
    }))
    .sort((a, b) => b.avg - a.avg);
}

type Recorded = Pick<GradeSummary, 'id' | 'createdAt'>;

/**
 * `createdAt.localeCompare` looks right for ISO-8601 but orders two stamps in
 * the same second wrongly when one carries fractional digits and the other
 * does not: `'2024-01-01T10:00:00.123Z'` sorts before `'2024-01-01T10:00:00Z'`
 * because `'.' < 'Z'`. Comparing parsed instants cannot reorder equal times.
 * Truly identical instants fall back to `id`, which follows insertion order,
 * so grades written in a single batch still get a stable — and reproducible —
 * regular/retake split.
 */
export function byCreatedAt(a: Recorded, b: Recorded): number {
  const diff = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  return diff !== 0 ? diff : a.id - b.id;
}

export const GRADE_TYPES: GradeType[] = ['TEST', 'ORAL_EXAM', 'CLASS_TEST', 'REGULAR', 'RETAKE'];

/**
 * Indexing straight into the `gradeType.*` translations would render the
 * literal key string for a type the dictionary doesn't know about — legacy
 * data or a value added on the backend before the frontend catches up. This
 * falls back to a dash instead.
 */
export function gradeTypeLabel(type: GradeType | null | undefined, t: (key: string) => string): string {
  return type ? t(`gradeType.${type}`) : '—';
}
