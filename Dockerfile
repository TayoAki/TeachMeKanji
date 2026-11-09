# syntax=docker/dockerfile:1
# The official Node image; any mirror of it works (e.g. mirror.gcr.io/library/node:22-bookworm-slim).
ARG NODE_IMAGE=node:22-bookworm-slim

# One image for the three services. docker-compose.prod.yml runs it as:
#   web      npm run start -w @appbuilder/web       (port 3000)
#   preview  npm run start -w @appbuilder/preview   (port 3001, a different origin in production)
#   worker   npm run start -w @appbuilder/worker
#   migrate  npm run db:migrate                     (one-shot, before web and worker)

FROM ${NODE_IMAGE} AS base
# npm 10 crashes on this dependency tree; the repo pins npm 11. Unpack it over the bundled npm
# rather than `npm install -g npm`: upgrading npm in place can leave old internal modules behind
# (on Railway it did, and every later `npm install` crashed in minipass-flush).
RUN cd /tmp && npm pack npm@11.21.2 --silent \
  && rm -rf /usr/local/lib/node_modules/npm && mkdir /usr/local/lib/node_modules/npm \
  && tar -xzf npm-11.21.2.tgz -C /usr/local/lib/node_modules/npm --strip-components=1 \
  && rm npm-11.21.2.tgz && npm -v \
  && apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/preview/package.json apps/preview/
COPY apps/worker/package.json apps/worker/
COPY packages/contract/package.json packages/contract/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
RUN npm ci --no-audit --no-fund

FROM deps AS app
COPY . .
# Inlined into the browser bundle at build time: where the preview runtime is served.
ARG NEXT_PUBLIC_PREVIEW_ORIGIN=http://localhost:3001
ENV NEXT_PUBLIC_PREVIEW_ORIGIN=$NEXT_PUBLIC_PREVIEW_ORIGIN
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
ENV NODE_ENV=production
# Local files (when S3_* is unset) live here; mount a volume at /data to keep them.
ENV APP_DATA_DIR=/data
EXPOSE 3000 3001
CMD ["npm", "run", "start", "-w", "@appbuilder/web"]
