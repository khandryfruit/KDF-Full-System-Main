# Root Dockerfile — Railway auto-detects this name and uses Docker instead of Railpack,
# which fixes: `failed to solve: secret PORT not found` when Railpack runs `pnpm start`
# during the image build.
#
# Per-service target (set in Railway → Variables for that service, available at build time):
#   KDF_RAILWAY_TARGET = admin | plus | admin-app | api
# If unset, defaults to `admin` (main admin static site).
#
# To use a dedicated Dockerfile instead, set RAILWAY_DOCKERFILE_PATH (e.g. Dockerfile.api-server).

FROM node:22-bookworm AS builder
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY . .

RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production
RUN set -eux; \
  target="${KDF_RAILWAY_TARGET:-admin}"; \
  case "$target" in \
    admin) \
      NODE_OPTIONS=--max-old-space-size=6144 pnpm --filter @workspace/kdf-admin run railway:build ;; \
    plus) \
      NODE_OPTIONS=--max-old-space-size=6144 pnpm --filter @workspace/kdf-plus run railway:build ;; \
    admin-app) \
      NODE_OPTIONS=--max-old-space-size=6144 pnpm --filter @workspace/kdf-admin-app run railway:build ;; \
    api) \
      NODE_OPTIONS=--max-old-space-size=6144 pnpm --filter @workspace/kdf-plus run railway:build && \
      NODE_OPTIONS=--max-old-space-size=6144 pnpm --filter @workspace/kdf-admin run railway:build && \
      NODE_OPTIONS=--max-old-space-size=6144 pnpm --filter @workspace/kdf-admin-app run railway:build && \
      NODE_OPTIONS=--max-old-space-size=6144 pnpm --filter @workspace/api-server run build ;; \
    *) \
      echo "Invalid KDF_RAILWAY_TARGET=$target (use admin|plus|admin-app|api)" >&2; \
      exit 1 ;; \
  esac

FROM node:22-bookworm AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY --from=builder /app /app

WORKDIR /app
EXPOSE 8080

CMD ["/bin/sh", "-c", "set -e; t=\"${KDF_RAILWAY_TARGET:-admin}\"; case \"$t\" in admin) exec pnpm --filter @workspace/kdf-admin run railway:start;; plus) exec pnpm --filter @workspace/kdf-plus run railway:start;; admin-app) exec pnpm --filter @workspace/kdf-admin-app run railway:start;; api) exec pnpm --filter @workspace/api-server run start;; *) echo \"Invalid KDF_RAILWAY_TARGET=$t\" >&2; exit 1;; esac"]
