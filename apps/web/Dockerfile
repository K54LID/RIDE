# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
ARG VITE_API_BASE
ENV VITE_API_BASE=$VITE_API_BASE
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @ride/web --include-workspace-root
COPY apps/web apps/web
RUN npm run build --workspace @ride/web

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
