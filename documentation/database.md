# Database schema (Markly)

PostgreSQL. Schema is owned by Flyway migrations in
[`backend/src/main/resources/db/migration/`](../backend/src/main/resources/db/migration/)
— never edit the schema by hand, add a new migration instead. JPA entities live in
[`backend/src/main/java/com/markly/backend/domain/`](../backend/src/main/java/com/markly/backend/domain/).

## Tables

### `users`

| Column | Type | Constraints |
|---|---|---|
| `id` | `BIGSERIAL` | PK |
| `username` | `VARCHAR(255)` | `NOT NULL`, `UNIQUE` — an email address for all roles, see [`decisions.md`](decisions.md) |
| `password` | `VARCHAR(255)` | `NOT NULL` — hashed, never plaintext |
| `role` | `VARCHAR(20)` | `NOT NULL`, `CHECK (role IN ('ADMIN', 'TEACHER', 'STUDENT'))` |
| `enabled` | `BOOLEAN` | `NOT NULL`, default `TRUE` — an admin can deactivate an account instead of deleting it |
| `locked_until` | `TIMESTAMP` | Set by the brute-force lockout, cleared when it expires or an admin unlocks |
| `failed_login_attempts` | `INTEGER` | `NOT NULL`, default `0` — consecutive failures, reset on a successful login |
| `token_version` | `INTEGER` | `NOT NULL`, default `0` — carried in every JWT; bumping it invalidates all outstanding tokens for that user |
| `is_demo` | `BOOLEAN` | `NOT NULL`, default `FALSE` — flags the two fixed accounts from `RestrictedDemoAccountSeeder`; read is normal, every write is rejected (`JwtAuthenticationFilter`), see [`decisions.md`](decisions.md) |

### `grades`

| Column | Type | Constraints |
|---|---|---|
| `id` | `BIGSERIAL` | PK |
| `student_id` | `BIGINT` | `NOT NULL`, FK → `users(id)`, indexed (`idx_grades_student_id`) |
| `teacher_id` | `BIGINT` | FK → `users(id)`, indexed (`idx_grades_teacher_id`). Nullable at the DB level (see below), but the application always sets it — `Grade#teacher` is mapped `optional = false` |
| `subject` | `VARCHAR(255)` | `NOT NULL` |
| `semester` | `INTEGER` | `NOT NULL` |
| `grade` | `INTEGER` | `NOT NULL` |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | `NOT NULL` (no default — set by the app on insert via `@PrePersist`) |
| `grade_type` | `VARCHAR(20)` | `NOT NULL`, `CHECK (grade_type IN ('TEST', 'ORAL_EXAM', 'CLASS_TEST', 'REGULAR', 'RETAKE'))` — `GradeType` enum. Pre-existing rows were backfilled to `REGULAR`/`RETAKE` by V9, reproducing the same first-in-semester-and-subject-wins rule the frontend used to infer client-side (see V9 below) |

### `calendar_events`

Shared across all roles: read by everyone, written by ADMIN/TEACHER only
(`CalendarController`, enforced in `SecurityConfig`).

| Column | Type | Constraints |
|---|---|---|
| `id` | `BIGSERIAL` | PK |
| `type` | `VARCHAR(20)` | `NOT NULL`, `CHECK (type IN ('TEST', 'HOLIDAY', 'EVENT'))` |
| `title` | `VARCHAR(255)` | `NOT NULL` |
| `description` | `TEXT` | nullable |
| `subject` | `VARCHAR(255)` | nullable — only meaningful when `type = 'TEST'`; a holiday or a generic event has no subject |
| `start_date` | `DATE` | `NOT NULL` |
| `end_date` | `DATE` | nullable — unset for a single-day entry, set for a range (e.g. a week-long holiday) |
| `created_by` | `BIGINT` | `NOT NULL`, FK → `users(id)` |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | `NOT NULL` (no default — set by the app on insert via `@PrePersist`, same pattern as `grades.created_at`) |

Indexed on `start_date` (`idx_calendar_events_start_date`) — the calendar and the
"Предстоящи" (upcoming) list both sort/filter by it. Not indexed on `created_by`; nothing
queries by creator today.

### `student_profiles`

Optional registrar-style data about a student — one-to-one with `users`, only meaningful
for STUDENT-role rows, admin-managed (`AdminController`), read-only for the student
(`StudentController`). A student with no row here just gets an all-`null` profile
response rather than a 404.

