# syntax=docker/dockerfile:1

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_API_BASE=http://api.10.20.0.100.sslip.io
ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Final stage: standalone Next.js server, run as non-root numeric UID
# (required by Kubernetes restricted PSA — no root, no privilege escalation).
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 10001 portal && adduser -D -u 10001 -G portal portal

COPY --from=builder --chown=10001:10001 /app/public ./public
COPY --from=builder --chown=10001:10001 /app/.next/standalone ./
COPY --from=builder --chown=10001:10001 /app/.next/static ./.next/static

USER 10001
EXPOSE 3000

CMD ["node", "server.js"]
