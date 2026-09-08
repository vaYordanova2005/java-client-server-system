# Architecture (Markly)

A school grading system: Spring Boot REST backend + PostgreSQL + React (TypeScript)
frontend. Three roles — Admin, Teacher, Student — with JWT authentication.

The old TCP socket version lives in [`legacy/`](../legacy/) — reference only, not
touched, not part of the current architecture.

## Overview

```
frontend (React + Vite, TS)  --HTTP/JSON + JWT-->  backend (Spring Boot)  -->  PostgreSQL
```

* The frontend holds close to no business logic — it mostly calls the REST API and
  renders the response. The one real exception is regular-vs-retake session
  classification (`frontend/src/utils/grades.ts: classifySessionTypes`): there is no
  session-type field in the database, so the frontend infers it from grade ordering. See
  [`student.md`](student.md) for what that means for a student.
* The backend is the single source of truth: validation, authorization, data access.
* No separate API gateway / microservices — a monolithic Spring Boot application.

## Backend (`backend/src/main/java/com/markly/backend/`)

| Package | Responsibility |
|---|---|
| `web/` | REST controllers — `AuthController`, `AdminController` (users + student registrar profiles + audit log), `AdminSubjectController` (subject catalog + teacher assignments, `/api/admin/subjects/**`, split out from `AdminController` to keep it navigable), `TeacherController` (grades), `StudentController` (own grades + own profile), `CalendarController` (events, read by every role, written by ADMIN/TEACHER). Thin layer: accept DTOs, call service/repository, return DTOs. |
| `web/dto/` | Request/response DTOs (e.g. `CreateUserRequest`, `GradeResponse`, `LoginResponse`, `StudentProfileResponse`/`UpsertStudentProfileRequest`, `CalendarEventResponse`/`CreateCalendarEventRequest`, `AuditLogResponse`, `SubjectResponse`/`CreateSubjectRequest`/`UpdateSubjectRequest`, `SubjectAssignmentResponse`/`CreateSubjectAssignmentRequest`, `ImportUsersResponse`/`ImportUserRowResult`, `PageResponse`). The backend never serializes entities directly to clients. |
| `domain/` | JPA entities — `User`, `Grade` (including `GradeType` enum: TEST/ORAL_EXAM/CLASS_TEST/REGULAR/RETAKE), `StudentProfile` (registrar info, one-to-one with `User`), `CalendarEvent`, `AuditLog`, `Subject` (catalog entry, soft-deletable), `SubjectAssignment` (teacher × subject × optional group), `Role` (enum: ADMIN/TEACHER/STUDENT), `CalendarEventType` (enum: TEST/HOLIDAY/EVENT). |
| `repository/` | Spring Data JPA repositories — `UserRepository`, `GradeRepository`, `StudentProfileRepository`, `CalendarEventRepository`, `AuditLogRepository`, `SubjectRepository`, `SubjectAssignmentRepository`. |
| `service/` | Business/validation logic outside the controllers — `UserValidationService` (username/email/password rules, see [`decisions.md`](decisions.md)), `StudentProfileNormalizer` (faculty-number normalization), `StudentRosterService` (student roster shared by `AdminController`/`TeacherController`, demo-scoped for a demo teacher), `UserImportService` (CSV parsing/validation for bulk user creation), `AuditLogService` (writes to `audit_log`). |
| `security/` | JWT — `JwtService` (issues/validates tokens, derives the CSRF token), `AuthCookieService` (the httpOnly session cookie), `JwtAuthenticationFilter` (reads the cookie, checks the CSRF header and the token version, blocks writes from a demo account), `LoginRateLimitFilter` + `LoginAttemptService` (brute-force limits and the login audit trail), `ClientIpResolver` (client address from `X-Forwarded-For`, see `TRUSTED_PROXIES`), `AppUserDetailsService` + `AppUserPrincipal` (Spring Security user model). |
| `config/` | `SecurityConfig` (filter chain, roles per endpoint), `DataSeeder` (admin account on startup), `DemoDataSeeder` (demo teachers/students/grades/calendar events/student profiles when `SEED_DEMO_DATA=true`), `RestrictedDemoAccountSeeder` (the two always-on, read-only demo accounts — see [`decisions.md`](decisions.md), "Restricted demo accounts"). |
| `exception/` | `ApiExceptionHandler` (`@ControllerAdvice`) + `ApiError` — a single error format across all endpoints. |