| Column | Type | Constraints |
|---|---|---|
| `id` | `BIGSERIAL` | PK |
| `student_id` | `BIGINT` | `NOT NULL`, `UNIQUE`, FK → `users(id)` — the "one-to-one" |
| `degree_level` | `VARCHAR(100)` | nullable |
| `faculty_number` | `VARCHAR(50)` | nullable |
| `faculty` | `VARCHAR(255)` | nullable |
| `specialty` | `VARCHAR(255)` | nullable |
| `study_mode` | `VARCHAR(100)` | nullable |
| `specialization` | `VARCHAR(255)` | nullable |
| `group_number` | `VARCHAR(50)` | nullable |
| `admission_type` | `VARCHAR(100)` | nullable |
| `status` | `VARCHAR(100)` | nullable |
| `enrolled_semester` | `INTEGER` | nullable, no DB-level range check |
| `completed_semester` | `INTEGER` | nullable, no DB-level range check |
| `stream` | `VARCHAR(50)` | nullable |

`StudentProfile` declares an explicit `@Column(length = ...)` matching every `VARCHAR`
width above; left at the JPA default of 255 it would silently disagree with the narrower
columns, a mismatch `ddl-auto: validate` doesn't catch (it only checks that columns
exist, not their length). The semester range (1–8 / 0–8) and every text field's max
length are enforced only at the application layer, in `UpsertStudentProfileRequest`
(`@Min`/`@Max`/`@Size`) — not with a DB `CHECK` constraint — so a value that reaches the
column at all is already known-valid; only a direct database write could put something
out of range there.

`personal_email` existed briefly (`V5`) and was dropped in `V6`: the student's `username`
already is their email, so a second one on the profile was redundant.

### `audit_log`

Append-only trail of admin/account-security actions (`AuditLogService`, written by
`AdminController`/`AdminSubjectController`), read via `GET /api/admin/audit-log`
(`AuditLogRepository.search`, filterable by event type, actor, target, or either via
`involving`).

| Column | Type | Constraints |
|---|---|---|
| `id` | `BIGSERIAL` | PK |
| `event_type` | `VARCHAR(40)` | `NOT NULL` — e.g. `ACCOUNT_STATUS_CHANGED`, `ACCOUNT_UNLOCKED`, `PASSWORD_RESET`, `USER_DELETED`, `USERS_IMPORTED`, `SUBJECT_CREATED`/`SUBJECT_UPDATED`/`SUBJECT_DELETED`/`SUBJECT_HARD_DELETED`, `SUBJECT_ASSIGNMENT_CREATED`/`SUBJECT_ASSIGNMENT_DELETED` |
| `actor_username` | `VARCHAR(255)` | nullable — who performed the action |
| `target_username` | `VARCHAR(255)` | nullable — who/what it was done to |
| `ip` | `VARCHAR(64)` | nullable — resolved via `ClientIpResolver`, same logic as the login rate limiter |
| `detail` | `TEXT` | nullable — free-text context, e.g. `enabled=false` or `created=3 skipped=1`; never a password or file contents |
| `created_at` | `TIMESTAMP` | `NOT NULL` |

No foreign key to `users` on either username column — they are plain-text snapshots at
the time of the event, deliberately, so a hard-deleted user's own audit trail survives
the delete instead of being cascade-deleted or orphaned. Indexed on `created_at DESC`
(`idx_audit_log_created_at`, newest-first listing) and `event_type`
(`idx_audit_log_event_type`).

### `subjects`

Additive catalog of subject names — `Grade.subject` stays free text and is not a foreign
key into this table (converting it would mean reconciling every existing free-text value
against the catalog first). Managed via `AdminSubjectController`.

| Column | Type | Constraints |
|---|---|---|
| `id` | `BIGSERIAL` | PK |
| `name` | `VARCHAR(255)` | `NOT NULL` |
| `faculty` | `VARCHAR(255)` | nullable |
| `specialty` | `VARCHAR(255)` | nullable |
| `active` | `BOOLEAN` | `NOT NULL`, default `TRUE` — soft-delete flag |
| `created_at` | `TIMESTAMP` | `NOT NULL` |

`UNIQUE(name, active)`, not a plain `UNIQUE(name)`: a soft-deleted (`active=false`)
subject must not block creating a new active subject of the same name, but must still
collide with itself so an admin is pointed at reactivating it instead of creating a
duplicate. At most one active and one inactive row can exist per name.

### `subject_teacher_assignments`

Which teacher(s) teach a subject, optionally scoped to a group.

| Column | Type | Constraints |
|---|---|---|
| `id` | `BIGSERIAL` | PK |
| `subject_id` | `BIGINT` | `NOT NULL`, FK → `subjects(id)` |
| `teacher_id` | `BIGINT` | `NOT NULL`, FK → `users(id)` |
| `group_number` | `VARCHAR(50)` | `NOT NULL`, default `''` — `''` means "the whole subject, not one group"; never `NULL`, since Postgres treats distinct `NULL`s as never equal and a `NULL`-based unique constraint would silently admit duplicate "no group" assignments |

