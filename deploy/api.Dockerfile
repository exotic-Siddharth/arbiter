# syntax=docker/dockerfile:1
# API and judge-worker image (DESIGN.md section 17). One image, two commands: the default command
# runs `prisma migrate deploy` and then the API; the worker service overrides it with
# `node dist/worker.js`. Build context: the repository root.
#
#   docker build -f deploy/api.Dockerfile -t arbiter-api .
ARG NODE_IMAGE=node:22-alpine

# ---- build: all api + shared dependencies, Prisma client, bundled dist/ ----
FROM ${NODE_IMAGE} AS build
RUN apk add --no-cache openssl
WORKDIR /app
# Manifests first, so the dependency layer is rebuilt only when a dependency changes. The web
# manifest is copied too because npm validates package-lock.json against every workspace.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# --ignore-scripts: the postinstall (prisma generate) needs the schema; it runs explicitly below.
RUN npm ci --workspace @arbiter/api --workspace @arbiter/shared --ignore-scripts --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
WORKDIR /app/apps/api
# schema.prisma lists three binaryTargets (dev machine, Debian, Alpine); this image only needs the Alpine one.
RUN npx prisma generate \
 && rm -f ../../node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node \
 && npm run build
# The Prisma CLI is a devDependency (absent from the production node_modules) but `migrate deploy`
# needs it at start-up. Install exactly the locked version into its own directory, with its engines.
RUN mkdir /opt/prisma-cli && cd /opt/prisma-cli \
 && npm init -y >/dev/null \
 && npm install --no-audit --no-fund "prisma@$(node -p "require('/app/node_modules/prisma/package.json').version")"

# ---- prod-deps: production dependencies only ----
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev --workspace @arbiter/api --workspace @arbiter/shared --ignore-scripts --no-audit --no-fund \
 && npm cache clean --force

# ---- runtime ----
FROM ${NODE_IMAGE} AS runtime
# openssl: the Prisma query engine. docker-cli: the worker starts sandbox containers through the
# host's Docker socket (mounted by docker-compose.prod.yml); the API container never gets the socket.
RUN apk add --no-cache openssl docker-cli
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /opt/prisma-cli /opt/prisma-cli
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/prisma/schema.prisma apps/api/prisma/
COPY apps/api/prisma/migrations apps/api/prisma/migrations
COPY deploy/start-api.sh deploy/start-api.sh
USER node
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["sh", "/app/deploy/start-api.sh"]
