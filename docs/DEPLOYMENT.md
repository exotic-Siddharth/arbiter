# Deploying Arbiter

This guide puts the whole stack on **one Linux VM** with Docker Compose. It follows
[DESIGN.md](DESIGN.md) section 17. Read [Security](#security-the-workers-docker-socket-is-root-equivalent)
before you expose anything.

What was and was not tested: the images, the compose file and the nginx configuration were built and
run on Docker Desktop (Linux containers) on a Windows laptop, and the smoke test in
[Verification](#what-was-verified) was run against that stack. The Linux-VM steps below (installing
Docker, the firewall, Caddy and Let's Encrypt, `runsc`) follow the vendors' documentation and have not been
run on a cloud VM by the author.

## What runs where

```
 browser --HTTPS--> [TLS proxy: Caddy profile, or one on the host]
                         |  plain HTTP, 127.0.0.1:8080
                    web (nginx)  -- serves the SPA, strict security headers
                         |  /api, /socket.io (WebSocket upgrade), /healthz, /readyz
                    api (Node)  -- REST + Socket.IO, runs `prisma migrate deploy` on start
                         |
          postgres  redis        worker (same image as api)
                                   |  /var/run/docker.sock (host)
                                   v
                             sandbox containers, one per judged test run
                             (image arbiter-sandbox:latest, built on the host, --network none)
```

| Service    | Image                         | Published port        | Notes                                                              |
| ---------- | ----------------------------- | --------------------- | ------------------------------------------------------------------ |
| `postgres` | `postgres:16-alpine`          | none                  | volume `pgdata`; on the internal `backend` network only            |
| `redis`    | `redis:7-alpine`              | none                  | volume `redisdata` (AOF on, `noeviction`); `backend` only          |
| `api`      | `arbiter-api` (`deploy/api.Dockerfile`) | none        | `/readyz` is its healthcheck; non-root, read-only root filesystem  |
| `worker`   | same image as `api`           | none                  | mounts the Docker socket; non-root, joins the host `docker` group  |
| `web`      | `arbiter-web` (`deploy/web.Dockerfile`) | `127.0.0.1:8080` | `nginxinc/nginx-unprivileged`; config in `deploy/nginx.conf`   |
| `caddy`    | `caddy:2-alpine`              | 80, 443               | optional, profile `tls`                                            |

The `backend` network is `internal: true`: Postgres and Redis have no route to or from the internet, and
the API and worker are the only containers on it besides them. The sandbox containers are not part of
the compose project; the worker starts them on the host's Docker daemon with `--network none`.

## Requirements

- A Linux VM with a public IP address, root or sudo access, and a DNS name pointing at it (TLS needs it).
- Docker Engine 24 or newer with the Compose v2 plugin (`docker compose`).
- Capacity: the judge starts up to `JUDGE_CONCURRENCY + RUN_CONCURRENCY` sandbox containers at once
  (defaults 2 and 1 per worker), each capped at the problem's memory limit plus runtime overhead
  (at most 2 GB) and one CPU. Size the VM for that plus Postgres, Redis, the API and nginx. The author has
  not measured a minimum VM size; start with what your concurrency needs and watch `docker stats`.
- Only ports 22 (SSH), 80 and 443 should be reachable from outside. Nothing else is published.

## Step by step

### 1. Install Docker

On Ubuntu, from Docker's own apt repository (for Debian, replace `ubuntu` with `debian` in the URL;
other distributions: <https://docs.docker.com/engine/install/>):

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
docker --version && docker compose version
```

Do not add the deploy user to the `docker` group unless you accept that membership is root-equivalent
too; prefix the commands below with `sudo` instead.

### 2. Get the code and build the sandbox image on the host

```sh
git clone <your repository URL> arbiter && cd arbiter
sudo docker build -t arbiter-sandbox:latest sandbox
```

The sandbox image must exist **on the host's Docker daemon** before the worker can judge anything: the
worker runs `docker run --pull never arbiter-sandbox:latest`, so a missing image fails the job at once
with "Sandbox image ... is not available" instead of trying a registry. The build installs g++ 12,
Python 3.11, OpenJDK 17 and Node.js 18 inside the image (about 1 GB) and fails if any of those major
versions drifts. Rebuild it whenever `sandbox/` changes.

### 3. Configure

```sh
cp .env.production.example .env.production
chmod 600 .env.production
```

Fill in the blank values (every `${VAR:?...}` in the compose file stops the start with a message
until you do):

| Variable             | What to put                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `PUBLIC_ORIGIN`      | The `https://` address users open, with no trailing slash. It is the CORS and cookie origin.                 |
| `POSTGRES_PASSWORD`  | `openssl rand -hex 24`. URL-safe characters only: it is embedded in `DATABASE_URL`.                          |
| `JWT_ACCESS_SECRET`  | `openssl rand -base64 48`. The API refuses to start with a short secret or a published development value.   |
| `DOCKER_GID`         | `stat -c %g /var/run/docker.sock`, so the non-root worker can use the socket.                               |
| `DOMAIN`             | Only for the Caddy profile: the host name for the certificate.                                               |

The compose file fixes the rest: `NODE_ENV=production`, `COOKIE_SECURE=true`, `TRUST_PROXY=1` (one hop:
the web container) and rate limiting on. The API's config guard (review finding A-09) refuses to start in
production with `RATE_LIMITS_ENABLED=false`, the repository's development JWT secret or the development
admin password. A unit test (`apps/api/src/config/deployConfig.test.ts`) checks that
`.env.production.example`, once filled in, passes that guard and that the compose file reads no variable
the example does not document.

`VITE_DEMO_LOGIN` is compiled into the web bundle, so changing it needs `up -d --build`. Leave the demo
login off on a public site.

### 4. TLS in front of nginx

Browsers refuse the `Secure` refresh cookie on plain HTTP, so sign-in does not stay alive without TLS. The
web container itself speaks HTTP only, on `127.0.0.1:8080` by default. Pick one:

**A. The bundled Caddy (automatic HTTPS).** Point the DNS A/AAAA record of `DOMAIN` at the VM, open
ports 80 and 443, then add the profile when you start the stack (step 5):

```sh
sudo docker compose --env-file .env.production -f docker-compose.prod.yml --profile tls up -d --build
```

Caddy obtains and renews a Let's Encrypt certificate and proxies to `web:8080`, WebSocket included
(`deploy/Caddyfile`). nginx trusts `X-Forwarded-For` only from private address ranges, which is
where Caddy sits, so rate limits see the real client address.

**B. A proxy you already run on the host** (nginx, Caddy, a cloud load balancer): proxy
`https://your.domain` to `http://127.0.0.1:8080`, with WebSocket upgrade enabled, and have it set
`X-Forwarded-For`. If it runs on a different machine, set `WEB_BIND` to a private interface address and
protect that port with the firewall: it must not be reachable from the internet. The web container already
sends `Strict-Transport-Security`; browsers ignore it until the page is served over HTTPS.

### 5. Start

```sh
sudo docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
sudo docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

The first start builds both images (several minutes: the web build bundles Monaco). `api` applies every
Prisma migration before it listens, then reports healthy; `worker` and `web` wait for that. Check:

```sh
curl -fsS http://127.0.0.1:8080/healthz      # {"ok":true}
curl -fsS http://127.0.0.1:8080/readyz       # {"ok":true,"db":"up","redis":"up"}
```

### 6. Create the first admin and add problems

Registration creates normal users. Register your own account on the site, then promote it once in
the database:

```sh
sudo docker compose --env-file .env.production -f docker-compose.prod.yml exec postgres \
  psql -U arbiter -d arbiter -c "UPDATE \"User\" SET role = 'ADMIN' WHERE \"usernameLower\" = lower('your_username');"
```

Sign out and in again (a promotion reaches the access token at its next refresh). From then on the admin
panel manages users, problems, contests and plagiarism checks. Create problems there: add the statement
and the test cases, then use "Validate reference" to confirm your reference solution judges Accepted.

Do **not** run `npm run db:seed` against this database: the seed deliberately wipes the application tables
and recreates the demo data (DESIGN.md section 14). It is a development tool.

## Operating it

**Logs.** All services log JSON to Docker's `json-file` driver, rotated at 5 files of 10 MB each:
`sudo docker compose -f docker-compose.prod.yml logs -f api worker`. The worker logs the submission id,
verdict and duration of every job. Secrets, cookies and source code are redacted from logs.

**Health.** The compose healthchecks use `/readyz` (api, which checks Postgres and Redis) and the worker's own
`/metrics` (port 9464 inside the container). nginx exposes `/healthz` and `/readyz` and answers 404 for
`/metrics`, so metrics are not public. To scrape them, run Prometheus on the `frontend`/`backend` networks
and target `api:4000/metrics` and `worker:9464/metrics`.

**Backups.** Postgres is the system of record. Redis holds queue jobs, rate-limit counters, run results
and the cached contest scoreboards, which are rebuilt from Postgres on the next read; a submission whose job
was lost is ended as a system error by the worker's reconciler (review finding A-06). So back up Postgres:

```sh
sudo docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U arbiter -d arbiter --format=custom > "arbiter-$(date +%F).dump"
```

Run it from cron, copy the files off the VM, and test a restore on another machine:

```sh
sudo docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U arbiter -d arbiter --clean --if-exists < arbiter-2026-01-01.dump
```

**Housekeeping.** The worker's periodic sweep (every 60 s) removes sandbox containers orphaned by a crashed
worker, ends rows whose job was lost, and deletes expired and revoked refresh-token rows.

**Upgrades.**

```sh
git pull
sudo docker build -t arbiter-sandbox:latest sandbox      # only needed when sandbox/ changed
sudo docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Compose recreates only the services whose image changed. The new `api` applies pending migrations before
it serves traffic. Migrations are forward-only: take a `pg_dump` before upgrading, because rolling back means
restoring it. The worker stops gracefully (it lets running jobs finish, 30 s cap), and the API drains on
SIGTERM. `docker compose ... down` keeps the volumes; add `-v` only when you mean to delete the data.

## Why serverless hosts cannot run the worker

Vercel, Netlify, Cloudflare Workers, AWS Lambda and Render-style web services run your code as a short-lived
function or in a container with no access to a Docker daemon. The judge needs three things they do not give:

1. **A Docker daemon it controls.** Every judged run is a fresh container started with the Docker CLI
   (`--network none`, read-only root, memory, CPU and PID limits). Platform containers do not expose
   `/var/run/docker.sock`, and running Docker inside them needs privileged mode, which these platforms
   refuse.
2. **A long-lived process.** The worker holds a BullMQ connection to Redis, a heartbeat and in-flight jobs
   for tens of seconds; functions are frozen or killed between requests and are limited in duration.
3. **Raw control of the host.** Resource limits, the host-built sandbox image and the janitor that removes
   orphaned containers all assume the worker owns the machine's Docker.

The same applies to Socket.IO, which needs a persistent WebSocket connection. The web tier alone (static files)
could live on a static host, but then `/api` and `/socket.io` need a separate origin, CORS and cookie
configuration that this guide does not cover. A single VM keeps one origin and one TLS endpoint.

## Security: the worker's Docker socket is root-equivalent

The worker needs `/var/run/docker.sock`. Whoever can talk to that socket can start a container that mounts
the host's root filesystem, so **a compromise of the worker process is a compromise of the VM** (root on the
host). The sandbox hardening (no network, read-only root, dropped capabilities, `no-new-privileges`, cgroup
limits, PID limit) protects the host from *submitted code*, not from a bug in the worker or its
dependencies. Consequences:

- **Run the judge on a dedicated VM** that holds nothing else of value: no other applications, no
  credentials for other systems, no access to internal networks. Treat the VM as disposable and rebuildable
  from this repository plus a database backup.
- Keep Postgres and Redis off the public network (the compose file does this) and keep the firewall to 22, 80
  and 443. Use SSH keys only.
- The worker and API containers run as an unprivileged user with a read-only root filesystem and no
  capabilities, and the API container never receives the Docker socket. This reduces what an attacker gets
  from a bug in those processes; it does not make the socket safe.
- Keep Docker, the kernel and the base images patched; rebuild with `up -d --build` regularly (the Dockerfiles
  use `node:22-alpine`, so a rebuild picks up fixes).
- **Optional, stronger isolation: gVisor.** Install `runsc` as documented at <https://gvisor.dev/docs/user_guide/install/>,
  register it with Docker (`runsc install` adds the runtime to `/etc/docker/daemon.json`, then restart Docker),
  and set `SANDBOX_RUNTIME=runsc` in `.env.production`. The worker then adds `--runtime runsc` to every sandbox
  container, so submitted code talks to gVisor's user-space kernel instead of the host kernel. This repository
  has not been tested with `runsc`; run the sandbox tests (`npm run test:sandbox` with `SANDBOX_RUNTIME=runsc`)
  on your VM before relying on it, because some syscalls and cgroup behaviours differ.
- The worker runs the Docker CLI against the host daemon, so images it names are resolved on the host. The
  sandbox image is never pulled (`--pull never`).

## Troubleshooting

| Symptom                                                           | Cause and fix                                                                                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `required variable ... is missing a value`                        | A blank in `.env.production`; the message names it. Pass `--env-file .env.production` on every compose command.                           |
| `api` exits with "Invalid environment configuration"             | The config guard refused a value (short or development JWT secret, bad URL). The log lists each invalid variable.                         |
| Submissions end as `IE` with "Sandbox image ... is not available" | Build `arbiter-sandbox:latest` on the host (step 2). The name must match `SANDBOX_IMAGE`.                                                  |
| The worker logs `permission denied` on `/var/run/docker.sock`     | `DOCKER_GID` is not the socket's group id. `stat -c %g /var/run/docker.sock`, fix the value and run `up -d` again.                         |
| Login works but you are signed out after about 15 minutes         | The page is served over HTTP, so the `Secure` refresh cookie is dropped. Use HTTPS (step 4).                                              |
| `502` from nginx right after recreating `api`                     | nginx re-resolves `api` every 10 s through Docker's DNS; wait a few seconds.                                                              |
| Everyone shares one rate limit                                    | The proxy in front is not setting `X-Forwarded-For`, or it connects from a public address nginx does not trust. See step 4.               |

## What was verified

On Docker Desktop 29.9 (Windows 11, WSL2 backend), project name `arbiter-polish`, web on an alternative port:
`docker compose -f docker-compose.prod.yml build` succeeded; all services reached healthy; through nginx the
health endpoints, registration, an admin-created problem and a C++ submission judged **Accepted** by the worker
in a real sandbox container worked end to end; nginx's security headers and the SPA fallback were checked with
`curl`. The numbers and the exact result are in the Decisions log entry of [DESIGN.md](DESIGN.md) dated
2026-11-12. The CI workflow (`.github/workflows/ci.yml`) was validated with `actionlint` but has not run on
GitHub, because nothing is pushed.
