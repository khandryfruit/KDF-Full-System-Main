# Root Dockerfile — Railway auto-detects this name and uses Docker instead of Railpack,
# which fixes: `failed to solve: secret PORT not found` when Railpack runs `pnpm start`
# during the image build.
#
# Per-service target (set in Railway → Variables for that service, available at build time):
#   KDF_RAILWAY_TARGET = admin | plus | admin-app | api
# If unset, defaults to `admin` (main admin static site).
#
# IMPORTANT for @workspace/api-server: if you use THIS Dockerfile for the API service,
# you MUST set KDF_RAILWAY_TARGET=api (build + runtime). Otherwise the builder skips
# `api-server run build` and the container crashes with MODULE_NOT_FOUND dist/index.mjs.
# Safer: set Railway Dockerfile Path to Dockerfile.api-server for the API service only.
#
# To use a dedicated Dockerfile instead, set RAILWAY_DOCKERFILE_PATH (e.g. Dockerfile.api-server).

FROM node:22-bookworm AS builder
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY . .

# --no-frozen-lockfile: avoids ERR_PNPM_LOCKFILE_CONFIG_MISMATCH when pnpm-workspace.yaml
# overrides differ slightly from the committed lockfile (common after workspace edits).
RUN pnpm install --no-frozen-lockfile

# Split admin + API on Railway: bake public API origin into Vite bundles unless overridden
# (Railway → Docker build args / service variables: VITE_API_BASE_URL).
ARG VITE_API_BASE_URL=https://api.khanbabadryfruits.com
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

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
      NODE_OPTIONS=--max-old-space-size=6144 pnpm --filter @workspace/api-server run build && \
      test -f /app/artifacts/api-server/dist/index.mjs ;; \
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
ENV NODE_OPTIONS=--max-http-header-size=65536
EXPOSE 8080

CMD ["/bin/sh", "-c", "set -e; t=\"${KDF_RAILWAY_TARGET:-admin}\"; case \"$t\" in admin) exec node /app/artifacts/kdf-admin/scripts/railway-static-server.mjs;; plus) exec node /app/artifacts/kdf-plus/scripts/railway-static-server.mjs;; admin-app) exec node /app/artifacts/kdf-admin-app/scripts/railway-static-server.mjs;; api) exec pnpm --filter @workspace/api-server run start;; *) echo \"Invalid KDF_RAILWAY_TARGET=$t\" >&2; exit 1;; esac"]
