# syntax=docker/dockerfile:1
#
# Coolify: Build Pack = Dockerfile, Base Directory = /,
#          Dockerfile Location = /apps/web/Dockerfile.
#
# VITE_API_BASE is the ONE value that legitimately belongs at build
# time — Vite inlines it into the static bundle. It is not a secret.

FROM node:22-alpine AS build
ARG VITE_API_BASE=https://api.ridethatbot.fun
ENV VITE_API_BASE=$VITE_API_BASE
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --include=dev
COPY apps/web apps/web
RUN npm run build --workspace @ride/web

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
