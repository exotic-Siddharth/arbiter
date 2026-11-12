# Arbiter

Online judge and live programming-contest platform with Docker-sandboxed code execution.
The design lives in [docs/DESIGN.md](docs/DESIGN.md) (its Decisions log records every deviation).

## Quick start (development)

Needs Node 22.12+, Docker, and Python 3.9+ (for the problem-set scripts).

```
npm install
cp apps/api/.env.example apps/api/.env && cp apps/web/.env.example apps/web/.env
npm run infra:up            # Postgres (55432) and Redis (56379)
npm run db:deploy           # apply migrations
npm run problems:gen        # regenerate the hidden tests (not committed, about 90 MB)
npm run db:seed             # demo data; prints the demo credentials
npm run sandbox:build       # build the judge image arbiter-sandbox:latest
npm run dev                 # api (4000) + worker + web (5173)
```

`npm run db:seed` stops with a clear message if the hidden tests are missing: run
`npm run problems:gen` first. Details, the seeded data and `npm run judge:refs` are described in
[seed/problems/README.md](seed/problems/README.md).

Demo accounts (local development values): `demo` / `demo12345` (or the "Try the demo" button) and
`admin` / `admin12345`.

## Checks

```
npm run typecheck && npm run lint && npm run format:check
npm test                    # unit + integration (needs Postgres and Redis)
npm run test:sandbox        # real-Docker judge tests (needs the sandbox image)
```

## Deployment and CI

`docker-compose.prod.yml` runs Postgres, Redis, the API, the judge worker and an nginx web tier on one
Linux VM; [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) is the step-by-step guide, including why the worker
cannot run on serverless hosts and why its Docker socket makes the VM root-equivalent (use a dedicated
VM). `.env.production.example` lists every setting. `.github/workflows/ci.yml` defines the CI jobs (lint
and typecheck, integration, sandbox, Playwright e2e); it has not run on GitHub yet.
