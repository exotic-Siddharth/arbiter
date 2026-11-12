#!/bin/sh
# API container command (deploy/api.Dockerfile): apply pending Prisma migrations, then start the
# server. `migrate deploy` is idempotent and takes a Postgres advisory lock, so two API replicas
# starting together do not race. A failed migration stops the container before it serves traffic.
set -eu
cd /app/apps/api
node /opt/prisma-cli/node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma
exec node dist/index.js
