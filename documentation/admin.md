# Admin — What the system does

This describes the **Admin** role as it actually exists in the codebase today (not a
backlog or aspiration). There is exactly one admin account by default (username `admin`,
see [`decisions.md`](decisions.md), "Admin credentials"); admins cannot create other
admin accounts through the panel (`UserValidationService.validate` rejects `ADMIN` at
`POST /api/admin/users`) — a second admin can only be added by seeding one outside the
app.

## Login

Same as every role: `POST /api/auth/login`, an httpOnly JWT cookie, five wrong passwords
locking the account for 15 minutes. An admin can change their own password from the
profile page (`POST /api/auth/password`, current password required, ends every other
session for that account) — the only way to rotate `SEED_ADMIN_PASSWORD` from inside the
app.

## Navigation

An admin sees **Home** (dashboard, `/admin`, `AdminDashboard.tsx`), **Journal** and
**Statistics** (system-wide, read-only, across every teacher and student — the same
pages a student/teacher gets, rendering real data for the ADMIN role too), **Subjects**
(`/admin/subjects`, `SubjectsPage.tsx` — the only nav item shown exclusively to ADMIN),
and **Calendar**, plus a profile link. The UI defaults to English and has an EN/BG
toggle in the topbar (`i18n/LanguageContext.tsx`) — labels here are the English
defaults. Unlike a teacher's "Students" tab, an admin has no dedicated per-student
roster page; the closest equivalent is the profile lookup form described below.

## User management (`/admin`, `AdminDashboard.tsx`)

Everything here is backed by `AdminController` (`/api/admin/users/**`) and, except for
the plain list, written to `audit_log`:

* **Create** (`POST /api/admin/users`) — role (STUDENT or TEACHER only), username/email,
  password. The password must satisfy the full policy in
  [`decisions.md`](decisions.md) ("Brute-force protection and password rules") — at
  least 10 characters with an upper-case letter, a lower-case letter, and a digit; there
  is no fixed default to fall back on.
* **Bulk import from CSV** (`POST /api/admin/users/import`, `UserImportService`) —
  columns `role,username,password`; each row is validated and saved independently, so
  one bad row doesn't sink the rest of the file. The response lists a per-row result
  (created/skipped + message); the audit log only records the aggregate counts, never row
  contents or the filename, since the uploaded file may contain plaintext passwords.
* **List** (`GET /api/admin/users`, paginated, newest-first) — id, username, role, and
  status (Active / Temporarily locked / Disabled).
* **Deactivate / reactivate** (`PUT /api/admin/users/{id}/status`) — the reversible
  alternative to deleting an account with history; reactivating also clears any lockout.
  An admin cannot deactivate their own account.
* **Unlock** (`POST /api/admin/users/{id}/unlock`) — lifts a brute-force lockout before
  its 15 minutes are up, without waiting or touching `enabled`.
* **Reset password** (`POST /api/admin/users/{id}/reset-password`) — sets a new password
  directly (same policy as create), clears any lockout, and ends the account's other
  sessions. There is no email/token reset flow in this app, so this — an admin acting on
  the user's behalf — is the only recovery path for a user who is locked out of their own
  account.
* **Delete** (`DELETE /api/admin/users/{id}`) — hard delete, blocked with 409 if the
  account has any grade, calendar-event, or subject-assignment history (deactivate is the
  option for that case instead). Deleting a student also deletes their registrar profile
  in the same transaction, freeing their faculty number for reuse — the confirm dialog
  says so explicitly. An admin cannot delete their own account. Deactivating or
  hard-deleting either restricted demo account doesn't stick/isn't possible respectively
  — see [`decisions.md`](decisions.md), "Restricted demo accounts".

There is still no endpoint to edit a user's username or role after creation — the
account must be deleted (if it has no history yet) and recreated instead.

## Student registrar profiles (`/admin`, same page)

`GET`/`PUT /api/admin/students/profile?username=...` — look up a student by email and
edit their registrar-style data (degree level, faculty number, faculty, specialty, study
mode, specialization, group, admission type, status, enrolled/completed semester,
stream). Enrolled/completed semester are validated to 1–8/0–8; every text field to the
column's max length; a faculty number colliding with another student's is rejected with
a friendly 400, whether caught by the pre-check or by the underlying unique index
racing a concurrent request. See [`database.md`](database.md) (`student_profiles`) and
[`student.md`](student.md) (how it looks from the student's, read-only, side).

## Subjects and teacher assignments (`/admin/subjects`, `SubjectsPage.tsx`)

Backed by `AdminSubjectController` (`/api/admin/subjects/**`), a catalog kept separate
from the free-text `Grade.subject` field (see [`database.md`](database.md), `subjects`)
— it exists to answer "who teaches what," not to constrain what a teacher can type as a
subject name when entering a grade.

* **Catalog** — create (`POST`), full-replace edit including `active`
  (`PUT /api/admin/subjects/{id}`), soft-delete/reactivate (`DELETE` sets `active=false`;
  the same `PUT` with `active=true` reactivates), and hard-delete
  (`DELETE /api/admin/subjects/{id}/permanent`, blocked with 409 while any assignment
  still references the subject). A name collision with an active subject is a plain 400;
  a collision with an inactive one is a 409 pointing at reactivating that row instead of
  creating a duplicate.
* **Assignments** — per subject, add (`POST .../assignments`, teacher email + optional
  group number; blank group means "the whole subject") or remove
  (`DELETE /api/admin/subjects/assignments/{id}`) a teacher assignment. Duplicate
  teacher+subject+group combinations are rejected.
* Every create/update/delete here (subject or assignment) is written to `audit_log`.

## Audit log (`/admin`, same page)

`GET /api/admin/audit-log` (paginated, newest-first, filterable by `eventType`,
`actorUsername`, `targetUsername`, or `involving` — matches either username column, for
"anything about this person"). Covers every account-management and subject-catalog
action above (see [`database.md`](database.md), `audit_log`, for the full event-type
list) — never a password value, CSV row contents, or an uploaded filename, only who did
what to whom, when, and from which resolved client IP.

## System-wide read access

An admin's **Journal**/**Statistics** aggregate over *every* teacher's and student's
grades (`GET /api/admin/grades`, paginated), unlike a teacher's own-grades-only view or a
student's own-grades-only view — the frontend pages through this endpoint itself and
concatenates, rather than the backend pre-aggregating it. `GET /api/admin/students`
returns the full student roster (shared with `TeacherController` via
`StudentRosterService`).

## Data model touching the admin role

* **`User`** — same as any role: `username`, `password` (hashed), `role`. No `ADMIN` row
  can be created through the panel; only `DataSeeder` creates one, at first startup.
* **`StudentProfile`**, **`Subject`**, **`SubjectAssignment`**, **`AuditLog`** — see
  [`database.md`](database.md) for full column lists and constraints.
