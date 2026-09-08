import { describe, expect, it } from 'vitest';
import { average, averagesByKey, byCreatedAt, gradeColor, semesterAverages, subjectAverages } from './grades';
import type { GradeSummary } from '../types';

let nextId = 1;

function grade(partial: Partial<GradeSummary> = {}): GradeSummary {
  return {
    id: nextId++,
    subject: 'Програмиране',
    semester: 1,
    grade: 5,
    gradeType: 'REGULAR',
    createdAt: '2024-01-01T10:00:00Z',
    teacherUsername: 'teacher1@uni-sofia.bg',
    ...partial,
  };
}

describe('byCreatedAt', () => {
  it('orders by instant rather than by string', () => {
    const earlier = grade({ createdAt: '2024-01-01T10:00:00Z' });
    const later = grade({ createdAt: '2024-01-01T10:00:00.500Z' });
    expect(byCreatedAt(earlier, later)).toBeLessThan(0);
    expect(byCreatedAt(later, earlier)).toBeGreaterThan(0);
  });

  it('breaks ties on id', () => {
    const first = grade({ createdAt: '2024-01-01T10:00:00Z' });
    const second = grade({ createdAt: '2024-01-01T10:00:00Z' });
    expect(byCreatedAt(first, second)).toBeLessThan(0);
  });
});

describe('averages', () => {
  it('averages a subject across semesters, best first', () => {
    const grades = [
      grade({ subject: 'Обща физика', grade: 3 }),
      grade({ subject: 'Обща физика', grade: 5 }),
      grade({ subject: 'Програмиране', grade: 6 }),
    ];

    expect(subjectAverages(grades)).toEqual([
      { subject: 'Програмиране', avg: 6, count: 1 },
      { subject: 'Обща физика', avg: 4, count: 2 },
    ]);
  });

  it('orders semester averages chronologically', () => {
    const grades = [
      grade({ semester: 3, grade: 6 }),
      grade({ semester: 1, grade: 4 }),
      grade({ semester: 1, grade: 6 }),
    ];

    expect(semesterAverages(grades).map((s) => s.semester)).toEqual([1, 3]);
    expect(semesterAverages(grades)[0].avg).toBe(5);
  });

  it('averages plain values', () => {
    expect(average([2, 6])).toBe(4);
  });

  it('returns null rather than a misleading 0 for an empty input', () => {
    expect(average([])).toBeNull();
  });
});

describe('averagesByKey', () => {
  it('averages entries sharing a key, best key first', () => {
    const a1 = grade({ grade: 2 });
    const a2 = grade({ grade: 4 });
    const b1 = grade({ grade: 6 });
    const byFaculty = new Map([[a1, 'A'], [a2, 'A'], [b1, 'B']]);

    const result = averagesByKey([a1, a2, b1], (g) => byFaculty.get(g)!);

    expect(result).toEqual([
      { key: 'B', avg: 6, count: 1 },
      { key: 'A', avg: 3, count: 2 },
    ]);
  });
});

describe('gradeColor', () => {
  it('only paints a failing grade red', () => {
    expect(gradeColor(2)).toBe('var(--error)');
    expect(gradeColor(3)).toBe('var(--primary)');
    expect(gradeColor(4)).toBe('var(--primary)');
    expect(gradeColor(5)).toBe('var(--primary)');
    expect(gradeColor(6)).toBe('var(--success)');
  });
});
