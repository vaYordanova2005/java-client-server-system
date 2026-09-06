export type Role = 'ADMIN' | 'TEACHER' | 'STUDENT';

export interface AuthUser {
  username: string;
  role: Role;
}

export interface UserSummary {
  id: number;
  username: string;
  role: Role;
  enabled: boolean;
  locked: boolean;
}

export type GradeType = 'TEST' | 'ORAL_EXAM' | 'CLASS_TEST' | 'REGULAR' | 'RETAKE';

export interface GradeSummary {
  id: number;
  subject: string;
  semester: number;
  grade: number;
  gradeType: GradeType;
  createdAt: string;
  teacherUsername: string | null;
}

/**
 * Separate from {@link GradeSummary} on purpose — it mirrors the backend's
 * `TeacherGradeResponse`, not `GradeResponse`. `GET /student/grades` never
 * returns a `studentUsername` field (a student only ever sees their own
 * grades), so adding it to `GradeSummary` would claim a field that never
 * actually arrives there.
 */
export interface TeacherGradeSummary {
  id: number;
  subject: string;
  semester: number;
  grade: number;
  gradeType: GradeType;
  createdAt: string;
  studentUsername: string;
  facultyNumber: string | null;
  specialty: string | null;
  groupNumber: string | null;
}

export type CalendarEventType = 'TEST' | 'HOLIDAY' | 'EVENT';

export interface CalendarEventSummary {
  id: number;
  type: CalendarEventType;
  title: string;
  description: string | null;
  subject: string | null;
  startDate: string;
  endDate: string | null;
  createdByUsername: string;
  createdByRole: Role;
  createdAt: string;
}

/**
 * Deliberately narrower than {@link StudentProfileSummary} — mirrors the
 * backend's `StudentLookupResponse`. A teacher resolving a faculty number to
 * confirm they've picked the right student only needs enough to recognize
 * the person, not the whole registrar record (no admissionType/status/
 * degreeLevel/etc.).
 */
export interface StudentLookupSummary {
  username: string;
  facultyNumber: string | null;
  faculty: string | null;
  specialty: string | null;
  groupNumber: string | null;
  enrolledSemester: number | null;
}

export interface StudentProfileSummary {
  studentUsername: string;
  degreeLevel: string | null;
  facultyNumber: string | null;
  faculty: string | null;
  specialty: string | null;
  studyMode: string | null;
  specialization: string | null;
  groupNumber: string | null;
  admissionType: string | null;
  status: string | null;
  enrolledSemester: number | null;
  completedSemester: number | null;
  stream: string | null;
}