### Authentication / authorization

* Login → `AuthController` → issues a JWT (`JwtService`), signed with `JWT_SECRET`, and
  returns it as an **httpOnly cookie** (`AuthCookieService`) so page scripts can never
  read it. The response body carries only username, role and a CSRF token.
* Every subsequent request carries the cookie automatically; `JwtAuthenticationFilter`
  validates it, requires the `X-CSRF-Token` header on state-changing methods, reloads the
  user (so role and account state are never trusted from the claim), rejects a token
  whose `tv` claim no longer matches the user's `token_version`, and puts an
  `Authentication` in the `SecurityContext`.
* `POST /api/auth/password` rotates the caller's own password (current password
  required) and ends every other session for that account.
* Login is rate limited per client address (`LoginRateLimitFilter`, failed attempts only)
  and per account —
  five consecutive failures lock the account for 15 minutes (`LoginAttemptService`).
  Every login outcome is written to the `com.markly.audit` logger.
* Role-based access is enforced in `SecurityConfig` (endpoint → role) and additionally in
  the controllers where needed (e.g. a teacher can only see/write their own grades).
* Account-management and subject-catalog actions taken by an admin (status change,
  unlock, password reset, delete, CSV import, subject/assignment create-update-delete)
  are written to `audit_log` (`AuditLogService`), readable via
  `GET /api/admin/audit-log` (filterable by event type, actor, target, or either).

### Database

See [`database.md`](database.md) for schema and migrations. Managed with Flyway
(`backend/src/main/resources/db/migration/`) — versions apply automatically on startup,
never manual ALTERs in production.

## Frontend (`frontend/src/`)

| Folder | Responsibility |
|---|---|
| `api/` | `client.ts` — axios wrapper, attaches the JWT to requests, normalizes error messages. `resourceCache.ts` — a small session-scoped cache for GETs shared across pages (e.g. the student's grades, read by Начало/Дневник/Статистики): entries go stale after a TTL and revalidate in the background, on the next mount and on window focus, without dropping what's already showing — including across a failed revalidation. Cleared on login/logout. |
| `auth/` | Login state, token storage, context for the current user/role (`AuthContext.tsx` for the provider, `useAuth.ts` for the hook — split so editing the provider doesn't disable Fast Refresh). |
| `routes/` | React Router config, `ProtectedRoute` (per-role guard), `Layout` (shared chrome — top nav, adapts which items show by role). |
| `pages/` | Pages per role (admin panel, teacher grade entry, student dashboard/journal/statistics/profile/calendar). |
| `components/` | Reusable UI components. |
| `hooks/` | Custom React hooks — mostly thin wrappers over `useApiResource` (the shared `useSyncExternalStore`-based data-fetching hook) bound to a specific endpoint and, where relevant, one of the caches in `api/resourceCache.ts`. |
| `utils/` | Pure helper functions with no React/HTTP dependency (e.g. `grades.ts` — averaging, regular/retake classification; `calendar.ts` — month-grid building). Where the actual business logic lives, and the only part of the frontend with unit tests (`grades.test.ts`). |
| `types/` | Shared TypeScript types (mirroring the backend DTOs). |

## Roles and access

* **Admin** (`admin`, fixed username) — creates teacher/student accounts (individually or
  via CSV import) and manages students' registrar profiles (faculty number, group,
  enrolled/completed semester, etc. — `AdminController`, `StudentProfile`); can also
  deactivate/reactivate/unlock/reset-password/delete an account, and manage the subject
  catalog and teacher assignments (`AdminSubjectController`). Also has calendar write
  access, and read access to every grade and the audit log system-wide. Full behavior:
  [`admin.md`](admin.md).
* **Teacher** (email, must end in `@uni-sofia.bg`) — enters grades for students by email;
  can also create/delete calendar events (tests, holidays, other events). Full behavior:
  [`teacher.md`](teacher.md).
* **Student** (any email) — sees only their own grades (`GET /api/student/grades`, never
  another student's) across a dashboard, journal and statistics view; sees their own
  registrar profile read-only; sees the shared calendar read-only. Full behavior:
  [`student.md`](student.md).

Full username/password rules: [`decisions.md`](decisions.md).

## Environments / configuration

Everything configurable goes through env vars (see [README.md](../README.md) in the
repo root) — no hardcoded credentials or connection strings in the code.
