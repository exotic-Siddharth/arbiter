# API

A JSON REST API under `/api` plus Socket.IO events. This page explains the conventions and lists the
main endpoints by area; the OpenAPI document is the complete, exact reference.

## OpenAPI document

The API serves its own OpenAPI 3.0.3 document, generated from the same zod schemas that validate the
requests (`packages/shared`):

| URL (development) | Content |
| --- | --- |
| `http://localhost:4000/api/openapi.json` | the document (JSON) |
| `http://localhost:4000/api/docs` | Swagger UI for it |

The Vite dev server proxies `/api`, so `http://localhost:5173/api/docs` works too. In production nginx
proxies the same paths. An integration test (`apps/api/src/app.test.ts`) checks that every registered
route is an operation in the document and that the route list equals the specification's list plus
two documented extras.

## Authentication

| Token | Where it lives | Lifetime |
| --- | --- | --- |
| Access token: JWT (HS256), claims `sub`, `role`, `username` | the SPA's memory only; sent as `Authorization: Bearer <token>` | 15 minutes |
| Refresh token: 32 random bytes (base64url), stored as its SHA-256 | cookie `arb_rt`: `HttpOnly`, `SameSite=Strict`, `Path=/api/auth`, `Secure` in production | 14 days, renewed on every refresh |

- `POST /api/auth/register` and `POST /api/auth/login` return `{ user, accessToken }` and set the
  cookie. `POST /api/auth/demo` signs in as the seeded demo user when `DEMO_LOGIN_ENABLED` is on.
- `POST /api/auth/refresh` rotates the refresh token. Presenting a token that was already rotated or
  revoked revokes the whole token family (reuse detection) and answers 401. The exception is a lost
  response: a token rotated less than 30 s ago whose successor was never used gets a fresh successor
  in the same session (the unused one is revoked). A thief replaying a stolen old token inside those
  30 s could race the user; the window is short and opens only while the successor is unused.
- `POST /api/auth/logout` revokes the family and clears the cookie.
- Passwords are hashed with Argon2id (19 MiB memory, 2 iterations). A login for an unknown account
  verifies against a dummy hash of the same cost, so the response time does not reveal whether the
  account exists, and the message is a generic "Invalid credentials".
- An access token that claims ADMIN is re-checked against the database role on every request; a
  demotion applies at once, a promotion at the next refresh.
- On routes where auth is optional, an invalid or expired token is a 401 (so the client refreshes),
  not a silent downgrade to guest.

## Errors

