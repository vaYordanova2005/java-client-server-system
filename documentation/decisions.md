# Project decisions (Markly)

This file locks in decisions made for the project so they aren't accidentally revisited or
reversed. If something here needs to change, change it deliberately and update this file
immediately.

## Java version

**Java 21.** Not 25. `backend/pom.xml` → `<java.version>21</java.version>`.

## Username scheme

Both roles (teacher, student) use **email** as the username. No faculty numbers, no
national ID (EGN) — nowhere in the active code (`backend/`, `frontend/`). EGN only exists
in `legacy/` (the old TCP socket version, unmaintained, do not touch).

* **Admin** — `admin` (fixed username)
* **Teacher** — must end in `@uni-sofia.bg`, local part letters optionally followed by
  digits (validated with a regex in `UserValidationService`)
* **Student** — any valid email, no domain restriction

Password for both roles: **at least 5 characters**, no format restrictions (not EGN, not
digits-only).

## Faculty number is a lookup convenience, not an identifier

The "Username scheme" rule above still holds — a grade's `student`/`teacher` foreign keys,
login, and every account-identity check are by email, never by faculty number. What changed
is that a teacher can now *resolve* a faculty number to a student before grading them
(`GET /api/teacher/students/lookup`, `TeacherController`), because a class roster usually
has faculty numbers on it, not emails. The resolved account is still looked up and stored by
email; faculty number never enters `Grade` or any auth path.

This required two things that didn't exist before:

* **`student_profiles.faculty_number` is now unique** — a *plain* unique index on the raw
  column (`V8__add_student_profile_faculty_number_unique_index.sql`), not a partial or
  expression index: tests run Flyway against H2 in `MODE=PostgreSQL`
  (`backend/src/test/resources/application.yml`), and H2 doesn't support partial/expression
  indexes even there, so every migration in this project sticks to plain `CREATE
  INDEX`/`UNIQUE`. Case-insensitivity and "blank means unset" both come from **write-time
  normalization** instead (`StudentProfileNormalizer`: blank/null → `null`, otherwise
  `trim().toUpperCase()`), applied by every writer (`AdminController`, `DemoDataSeeder`, and
  the lookup input in `TeacherController`) and, once, to every pre-existing row as part of
  V8 itself. The index alone is not case-insensitive — don't describe it as a "partial" or
  "case-insensitive" index anywhere; the guarantee only holds because of both pieces
  together.
* **The lookup endpoint is a new, deliberate disclosure of student registrar data** — any
  authenticated teacher can resolve a faculty number to a student's faculty, specialty,
  group, and enrolled semester, not just an admin or the student themselves. This is
  intentionally narrower than the full `StudentProfile` (no `admissionType`, `status`,
  `degreeLevel`, `studyMode`, `specialization`, `stream`): enough to confirm identity before
  grading, not the whole record.

A teacher can also edit or delete a grade they entered themselves
(`PUT`/`DELETE /api/teacher/grades/{id}`), scoped by ownership
(`GradeRepository.findByIdAndTeacher`) — a correction that's always available in
Школо-style systems and was simply missing before. A mismatched id/teacher pair answers 404,
not 403, so the response never confirms that an id exists under another teacher's account.
This does not extend to reassigning a grade to a different student — `UpdateGradeRequest`
has no `studentUsername` field; that's a delete-and-recreate, not an edit.

## Grading scale

Grades are **2–6** (Bulgarian school scale), enforced with `@Min`/`@Max` wherever a grade
is written (`CreateGradeRequest`). **2 is the failing grade** (`FAIL_GRADE` in both
`DemoDataSeeder` and `frontend/src/utils/grades.ts`), not 1 — there is no 1 anywhere in
the system. 6 is the top grade (`TOP_GRADE` on the frontend). Not a 1–5 or A–F scale;
don't assume otherwise when adding grade-related logic.

## Semester range

