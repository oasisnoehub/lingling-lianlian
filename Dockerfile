# Stage 1: Build frontend
FROM node:20-alpine AS builder

WORKDIR /app

# Use Aliyun mirror for Alpine packages
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories && \
    apk add --no-cache python3 make g++

# Use npmmirror for npm
COPY package.json package-lock.json ./
RUN npm config set registry https://registry.npmmirror.com && \
    npm ci

COPY . .
RUN npm run build

# Stage 2: Build server (separate to avoid vite overwriting)
FROM node:20-alpine AS server-builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm config set registry https://registry.npmmirror.com && \
    npm ci

COPY server ./server
COPY tsconfig.server.json ./
RUN npx tsc -p tsconfig.server.json

# Stage 3: Production
FROM node:20-alpine

WORKDIR /app

# Use Aliyun mirror for Alpine packages
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories && \
    apk add --no-cache python3 make g++

# Use npmmirror for npm
COPY package.json package-lock.json ./
RUN npm config set registry https://registry.npmmirror.com && \
    npm ci --omit=dev

# Copy built frontend from builder
COPY --from=builder /app/dist ./dist

# Copy compiled server from server-builder
COPY --from=server-builder /app/dist/server ./dist/server

# Create runtime directories (all three are backed by Docker volumes)
RUN mkdir -p /app/data /app/uploads /app/backups

ENV NODE_ENV=production
ENV PORT=3456
ENV DATA_DIR=/app/data
ENV UPLOADS_DIR=/app/uploads
ENV BACKUP_DIR=/app/backups
ENV BACKUP_KEEP_DAYS=30
ENV BACKUP_UPLOADS_KEEP_DAYS=7

EXPOSE 3456

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/health" || exit 1

CMD ["node", "dist/server/index.js"]
