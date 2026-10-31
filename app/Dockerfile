# syntax=docker/dockerfile:1
# Pulsezen production image.
#   docker build -t pulsezen .
#   docker run -p 3000:3000 -v pulsezen-storage:/app/storage pulsezen

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN addgroup -S pulsezen && adduser -S pulsezen -G pulsezen
COPY --from=build --chown=pulsezen:pulsezen /app/.next ./.next
COPY --from=build --chown=pulsezen:pulsezen /app/node_modules ./node_modules
COPY --from=build --chown=pulsezen:pulsezen /app/public ./public
COPY --from=build --chown=pulsezen:pulsezen /app/scripts ./scripts
COPY --from=build --chown=pulsezen:pulsezen /app/package.json /app/server.js /app/next.config.ts ./
RUN mkdir -p storage && chown pulsezen:pulsezen storage
USER pulsezen
VOLUME ["/app/storage"]
EXPOSE 3000
CMD ["node", "server.js"]
