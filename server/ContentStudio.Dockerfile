FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
WORKDIR /app/admin
COPY admin/package.json admin/package-lock.json ./
RUN npm ci --omit=dev

WORKDIR /app
COPY --chown=node:node server/src ./server/src
COPY --chown=node:node server/content-worker.js ./server/content-worker.js
COPY --chown=node:node admin/src/content-studio ./admin/src/content-studio
RUN mkdir -p /app/.runtime/content-studio && chown -R node:node /app/.runtime
ENV NODE_ENV=production CONTENT_BROWSER_EXECUTABLE=/usr/bin/chromium CONTENT_RENDER_CONCURRENCY=2
USER node
WORKDIR /app/server
CMD ["node", "content-worker.js"]
