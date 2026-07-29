# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @ride/api --include-workspace-root
COPY apps/api apps/api
RUN npm run build --workspace @ride/api

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @ride/api --include-workspace-root --omit=dev \
 && npm cache clean --force
COPY --from=build /repo/apps/api/dist ./dist
COPY db/migrations ./db/migrations
# Run unprivileged. The node image ships a `node` user for this.
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