Every error has one shape. For example, `GET /api/problems?pageSize=1000` answers 400 with:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request: pageSize: Number must be less than or equal to 100",
    "details": [
      {
        "location": "query",
        "path": "pageSize",
        "message": "Number must be less than or equal to 100",
        "code": "too_big"
      }
    ]
  }
}
```

| Code | Status | When |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | a body, query or path parameter fails its zod schema; `details` lists every issue |
| `UNAUTHORIZED` | 401 | missing, invalid or expired token; wrong credentials |
| `FORBIDDEN` | 403 | signed in but not allowed (for example a USER on an admin route) |
| `NOT_FOUND` | 404 | unknown resource, and resources the caller may not know exist (hidden submissions, draft problems) |
| `CONFLICT` | 409 | duplicate slug, email or username; rules such as "already rated" or "publish without tests" |
| `PAYLOAD_TOO_LARGE` | 413 | JSON body over 1 MB (20 MB on the admin test-upload routes) |
| `RATE_LIMITED` | 429 | a rate limit was hit; see below |
| `INTERNAL` | 500 | anything unexpected; the client gets a generic message, the details go to the log |

Every response carries an `X-Request-Id` header that matches the server's log lines.

## Rate limits

Limits use a Redis store, so they hold across API processes. A 429 carries a `Retry-After` header (in
seconds) and `details.retryAfterSec`.

| Limit | Window | Key |
| --- | --- | --- |
| all `/api` routes: 300 | 1 minute | client IP (IPv6 by /64 prefix) |
| login and demo login: 10 | 15 minutes | client IP + identifier |
| registration: 5 | 1 hour | client IP |
| `POST /api/submissions`: 6 | 1 minute | user |
| `POST /api/runs`: 12 | 1 minute | user |

Socket.IO events are limited per socket: a bucket of 20 events refilled at 10 per second; 25 rejected
events close the connection.

## Paging

List endpoints take `?page=1&pageSize=20` (`pageSize` at most 100, `page` at most 1,000,000) and return
`{ items, total, page, pageSize }`. Timestamps are ISO-8601 strings and ids are cuids.

## Endpoints

Auth column: `-` public, `opt` token optional, `user` signed in, `admin` ADMIN role.

### Auth and users

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `POST /api/auth/register` | - | create an account (409 with `details.field` on a duplicate email or username) |
| `POST /api/auth/login` | - | sign in with email or username |
| `POST /api/auth/demo` | - | sign in as the demo user |
| `POST /api/auth/refresh` | cookie | rotate the refresh token, get a new access token |
| `POST /api/auth/logout` | cookie | revoke the session |
| `GET /api/auth/me` | user | the current user |
| `GET /api/users/:username` | - | profile: stats, 365-day heatmap, rating history, recent accepted |
| `PATCH /api/users/me` | user | edit the bio |
| `GET /api/leaderboard` | - | by rating or by problems solved |
| `GET /api/stats` | - | landing-page counters |

### Problems, submissions and runs

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `GET /api/problems` | opt | search, filter by difficulty, tag and status (solved, attempted, unsolved), sort |
| `GET /api/problems/:slug` | opt | statement, limits, samples |
| `GET /api/tags` | - | tags of published problems with counts |
| `POST /api/submissions` | user | submit `{ problemSlug, language, sourceCode, contestSlug? }`; 202, judged asynchronously |
| `GET /api/submissions` | opt | list with filters; other users' contest submissions stay hidden while the contest runs |
| `GET /api/submissions/:id` | opt | detail; source, compile output and failed-sample data only for the owner or an admin |
| `POST /api/runs` | user | run code on custom input (nothing stored in Postgres); 202 `{ runId }` |
| `GET /api/runs/:runId` | user | the run result (owner only, kept 10 minutes) |

### Contests

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `GET /api/contests` | opt | published contests, `?status=upcoming`, `running` or `past` |
| `GET /api/contests/:slug` | opt | detail with `serverTime` for clock-corrected countdowns |
| `POST /api/contests/:slug/register` | user | register (allowed until the end) |
| `GET /api/contests/:slug/problems/:label` | opt | a contest problem, visible after the start |
| `GET /api/contests/:slug/scoreboard` | opt | ICPC standings, paged (default 50 rows) |
| `GET /api/contests/:slug/submissions` | user | own submissions while the contest runs, everyone's after |

### Admin

All under `/api/admin`, ADMIN role required.

| Method and path | Purpose |
| --- | --- |
| `GET, POST /problems`; `GET, PUT, DELETE /problems/:id` | problem CRUD (PUT is a full replace) |
| `GET, POST /problems/:id/tests`; `GET, PUT, DELETE /problems/:id/tests/:testId` | test cases (the list returns sizes and previews, not full data) |
| `POST /problems/:id/tests/bulk` | upload many tests at once, append or replace (20 MB body limit) |
| `POST /problems/:id/validate-reference` | judge the stored reference solution like a submission |
| `POST /problems/:id/generate-outputs` | run the reference on every input and overwrite the expected outputs (all or nothing) |
| `GET /jobs/:id` | progress of a generate-outputs job |
| `GET, POST /contests`; `GET, PUT, DELETE /contests/:id` | contest CRUD with problem labels |
| `POST /contests/:id/rate` | apply ratings (409 before the end, while judging or when already rated) |
| `POST /plagiarism`; `GET /plagiarism`; `GET /plagiarism/:id` | run and read plagiarism reports with matched lines |
| `GET /judge` | queue counts, workers, queue-to-verdict p50/p95, throughput per minute |
| `GET /users`; `PATCH /users/:id` | search users, change a role (not one's own; never the last admin) |

### Health and metrics

These live at the root, not under `/api`, and are not in the OpenAPI document.

| Path | Purpose |
| --- | --- |
| `GET /healthz` | process is up: `{ ok: true }` |
| `GET /readyz` | Postgres and Redis reachable (503 otherwise) |
| `GET /metrics` | Prometheus metrics (nginx answers 404 for it in production) |

## Socket.IO

Connect to `/socket.io` with `auth: { token }` (optional; guests can watch scoreboards and the feed).

| Client sends | Joins | Then receives |
| --- | --- | --- |
| `submission:subscribe { id }` (owner or admin) | `submission:<id>` | `submission:status`, `submission:test`, `submission:done` |
| `contest:subscribe { slug }` | `contest:<id>` | `scoreboard:row` |
| `feed:subscribe` | `feed` | `feed:judged` |
| (automatic when signed in) | `user:<id>` | `submission:done`, `run:result` |

Each subscribe has an `:unsubscribe` counterpart and is acknowledged with `{ ok: true }` or
`{ ok: false, error }`. Event payloads are zod schemas in `packages/shared/src/realtime.ts`. See
[ARCHITECTURE.md](ARCHITECTURE.md#realtime-fan-out) for how events travel from the worker.
