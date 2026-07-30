# syntax=docker/dockerfile:1
#
# Build context is the REPOSITORY ROOT, not apps/api.
# In Coolify set Build Pack = Dockerfile, Base Directory = /,
# Dockerfile Location = /apps/api/Dockerfile.

FROM node:22-alpine AS build
WORKDIR /repo
# npm validates the lockfile against ALL declared workspaces, so every
# workspace manifest must be present even when installing just one.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY apps/api apps/api
RUN npm run build --workspace @ride/api

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace @ride/api --include-workspace-root \
 && npm cache clean --force

COPY --from=build /repo/apps/api/dist ./dist

# Migrations are runtime data read from disk, not compiled into dist.
# Copy the whole db/ tree so future subdirectories come along too.
COPY db ./db

# Fail the BUILD if migrations are absent, rather than shipping an image
# that crash-loops at boot. This is exactly the failure we just spent an
# evening diagnosing.
RUN test -d ./db/migrations \
 && test -n "$(ls -A ./db/migrations/*.sql 2>/dev/null)" \
 || (echo "FATAL: no .sql files at /app/db/migrations" && exit 1)

USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
