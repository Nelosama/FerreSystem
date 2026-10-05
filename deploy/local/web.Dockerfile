# syntax=docker/dockerfile:1
FROM node:24-trixie-slim AS build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --strict-ssl=true
COPY frontend/index.html frontend/vite.config.ts frontend/tsconfig*.json ./
COPY frontend/src ./src
COPY frontend/public ./public
ENV VITE_API_URL=/api
RUN npm run build
FROM caddy:2
COPY --from=build /app/frontend/dist /srv
COPY deploy/local/Caddyfile /etc/caddy/Caddyfile
