FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node src ./src
COPY --chown=node:node video-worker.js ./video-worker.js
COPY --chown=node:node video-container.js ./video-container.js
ENV NODE_ENV=production
USER node
EXPOSE 8080
CMD ["node", "video-container.js"]
