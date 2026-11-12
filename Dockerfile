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
COPY packages/video/package.json packages/video/
RUN npm ci --no-audit --no-fund

FROM deps AS app
COPY . .
# Inlined into the browser bundle at build time: where the preview runtime is served.
ARG NEXT_PUBLIC_PREVIEW_ORIGIN=http://localhost:3001
ENV NEXT_PUBLIC_PREVIEW_ORIGIN=$NEXT_PUBLIC_PREVIEW_ORIGIN
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
# Phone previews (worker only): the Expo SDK every generated app pins, installed into the image so
# the worker never runs npm at runtime and the first preview doesn't wait minutes for it. Railway
# passes service variables to ARGs: set INSTALL_EXPO_RUNTIME=1 on the worker service.
ARG INSTALL_EXPO_RUNTIME=0
RUN if [ "$INSTALL_EXPO_RUNTIME" = "1" ]; then \
    mkdir -p /opt/expo-runtime && cp templates/expo-app/package.json /opt/expo-runtime/ \
    && cd /opt/expo-runtime && npm install --no-audit --no-fund && npm cache clean --force; \
  fi
ENV EXPO_RUNTIME_DIR=/opt/expo-runtime
# Promo videos (worker only): Chrome's runtime libraries, Remotion's headless Chrome (moved to a
# fixed path) and the pre-built composition, so the first render doesn't wait for a bundle. Set
# INSTALL_VIDEO_RENDERER=1 on the worker service. Without it, rendering reports it isn't set up.
ARG INSTALL_VIDEO_RENDERER=0
RUN if [ "$INSTALL_VIDEO_RENDERER" = "1" ]; then \
    apt-get update \
    && apt-get install -y --no-install-recommends libnss3 libdbus-1-3 libatk1.0-0 \
      libatk-bridge2.0-0 libgbm1 libasound2 libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 \
      libxdamage1 libpango-1.0-0 libcairo2 libcups2 fontconfig fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/* \
    && VIDEO_BUNDLE_DIR=/opt/video-bundle npm run prepare-renderer -w @appbuilder/video \
    && shell="$(find /app -type d -name 'chrome-headless-shell-linux*' -path '*.remotion*' | head -1)" \
    && mv "$shell" /opt/chrome-headless-shell \
    && if [ ! -e /opt/chrome-headless-shell/chrome-headless-shell ]; then \
      ln -s headless_shell /opt/chrome-headless-shell/chrome-headless-shell; fi; \
  fi
# Daily database backups (worker only): pg_dump from the PostgreSQL project's own repository,
# because it must be at least the server's major version (18 on Railway) and Debian ships 15.
# Set INSTALL_PG_CLIENT=1 on the worker service.
ARG INSTALL_PG_CLIENT=0
ARG PG_CLIENT_VERSION=18
RUN if [ "$INSTALL_PG_CLIENT" = "1" ]; then \
    apt-get update && apt-get install -y --no-install-recommends curl \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL --retry 5 --retry-all-errors --retry-delay 3 \
      -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
      https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends postgresql-client-$PG_CLIENT_VERSION \
    && rm -rf /var/lib/apt/lists/* && pg_dump --version; \
  fi
ENV VIDEO_BUNDLE_DIR=/opt/video-bundle
ENV VIDEO_BROWSER_EXECUTABLE=/opt/chrome-headless-shell/chrome-headless-shell
ENV NODE_ENV=production
# Local files (when S3_* is unset) live here; mount a volume at /data to keep them.
ENV APP_DATA_DIR=/data
EXPOSE 3000 3001
CMD ["npm", "run", "start", "-w", "@appbuilder/web"]
