# syntax=docker/dockerfile:1
# Web image (DESIGN.md section 17): the Vite build served by unprivileged nginx with deploy/nginx.conf.
# Build context: the repository root.
#
#   docker build -f deploy/web.Dockerfile --build-arg VITE_PUBLIC_ORIGIN=https://judge.example.com \n#     --build-arg VITE_DEMO_LOGIN=false -t arbiter-web .
ARG NODE_IMAGE=node:22-alpine
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.31-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace @arbiter/web --workspace @arbiter/shared --ignore-scripts --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
# VITE_* values are compiled into the bundle, so they are build arguments, not runtime variables.
ARG VITE_DEMO_LOGIN=false
ENV VITE_DEMO_LOGIN=${VITE_DEMO_LOGIN}
# The public origin (PUBLIC_ORIGIN): the absolute URLs of the link-preview tags in index.html.
ARG VITE_PUBLIC_ORIGIN
ENV VITE_PUBLIC_ORIGIN=${VITE_PUBLIC_ORIGIN}
RUN npm run build -w @arbiter/web

FROM ${NGINX_IMAGE} AS runtime
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
