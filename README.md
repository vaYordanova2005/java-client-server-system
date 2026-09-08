# Markly

**Live version: [markly-frontend.onrender.com](https://markly-frontend.onrender.com)**
(free-plan cold start — first load can take up to ~2 minutes, see [Deployment](#deployment))

School system: Spring Boot REST backend + PostgreSQL + React frontend. Roles Admin /
Teacher / Student — admin creates users and manages student registrar profiles, teacher
enters grades and manages the calendar, student views their own grades/journal/statistics
and a read-only profile/calendar.

The original TCP socket version of the project is kept in [legacy/](legacy/) as a
reference only and is no longer maintained.

See [documentation/](documentation/) for architecture, decisions, and per-role docs.

## Stack

* Backend: Java 21, Spring Boot, Spring Security (JWT), Spring Data JPA, Flyway, Maven
* Frontend: React, TypeScript, Vite, React Router
* Database: PostgreSQL

## Running locally

### 1. PostgreSQL

Create a database (defaults to `markly`):

```
createdb markly
```

### 2. Backend

```
cd backend
DB_USERNAME=postgres DB_PASSWORD=<your password> \
JWT_SECRET=<random string, at least 32 bytes> \
SEED_ADMIN_PASSWORD=<password for the admin account> \
./mvnw spring-boot:run
```

`JWT_SECRET` and `SEED_ADMIN_PASSWORD` have no default value — the app won't start
without them, so it can't accidentally end up deployed with publicly known credentials.
`SEED_ADMIN_PASSWORD` must also satisfy the password policy (at least 10 characters with
an upper-case letter, a lower-case letter and a digit, and not containing the admin's own
username) or startup fails; it can be rotated afterwards from the profile page.
On first startup Flyway creates the schema and seeds an admin account with username
`admin` (configurable via `SEED_ADMIN_USERNAME`) and the password set in
`SEED_ADMIN_PASSWORD`.

Configurable env vars: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`,
`DB_SSLMODE`, `SERVER_PORT`, `JWT_SECRET`, `JWT_EXPIRATION_MINUTES`, `SEED_ADMIN_USERNAME`,
`SEED_ADMIN_PASSWORD`, `SEED_DEMO_DATA`, `FRONTEND_ORIGIN`, `AUTH_COOKIE_SECURE`,
`AUTH_COOKIE_SAME_SITE`, `TRUSTED_PROXIES`.

`TRUSTED_PROXIES` (empty by default) lists the networks, as comma-separated CIDRs, that
the proxies in front of the app occupy. The login rate limiter reads the client address
from `X-Forwarded-For`, skipping entries written by those networks and taking the first
one that is not. Empty is correct for Render on its own, which appends exactly one entry.

Put a CDN (e.g. Cloudflare) in front and you must add its ranges here, or every user
ends up sharing one rate-limit bucket keyed by the CDN. Matching networks rather than
counting entries is also what keeps a CDN bypass from being exploitable: a request that
reaches the origin directly carries the attacker's own address as its last entry, which
is not a trusted proxy and so is what the limiter buckets on. An origin lock (the origin
accepting traffic only from the CDN) is still worth setting up, but the rate limiter no
longer depends on it.

The session JWT is delivered in an httpOnly cookie. When the frontend is served from a
different host than the API (as on Render), set `AUTH_COOKIE_SECURE=true` and
`AUTH_COOKIE_SAME_SITE=None`, or the browser will drop the cookie; the defaults
(`false`/`Lax`) are for running both on localhost.

#### Demo data (optional)

With `SEED_DEMO_DATA=true`, the first startup against an empty database creates 8
teachers, 20 students (each with a registrar profile and grades across every semester up
to and including the one they're currently enrolled in), and a handful of calendar
events, so there's something to look at on every page. Disabled by default — only enable
it on a local/test database, never against a live production database. Demo credentials
(valid under the same rules as manually created accounts):

* Teachers: `teacher1@uni-sofia.bg` … `teacher8@uni-sofia.bg`, password `password12345`
* Students: `student1@uni-sofia.bg` … `student20@uni-sofia.bg`, password `password12345`

For a remote database (e.g. [Neon](https://neon.tech)), set `DB_HOST` to the host from
the connection string and `DB_SSLMODE=require`:

```
DB_HOST=<ep-xxx.neon.tech> DB_NAME=<database> DB_USERNAME=<user> DB_PASSWORD=<password> DB_SSLMODE=require ./mvnw spring-boot:run
```

### 3. Frontend

```
cd frontend
npm install
npm run dev
```

Expects the backend on `http://localhost:8080` by default (see `frontend/.env`).

## Deployment

Live at [markly-frontend.onrender.com](https://markly-frontend.onrender.com) (backend at
`markly-backend-w80o.onrender.com`), deployed on [Render](https://render.com) via the
[render.yaml](render.yaml) blueprint: the backend runs from [backend/Dockerfile](backend/Dockerfile)
as a Docker web service, the frontend as a static site, against the same Neon Postgres
instance used for local development.

Both services are on Render's free plan, which spins down after inactivity — the first
request afterwards can take up to ~2 minutes while the backend cold-starts (JVM boot +
Neon connection).

`FRONTEND_ORIGIN` (backend) and `VITE_API_BASE_URL` (frontend) must point at each other's
actual `*.onrender.com` URLs — Render appends a random suffix to a service's URL when its
plain name is taken, so these can't be hardcoded in the blueprint and are set manually per
service in the Render dashboard's Environment tab. `VITE_API_BASE_URL` is baked in at
frontend build time, so changing it requires a redeploy, not just a restart.

## Tests

```
cd backend && ./mvnw test
cd frontend && npm test    # vitest; npm run lint and npm run build also gate CI-worthy changes
```

## Roles

* **Admin** → creates teacher/student accounts (teacher username: `@uni-sofia.bg` email;
  student: any email, password at least 5 characters) and manages student registrar
  profiles (faculty number, group, semester, etc.)
* **Teacher** → enters student grades by email; creates/deletes calendar events
* **Student** → views their own grades (dashboard, journal, statistics), and a read-only
  registrar profile and calendar — see [documentation/student.md](documentation/student.md)
  for the full picture
