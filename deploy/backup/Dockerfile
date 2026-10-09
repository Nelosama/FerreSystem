FROM node:24-trixie-slim AS node
FROM postgres:18-trixie
RUN apt-get update && apt-get install -y --no-install-recommends restic ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /worker
COPY backend/scripts/backup-worker.mjs backend/scripts/backup-verify-isolated.mjs ./
USER postgres
ENTRYPOINT ["node", "backup-worker.mjs"]
