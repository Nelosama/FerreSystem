# syntax=docker/dockerfile:1
FROM node:24-trixie-slim
WORKDIR /app/backend
RUN --mount=type=secret,id=proxy_ca \
    apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca update && \
    apt-get install -y --no-install-recommends postgresql-client ca-certificates openssl && \
    rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --strict-ssl=true
COPY backend/prisma ./prisma
COPY backend/src ./src
COPY backend/scripts ./scripts
COPY backend/tsconfig*.json backend/nest-cli.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npx prisma generate && npm run build && npm prune --omit=dev
RUN chmod -R a+rX /app/backend/scripts /app/backend/prisma /app/backend/node_modules/.prisma && \
    chmod a+r /app/backend/package.json /app/backend/package-lock.json
ENV NODE_ENV=production
ENTRYPOINT ["node", "scripts/container-entry.mjs"]
CMD ["npm", "run", "start:prod"]
