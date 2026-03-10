# syntax=docker/dockerfile:1

# ---- Dependencies Stage ----
FROM oven/bun:1-alpine AS deps

WORKDIR /app

COPY package.json bun.lock ./

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production --ignore-scripts

# ---- Final Runtime Stage ----
FROM oven/bun:1-alpine

ARG BUILD_DATE
ARG COMMIT_HASH
ARG VERSION
ARG GITHUB_REPOSITORY

RUN apk add --no-cache sqlite-libs \
  && addgroup -S parlante \
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

CMD ["bun", "run", "src/index.ts", "migrate-and-start"]
