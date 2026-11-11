# syntax=docker/dockerfile:1.7
# Alpine is the default to keep the image small. The builder uses the same musl
# family so the standalone binary matches the runtime libc.
# To use the previous Debian slim setup, replace the builder with a pinned
# `oven/bun:debian` and runtime with `debian:bookworm-slim`, then
# replace apk/user commands with apt equivalents. Verify native modules and tools.

FROM oven/bun:1.4.2-alpine AS builder

WORKDIR /build

# Dependency layer: source changes do not invalidate Bun installation.
# Do not use BuildKit cache mounts here: Railway and other builders may not
# provide cache-mount support. The image must build with a standard builder.
COPY package.json bun.lock tsconfig.json ./
COPY dashboard/package.json ./dashboard/package.json
RUN bun install --frozen-lockfile

# Copy source contracts before dashboard typecheck: dashboard mirrors several
# backend types from src/ and cannot build against dashboard alone.
COPY src ./src
COPY dashboard ./dashboard
RUN bun run dashboard:build

# Backend build layer: AOT output is required before standalone compilation.
COPY scripts ./scripts
COPY migrations ./migrations
RUN bun run build:aot && bun run build:binary --outfile /build/dist/cartethyia

# OpenCode CLI is obtained from its official immutable release, pinned by
# SHA-256 per target architecture. No private or third-party image is required.
FROM --platform=$BUILDPLATFORM alpine:3.22 AS opencode
ARG TARGETARCH
ARG BUILDARCH
# Keep the release version in this step beside its per-architecture hashes;
# changing it requires reviewing and updating both pinned checksums.
RUN apk add --no-cache ca-certificates curl libgcc libstdc++ tar \
    && set -eu \
    && opencode_version="1.19.5" \
    && case "$TARGETARCH" in \
      arm64) asset="opencode-linux-arm64-musl.tar.gz"; sha="3522eccafd30d84a2d770b72a56d4877c576b9072b36a5a9ea0fa30ed82b896e" ;; \
      amd64) asset="opencode-linux-x64-musl.tar.gz"; sha="e8d5be23bf8f3f69bc3206f3311215c049329cd6afa7c06d733987cc2d33b568" ;; \
      *) echo "unsupported OpenCode target architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac \
    && curl --fail --location --silent --show-error --retry 3 \
      "https://github.com/anomalyco/opencode/releases/download/v${opencode_version}/${asset}" \
      --output /tmp/opencode.tar.gz \
    && echo "${sha}  /tmp/opencode.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/opencode.tar.gz -C /usr/local/bin opencode \
    && chmod 755 /usr/local/bin/opencode \
    && if [ "$TARGETARCH" = "$BUILDARCH" ]; then /usr/local/bin/opencode --version; fi

# Runtime ships the app binary, dashboard, migrations, OpenCode CLI, and license.
FROM alpine:latest

WORKDIR /app

# curl powers HEALTHCHECK; util-linux provides setpriv for non-root startup.
RUN apk add --no-cache ca-certificates curl libgcc libstdc++ util-linux \
    && addgroup -S -g 10001 cartethyia \
    && adduser -S -D -H -u 10001 -G cartethyia cartethyia \
    && mkdir -p /app/data \
    && chown -R cartethyia:cartethyia /app

COPY --from=builder --chown=cartethyia:cartethyia /build/migrations ./migrations
COPY --from=builder --chown=cartethyia:cartethyia /build/dist/dashboard ./dist/dashboard
COPY --chmod=755 docker-entrypoint.sh ./entrypoint.sh
COPY --from=builder --chown=cartethyia:cartethyia /build/dist/cartethyia ./cartethyia
COPY --from=opencode --chown=cartethyia:cartethyia /usr/local/bin/opencode /usr/local/bin/opencode
COPY --chown=cartethyia:cartethyia third-party/opencode/LICENSE ./third-party/opencode/LICENSE

ENV CARTETHYIA_VERSION=2.0 \
    NODE_ENV=production \
    DASHBOARD_DIST=/app/dist/dashboard \
    CARTETHYIA_INSTALL_ID_DIR=/app/data/.cartethyia

EXPOSE 12800
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f "http://localhost:${PORT:-12800}/health/ready" || exit 1

# Start as root so mounted data ownership can be repaired, then drop to uid 10001.
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["./cartethyia"]
