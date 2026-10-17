FROM node:24-bookworm-slim AS build
ENV PUPPETEER_SKIP_DOWNLOAD=true
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY scripts/patch-whatsapp.mjs scripts/patch-whatsapp.mjs
RUN npm ci
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN npm run build -w @wapp/api && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/data \
    CHROME_EXECUTABLE_PATH=/usr/local/bin/wapp-chrome CHROME_NO_SANDBOX=true \
    PUPPETEER_SKIP_DOWNLOAD=true HOME=/tmp
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates fonts-liberation ffmpeg curl \
    && if [ "$(dpkg --print-architecture)" = "amd64" ]; then \
         curl -fsSL https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -o /tmp/chrome.deb \
         && apt-get install -y --no-install-recommends /tmp/chrome.deb \
         && ln -s /usr/bin/google-chrome /usr/local/bin/wapp-chrome && rm /tmp/chrome.deb; \
       else \
         apt-get install -y --no-install-recommends chromium \
         && ln -s /usr/bin/chromium /usr/local/bin/wapp-chrome; \
       fi \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/contracts ./packages/contracts
COPY docs/integration.md ./docs/integration.md
RUN mkdir -p /app/data && chown node:node /app/data
USER node
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/server.js"]
