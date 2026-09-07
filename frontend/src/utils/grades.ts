import type { GradeSummary, GradeType } from '../types';

export const TOP_GRADE = 6;
export const FAIL_GRADE = 2;
const EXCELLENT_THRESHOLD = 5.5;
const GOOD_THRESHOLD = 4.5;

export function average(values: number[]): number {
  if (values.length === 0) return 0;
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

export const GRADE_TYPES: GradeType[] = ['TEST', 'ORAL_EXAM', 'CLASS_TEST', 'REGULAR', 'RETAKE'];

export const GRADE_TYPE_LABELS: Record<GradeType, string> = {
  TEST: 'Тест',
  ORAL_EXAM: 'Устно изпитване',
  CLASS_TEST: 'Контролна работа',
  REGULAR: 'Редовна сесия',
  RETAKE: 'Поправителна сесия',
};

/**
 * {@link GRADE_TYPE_LABELS} is indexed by every caller directly, which
 * renders the literal string `undefined` for a type the map doesn't know
 * about — legacy data or a value added on the backend before the frontend
 * catches up. This falls back to a dash instead.
 */
export function gradeTypeLabel(type: GradeType | null | undefined): string {
  return (type && GRADE_TYPE_LABELS[type]) || '—';
}
