import { describe, expect, it } from 'vitest';
import {
  average,
  byCreatedAt,
  classifySessionTypes,
  gradeColor,
  semesterAverages,
  subjectAverages,
} from './grades';
import type { GradeSummary } from '../types';

let nextId = 1;

function grade(partial: Partial<GradeSummary> = {}): GradeSummary {
  return {
    id: nextId++,
    subject: 'Програмиране',
    semester: 1,
    grade: 5,
    createdAt: '2024-01-01T10:00:00Z',
    teacherUsername: 'teacher1@uni-sofia.bg',
    ...partial,
  };
}

describe('classifySessionTypes', () => {
  it('marks the only grade for a subject as the regular session', () => {
    const only = grade();
    expect(classifySessionTypes([only]).get(only.id)).toBe('regular');
  });

  it('marks every later grade for the same semester and subject as a retake', () => {
    const first = grade({ createdAt: '2024-01-10T09:00:00Z', grade: 2 });
    const second = grade({ createdAt: '2024-02-10T09:00:00Z', grade: 4 });
    const third = grade({ createdAt: '2024-03-10T09:00:00Z', grade: 6 });

    const types = classifySessionTypes([third, first, second]);

    expect(types.get(first.id)).toBe('regular');
    expect(types.get(second.id)).toBe('retake');
    expect(types.get(third.id)).toBe('retake');
  });

  it('classifies a retake by when it was recorded, not by its value', () => {
    const first = grade({ createdAt: '2024-01-10T09:00:00Z', grade: 6 });
    const second = grade({ createdAt: '2024-02-10T09:00:00Z', grade: 2 });

    const types = classifySessionTypes([first, second]);

    expect(types.get(first.id)).toBe('regular');
    expect(types.get(second.id)).toBe('retake');
  });

  it('keeps subjects and semesters in separate groups', () => {
    const mathFirst = grade({ subject: 'Математически анализ', semester: 1 });
    const mathSecond = grade({ subject: 'Математически анализ', semester: 2 });
    const physics = grade({ subject: 'Обща физика', semester: 1 });

    const types = classifySessionTypes([mathFirst, mathSecond, physics]);

    // Same subject in a different semester is a new exam, not a retake.
    expect(types.get(mathFirst.id)).toBe('regular');
    expect(types.get(mathSecond.id)).toBe('regular');
    expect(types.get(physics.id)).toBe('regular');
  });

  it('is not confused by fractional seconds in the timestamp', () => {
    // '2024-01-01T10:00:00.500Z' sorts before '...T10:00:00Z' as a string
    // ('.' < 'Z') even though it is the later of the two.
    const first = grade({ createdAt: '2024-01-01T10:00:00Z' });
    const second = grade({ createdAt: '2024-01-01T10:00:00.500Z' });

    const types = classifySessionTypes([second, first]);

    expect(types.get(first.id)).toBe('regular');
    expect(types.get(second.id)).toBe('retake');
  });

  it('falls back to insertion order when two grades share a timestamp', () => {
    const first = grade({ createdAt: '2024-01-01T10:00:00Z' });
    const second = grade({ createdAt: '2024-01-01T10:00:00Z' });

    expect(classifySessionTypes([first, second]).get(first.id)).toBe('regular');
    // The order the API happens to return them in must not flip the result.
    expect(classifySessionTypes([second, first]).get(first.id)).toBe('regular');
  });

  it('returns an empty map for no grades', () => {
    expect(classifySessionTypes([]).size).toBe(0);
  });

  it('without a student-aware keyFn, wrongly mixes different students in the same semester+subject', () => {
    // Regression guard for the bug a naive reuse in a multi-student (teacher)
    // view would introduce: the default keyFn alone cannot tell these apart.
    const first = { ...grade({ createdAt: '2024-01-10T09:00:00Z' }), studentUsername: 'a@uni-sofia.bg' };
    const second = { ...grade({ createdAt: '2024-02-10T09:00:00Z' }), studentUsername: 'b@uni-sofia.bg' };

    const naive = classifySessionTypes([first, second]);
    expect(naive.get(first.id)).toBe('regular');
    expect(naive.get(second.id)).toBe('retake'); // wrong: b's own first grade, not a retake

    const studentAware = classifySessionTypes(
      [first, second],
      (g) => `${g.studentUsername}::${g.semester}::${g.subject}`
    );
    expect(studentAware.get(first.id)).toBe('regular');
    expect(studentAware.get(second.id)).toBe('regular');
  });
});

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
