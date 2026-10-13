# Stage 1: Build
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

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Use Aliyun mirror for Alpine packages
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories && \
    apk add --no-cache python3 make g++

# Use npmmirror for npm
COPY package.json package-lock.json ./
RUN npm config set registry https://registry.npmmirror.com && \
    npm ci --omit=dev

# Copy built server and client from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/uploads ./uploads

# Create data directory for SQLite database
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3456
ENV DATA_DIR=/app/data

EXPOSE 3456

CMD ["node", "server/index.js"]
