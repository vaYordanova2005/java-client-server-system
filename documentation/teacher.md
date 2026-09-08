# Teacher — What the system does

This describes the **Teacher** role as it actually exists in the codebase today (not a
backlog or aspiration). A teacher account is created by an admin (`POST /api/admin/users`),
with a username that must end in `@uni-sofia.bg`; a teacher cannot self-register. See
[student.md](student.md) for the equivalent student-side description — the two roles
share the login flow, the data-freshness cache, and the calendar.

## Login

Same as the student flow: `POST /api/auth/login`, an httpOnly JWT cookie, five wrong
passwords locking the account for 15 minutes, no self-service password reset. A teacher can
change their own password from the profile page (`POST /api/auth/password`).

## Navigation

A teacher sees the same four top-nav sections a student does (`routes/Layout.tsx`):
**Начало** (dashboard), **Дневник** (journal), **Статистики** (statistics), **Календар**
(calendar), plus a profile link. Unlike a student's journal/statistics — which are always
about their own grades — a teacher's journal/statistics are about the grades *that teacher
has entered*, across however many students and subjects that turns out to be. An admin still
sees "в процес на разработка" on those two routes; only STUDENT and TEACHER render real data.

## Data freshness

Grades a teacher has entered are read through a shared client-side cache
(`useTeacherGrades`, mirroring `useStudentGrades`/`api/resourceCache.ts`), stale after 30
seconds and silently revalidated in the background rather than refetched on every
navigation. Entering, editing, or deleting a grade calls `reload()` explicitly afterward
(bypassing the cache's TTL) so the change is reflected immediately rather than waiting for
the next background revalidation.

## Finding a student (`GET /api/teacher/students/lookup`)

A teacher identifies a student by **faculty number** (with email as a fallback), not by
memorizing emails — a class roster has faculty numbers on it, not emails. Typing either into
the lookup field on `/teacher` resolves to a confirmation card (email, faculty number,
faculty, specialty, group, enrolled semester) before any grade form is shown, so a mistyped
number surfaces before a grade is recorded against the wrong person, not after.

This is a lookup convenience only — see "Faculty number is a lookup convenience, not an
identifier" in [decisions.md](decisions.md). The grade itself is still recorded against
the resolved student's **email**
(`POST /api/teacher/grades`, `CreateGradeRequest.studentUsername`); faculty number never
becomes part of the `Grade` row or any auth path. The lookup response is deliberately
narrower than the full registrar record (no admission type, status, degree level, study
mode, specialization, or stream) — just enough to confirm identity.

## Dashboard (`/teacher`, `TeacherDashboard.tsx`)

Landing page after login:

* Four stat tiles, over every grade this teacher has ever entered: overall average, total
  grade count, distinct student count, distinct subject count.
* The faculty-number-or-email lookup and grade-entry form described above. After a
  successful lookup, subject/semester (1–8)/grade (2–6) fields appear; submitting clears the
  subject field only (semester and grade persist, a convenience for entering several grades
  for the same student in a row — the same behavior the form has always had) and the recent
  list below updates immediately.
* **Последно въведени оценки** — the 10 most recently entered grades (the backend already
  orders by `createdAt desc`, so this is just the first 10), each with **Редактирай** /
  **Изтрий** actions.

## Journal (`/journal`, `JournalPage.tsx`, `TeacherJournal`)

Every grade this teacher has entered, filterable by student email, subject, and semester
(plain client-side filtering over the already-loaded list — there's no server-side
pagination, since one teacher's own grades are a small dataset). Grouped by **student** →
semester → subject, the reverse of the student's own journal (which only ever has one
student and groups by semester → subject directly). Each grade shows whether it was the
regular session or a retake for that student — inferred the same way the student journal
does (`utils/grades.ts: classifySessionTypes`), except the grouping key here also includes
the student (`studentUsername::semester::subject`), not just `semester::subject`: without
that, two different students' first grade in the same semester and subject would land in the
same bucket and one would be mislabeled a retake of the other's grade.

Every row has **Редактирай** (inline subject/semester/grade form,
`PUT /api/teacher/grades/{id}`) and **Изтрий** (`DELETE /api/teacher/grades/{id}`), both
scoped to grades this teacher entered — attempting either on another teacher's grade answers
404, not 403 or a filtered-out row, so the id's existence under someone else's account is
never confirmed one way or the other.

## Statistics (`/statistics`, `StatisticsPage.tsx`, `TeacherStatistics`)

The class-wide equivalent of a student's own statistics page, over the same
teacher-entered-grades data: overall average, total grade count, distinct student count,
grade-value distribution, per-subject average (aggregated across every student who has a
grade in that subject), a per-semester average trend (shown once grades span more than one
semester), and a regular-vs-retake average split (shown once at least one retake exists) —
using the same student-aware classification described under Journal above.

## Calendar (`/calendar`, `CalendarPage.tsx`)

Same page every role sees (see the Calendar section of [student.md](student.md)), except
a teacher can also create and delete events (`ADMIN`/`TEACHER` only, enforced again
server-side in `SecurityConfig`).

## Data model touching the teacher role

* **`User`** — same as any role: `username` (email, `@uni-sofia.bg`), `password` (hashed),
  `role`. No separate "name" field; a teacher is identified by username/email only. There is
  no `TeacherProfile` equivalent to `StudentProfile` — a teacher account carries no
  registrar-style data of its own.
* **`Grade`** — student, teacher, subject (free text, no catalog), semester (1–8), grade
  (2–6), `createdAt`. A teacher can create, read (their own), update, and delete (their own)
  grades; a student can only read their own.
* **`StudentProfile.facultyNumber`** — now unique (see decisions.md), used only as a lookup
  key into the owning student's `User`/email; never copied onto `Grade`.
