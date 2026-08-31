# syntax=docker/dockerfile:1.26.0@sha256:ecfaec9ed6d810b56388c508f4121597bfbba70d41a6dfeee4d8cad5f295fc32

# bun 1.4.0 stable (2026-08-20); canary → stable per request.
ARG BUN_IMAGE=oven/bun:1.4.0-alpine@sha256:07235578f79ef8c6f97d94aee7938e76f5cdba5f21ae5dbfdd3d3d38058437eb

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
