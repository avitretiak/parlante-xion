# syntax=docker/dockerfile:1.27.0@sha256:bde3983e9c939224420ddaf6b784cc30e09b035a4dea01f581230c50809f372e

# Bun 1.4.2 stable.
ARG BUN_IMAGE=oven/bun:1.4.2-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f

# ---- Dependencies Stage ----
FROM ${BUN_IMAGE} AS deps

WORKDIR /app

COPY package.json bun.lock ./

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production --ignore-scripts

# ---- Final Runtime Stage ----
FROM ${BUN_IMAGE}

ARG BUILD_DATE
ARG COMMIT_HASH
ARG VERSION
ARG GITHUB_REPOSITORY

RUN addgroup -S parlante \
  && adduser -S parlante -G parlante

LABEL org.opencontainers.image.title="parlante-xion"
LABEL org.opencontainers.image.description="A self-hosted Discord music bot"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${COMMIT_HASH}"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.source="https://github.com/${GITHUB_REPOSITORY}"

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY drizzle ./drizzle
COPY seyfert.config.mjs ./
COPY package.json ./
COPY tsconfig.json ./

ENV NODE_ENV=production
ENV BUILD_DATE=${BUILD_DATE}
ENV COMMIT_HASH=${COMMIT_HASH}
ENV VERSION=${VERSION}

RUN mkdir -p /data && chown parlante:parlante /data
USER parlante

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD pgrep -f "bun run src/index.ts" || exit 1

CMD ["bun", "run", "src/index.ts", "migrate-and-start"]
