# syntax=docker/dockerfile:1
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
COPY db/migrations ./db/migrations
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
