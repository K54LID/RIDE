# syntax=docker/dockerfile:1
#
# Build context is the REPOSITORY ROOT, not apps/api.
# Coolify: Build Pack = Dockerfile, Base Directory = /,
#          Dockerfile Location = /apps/api/Dockerfile.

FROM node:22-alpine AS build
WORKDIR /repo
# npm validates the lockfile against ALL declared workspaces, so every
# workspace manifest must be present even when installing just one.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY apps/api apps/api
COPY db db
RUN npm run build --workspace @ride/api

# Migrations live INSIDE dist. They then arrive via the same single COPY
# as the compiled code, so they cannot be lost by a missed copy and
# cannot be masked by a volume mounted at /app/db.
RUN mkdir -p apps/api/dist/db/migrations \
 && cp db/migrations/*.sql apps/api/dist/db/migrations/ \
 && echo "--- migrations bundled into dist ---" \
 && ls -la apps/api/dist/db/migrations/

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace @ride/api --include-workspace-root \
 && npm cache clean --force

# Single copy carries both compiled code and migrations.
COPY --from=build /repo/apps/api/dist ./dist

# Fail the BUILD rather than shipping an image that crash-loops at boot.
RUN test -n "$(ls -A ./dist/db/migrations/*.sql 2>/dev/null)" \
 || (echo "FATAL: no .sql files at /app/dist/db/migrations" && exit 1)

USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
