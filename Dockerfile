# ---- Dependencies Stage ----
FROM oven/bun:1-alpine AS deps

WORKDIR /app

COPY package.json bun.lock ./

RUN bun install --frozen-lockfile --production --ignore-scripts

# ---- Final Runtime Stage ----
FROM oven/bun:1-alpine

ARG BUILD_DATE
ARG COMMIT_HASH
ARG VERSION
ARG GITHUB_REPOSITORY

RUN apk add --no-cache sqlite-libs

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
COPY bun.lock ./

ENV NODE_ENV=production
ENV BUILD_DATE=${BUILD_DATE}
ENV COMMIT_HASH=${COMMIT_HASH}
ENV VERSION=${VERSION}

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD bun --version || exit 1

CMD ["bun", "run", "src/index.ts", "migrate-and-start"]
