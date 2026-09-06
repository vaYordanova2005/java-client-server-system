import type { GradeSummary } from '../types';

export const TOP_GRADE = 6;
export const FAIL_GRADE = 2;
const EXCELLENT_THRESHOLD = 5.5;
const GOOD_THRESHOLD = 4.5;

export function average(values: number[]): number {
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
      avg: average(entries.map((g) => g.grade)),
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
      avg: average(entries.map((g) => g.grade)),
      count: entries.length,
    }))
    .sort((a, b) => a.semester - b.semester);
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

export type SessionType = 'regular' | 'retake';

/**
 * No real "session type" field in the data yet: only one grade per
 * semester+subject can be the regular session — whichever was recorded
 * first — and every later grade for that same semester+subject is a retake
 * ("поправителна сесия"), regardless of its value.
 *
 * `keyFn` defaults to `semester::subject`, correct for a single student's
 * own grades (the only case every existing caller uses). A grade list that
 * mixes several students — e.g. a teacher's own-entered grades — must pass a
 * `keyFn` that also includes the student (`studentUsername::semester::subject`),
 * or grades from different students in the same semester+subject would be
 * grouped together and mislabeled.
 */
export function classifySessionTypes<T extends Recorded & { semester: number; subject: string }>(
  grades: T[],
  keyFn: (g: T) => string = (g) => `${g.semester}::${g.subject}`
): Map<number, SessionType> {
  const result = new Map<number, SessionType>();
  for (const bucket of groupBy(grades, keyFn).values()) {
    [...bucket]
      .sort(byCreatedAt)
      .forEach((g, index) => result.set(g.id, index === 0 ? 'regular' : 'retake'));
  }
  return result;
}