Semesters are **1–8** (a 4-year bachelor's program, 2 semesters/year) — enforced with
`@Min(1)`/`@Max(8)` on `CreateGradeRequest.semester` and
`UpsertStudentProfileRequest.enrolledSemester`, and `@Min(0)`/`@Max(8)` on
`completedSemester` (0 meaning "not yet completed any"). The frontend's `SEMESTERS`
constant (`JournalPage.tsx`, `StatisticsPage.tsx`) mirrors this. Not configurable per
program — there's no concept of a shorter/longer degree in the data model.

## Auth model

Stateless JWT, delivered in an **httpOnly cookie** (`markly_token`) rather than to
JavaScript — an XSS hole in the SPA can then use the session while the page is open, but
cannot read the token out and keep it. A token is issued once at login (`JwtService`,
`JWT_EXPIRATION_MINUTES`, default 480 = 8h) and must be re-obtained by logging in again
after it expires; there is no `/api/auth/refresh` or similar. `GET /api/auth/me` is how
the SPA recovers who it is after a reload, since it cannot read the cookie itself.

Because the browser now attaches the cookie to cross-site requests too, CSRF protection
is required. Spring's own CSRF filter is session-based and this app is stateless, so the
check lives in `JwtAuthenticationFilter`: every non-GET request must carry an
`X-CSRF-Token` header equal to `HMAC(jwt-secret, "csrf:" + jti)`, a value the SPA gets
with the session and a foreign site cannot compute. On Render the SPA and the API are
separate hosts, so the cookie needs `SameSite=None; Secure` (`AUTH_COOKIE_SAME_SITE`,
`AUTH_COOKIE_SECURE`); locally over plain http it stays `Lax`. CORS allows exactly one
origin (`FRONTEND_ORIGIN`/`cors.allowed-origin`), not a wildcard, with credentials
enabled.

A JWT cannot be withdrawn, so revocation is expressed as `users.token_version`: it is
copied into every token and re-checked on every request, and bumping it (logout,
deactivation) retires every outstanding token for that account at once.

## Brute-force protection and password rules

`LoginRateLimitFilter` caps **failed** login attempts per client address (15 per 5
minutes → 429). A slot is taken before the attempt runs and given back only if it
succeeds, so concurrent requests cannot overshoot the quota and a successful login costs
nothing — a lab behind one NAT address cannot lock itself out by signing in normally.
The address is read from `X-Forwarded-For` from the right
(`ClientIpResolver`) — proxies append rather than replace, so the left end is
caller-controlled and using it would let an attacker mint a fresh bucket per request.
Which entries to skip is decided by *who wrote them*: `TRUSTED_PROXIES`
(`app.security.trusted-proxies`) lists the proxies' networks as CIDRs — empty for Render
alone, which appends exactly one entry — and the first entry from the right outside those
networks is the client.

A hop count was the obvious alternative and is subtly broken once a CDN is added: an
attacker who bypasses the CDN and hits the origin directly with one forged entry produces
a header of exactly the expected length, so a count-based resolver trusts the forged
value. Matching networks, that same request buckets on the attacker's real address. An
origin lock is still worth having as defence in depth; the rate limiter no longer depends
on it.

`LoginAttemptService` locks an account for 15 minutes after 5 consecutive failures (→
423) and writes every login outcome to the `com.markly.audit` logger. The rate-limit
counters are in-memory, which is enough for the single instance this is deployed as — a
multi-instance deployment would need them shared (Redis) or enforced at the edge.

Passwords must be at least 10 characters with an upper-case letter, a lower-case letter
and a digit, must not contain the username's local part, and must not be one of the
common passwords listed in `UserValidationService`. The rule covers the seeded accounts
too: `DataSeeder` refuses to start if `SEED_ADMIN_PASSWORD` fails it (note that with the
default username `admin`, the password may not contain "admin"), and the demo constants
are asserted against it in `SeedPasswordPolicyTest`.

`POST /api/auth/password` lets any signed-in user rotate their own password: the current
password is required, the new one goes through the same policy, and the token version is
bumped so every other session ends while the calling tab gets a fresh cookie. This is
also the only way to rotate the seeded admin password from inside the app.

## No self-service or admin account management beyond create

An admin can list users (`GET /api/admin/users`) and create one
(`POST /api/admin/users`) — that's the entire user-management surface. An admin can also
deactivate/reactivate an account (`PUT /api/admin/users/{id}/status`) and lift a
brute-force lockout (`POST /api/admin/users/{id}/unlock`). There is still no edit or
delete endpoint for an account, and no self-service password reset or change for any
role (admin, teacher, or student) — the only way to change a password is for an admin to
create a new account with one. This is a deliberate scope cut, not an oversight; don't
assume a missing edit/delete endpoint is a bug to silently "fix."

## Demo data

`SEED_DEMO_DATA=true` on first startup creates:

* 8 teachers: `teacher1@uni-sofia.bg` … `teacher8@uni-sofia.bg`
* 20 students: `student1@uni-sofia.bg` … `student20@uni-sofia.bg`, each with a
  `student_profiles` row and grades across every semester up to and including the one
  they're currently enrolled in (~400 `grades` rows total for the fixed random seed)
* A handful of `calendar_events` (one test per subject, a holiday, a career-day event)

These are ordinary accounts pre-loaded with data — nothing stops them from writing.

## Restricted demo accounts

`RestrictedDemoAccountSeeder` seeds exactly two accounts, unconditionally, in every
environment including production (no `SEED_DEMO_DATA` gate, same as the real admin):
`teacher@uni-sofia.bg` and `student@uni-sofia.bg`, both flagged `users.is_demo`. This is a
distinct, deliberate decision from the bulk demo data above:

* **The login page has a one-click button for each.** `LoginPage.tsx` hardcodes the two
  usernames and the shared password (`password12345` — public by design, same value as
  `RestrictedDemoAccountSeeder.DEMO_PASSWORD`, duplicated here because a frontend build
  can't import a backend constant); clicking one signs straight in, no typing required.
* **Read is normal, write is always blocked.** `JwtAuthenticationFilter` rejects every
  non-GET/HEAD/OPTIONS request from a demo account with a friendly message, except
  `POST /api/auth/logout`. This is enforced once, centrally, independent of role — it would
  also block a demo *admin* if one ever existed, but see below, one never does.
* **The demo teacher's reads are scoped, the demo student's are not.** `StudentController`
  only ever returns the caller's own data, so nothing extra was needed there. `TeacherController`
  normally exposes the *entire* student directory (`GET /students`, `/students/lookup`) by
  design — a real teacher needs that reach. A demo teacher does not: since the demo password
  is public, leaving those endpoints open would let anyone harvest real students' names and
  faculty numbers. Both are scoped to `isDemo()` students only when the caller is a demo
  teacher (`StudentRosterService.demoStudents()`); a real teacher's view is unchanged.
* **Calendar is a deliberate exception.** `GET /api/calendar/events` stays unfiltered for
  demo accounts — calendar entries (exam dates, sessions, holidays) are institutional, not
  student PII, so there's no leak analogous to the roster/lookup case above.
* **No demo admin, anywhere.** The only admin account is the one created via
  `SEED_ADMIN_USERNAME`/`SEED_ADMIN_PASSWORD`; nobody else knows that password by design.
* **A public password means lockout must be exempted, not just writes.** `LoginAttemptService`
  skips the failed-attempt counter entirely for `isDemo()` accounts — otherwise anyone could
  deliberately fail the login 5 times and lock the demo out for every other visitor. The
  per-IP rate limiter (`LoginRateLimitFilter`) still applies.
* **Deactivating a demo account doesn't stick.** An admin can flip `enabled=false` via
  `PUT /api/admin/users/{id}/status`, but unlike a lockout that expires, that flag is
  permanent until changed back — so the seeder resets `enabled=true` (and clears any lock
  state) on every restart. This is intentional: it's the direct consequence of "always
  available in every environment." There is currently no in-app way to durably take a demo
  account offline; that would need a code or env change.
* **Hard-deleting a demo account is a no-op in practice.** `DELETE /api/admin/users/{id}`
  409s once an account has grade history, same as for any account, and the seeder gives
  both demo accounts a few `Grade` rows on first run — so after that, neither is deletable
  through the panel. Not a special case, just a consequence of the existing guard.

## Passwords

**All accounts (admin, all teachers, all students) use the same password:
`password12345`.** No exceptions. If a new account is added manually through the admin
panel, give it the same password unless explicitly asked otherwise.

## Admin credentials

`admin` / `password12345` (see `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` in
`backend/.env` for the real value if someone changed it locally).
