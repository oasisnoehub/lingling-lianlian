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
COPY --from=builder /app/uploads ./uploads

# Create data directory for SQLite database
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3456
ENV DATA_DIR=/app/data

EXPOSE 3456

CMD ["node", "dist/server/index.js"]