`UNIQUE(subject_id, teacher_id, group_number)`.

## Relationships

```
users (1) ──< grades.student_id            one student has many grades
users (1) ──< grades.teacher_id            one teacher has entered many grades
users (1) ──< calendar_events.created_by   one user (admin/teacher) has created many events
users (1) ── student_profiles.student_id   one user has at most one registrar profile
```

`student_id` and `teacher_id` on `grades` (and `created_by` on `calendar_events`)
reference the same `users` table; the role column is what distinguishes a "student" row
from a "teacher"/"admin" row — there is no separate students or teachers table.

## Why `teacher_id` is nullable at the DB level

`teacher_id` was added after `grades` already existed in production (`V2`). Rows created
before that migration have no real record of who entered them, so a `NOT NULL` constraint
on `teacher_id` would either:

* fail the migration outright on any database that had grades but zero teacher accounts
  (the backfill subquery returns `NULL` for every row), or
* require inventing a fake attribution for old data.

`V2` backfills `teacher_id` best-effort (first teacher account, if one exists) but does
**not** enforce `NOT NULL` on the column. `V3` exists to converge two divergent schema
states: an early edit of `V2` briefly shipped with `SET NOT NULL`, so databases that
applied that version still carry the constraint while fresh databases don't — `V3` drops
it unconditionally (a no-op where it's already absent) so every environment ends up with
the same schema.

The application-level guarantee (every *new* grade always has a teacher) lives in
`Grade#teacher` (`optional = false`) and `TeacherController`, not in the database
constraint. Any code that reads `teacher_id` back must null-check rather than assume,
since legacy/unattributable rows can still be `NULL`.

## Migration history

| Version | File | Change |
|---|---|---|
| V1 | `V1__init.sql` | Creates `users` and `grades`, index on `grades.student_id`. |
| V2 | `V2__add_grade_audit_columns.sql` | Adds `teacher_id` (nullable, best-effort backfilled) and `created_at` (`NOT NULL`, default dropped after backfill) to `grades`; index on `teacher_id`. |
| V3 | `V3__relax_grade_teacher_not_null.sql` | Drops `NOT NULL` on `grades.teacher_id` to converge databases that picked up an early, since-reverted version of V2. |
| V4 | `V4__add_calendar_events.sql` | Creates `calendar_events`, index on `start_date`. |
| V5 | `V5__add_student_profiles.sql` | Creates `student_profiles` (one-to-one with `users`), including a `personal_email` column. |
| V6 | `V6__drop_student_profile_personal_email.sql` | Drops `student_profiles.personal_email` — redundant with `users.username`. |
| V7 | `V7__add_account_security_columns.sql` | Adds `enabled`, `locked_until`, `failed_login_attempts`, `token_version` to `users` — account deactivation, brute-force lockout, and token revocation. |
| V8 | `V8__add_student_profile_faculty_number_unique_index.sql` | Adds a plain unique index on `student_profiles.faculty_number` (see [`decisions.md`](decisions.md), "Faculty number is a lookup convenience"), after normalizing every existing row. |
| V9 | `V9__add_grade_type.sql` | Adds `grades.grade_type` (`NOT NULL`, `CHECK` against the `GradeType` enum), backfilling existing rows to `REGULAR`/`RETAKE` by reproducing the frontend's old first-in-semester-and-subject-wins ordering rule in SQL. |
| V10 | `V10__add_audit_log.sql` | Creates `audit_log`, indexes on `created_at DESC` and `event_type`. |
| V11 | `V11__add_subjects.sql` | Creates `subjects` (`UNIQUE(name, active)`) and `subject_teacher_assignments` (`UNIQUE(subject_id, teacher_id, group_number)`). |
| V12 | `V12__add_users_demo_column.sql` | Adds `users.is_demo` (`NOT NULL`, default `FALSE`) for `RestrictedDemoAccountSeeder`. |

## Seeding

* `DataSeeder` — creates the admin account on first startup.
* `DemoDataSeeder` — with `SEED_DEMO_DATA=true`, creates 8 teachers, 20 students (each
  with a `student_profiles` row and grades across every semester up to and including the
  one they're currently enrolled in — ~400 `grades` rows total for the fixed seed), and a
  handful of `calendar_events`. Local/test use only, see
  [`decisions.md`](decisions.md).
* `RestrictedDemoAccountSeeder` — every startup, in every environment, seeds exactly two
  `is_demo=true` accounts (`teacher@uni-sofia.bg`, `student@uni-sofia.bg`) and resets them
  to `enabled=true`/unlocked on every restart. See [`decisions.md`](decisions.md),
  "Restricted demo accounts".
