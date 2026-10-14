# 应用 Docker 部署 SOP

## 概述

本 SOP 描述如何将 React + Express + SQLite 应用构建为 Docker 镜像并部署到远程服务器。

## 前置条件

- Docker Desktop 已安装
- SSH 访问远程服务器权限
- 域名已配置 DNS 指向服务器 IP

## 项目结构要求

### 1. Dockerfile (多阶段构建)

```dockerfile
# Stage 1: Build frontend
FROM node:20-alpine AS builder

WORKDIR /app
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories && \
    apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm config set registry https://registry.npmmirror.com && npm ci

COPY . .
RUN npm run build

# Stage 2: Build server (separate to avoid vite overwriting)
FROM node:20-alpine AS server-builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm config set registry https://registry.npmmirror.com && npm ci

COPY server ./server
COPY tsconfig.server.json ./
RUN npx tsc -p tsconfig.server.json

# Stage 3: Production
FROM node:20-alpine

WORKDIR /app
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories && \
    apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm config set registry https://registry.npmmirror.com && npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=server-builder /app/dist/server ./dist/server
COPY --from=builder /app/uploads ./uploads

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3456
ENV DATA_DIR=/app/data

EXPOSE 3456

CMD ["node", "dist/server/index.js"]
```

### 2. docker-compose.yml (带 Traefik 标签)

```yaml
services:
  app-name:
    image: app-name:latest
    networks:
      - frappe_network
      - traefik_public
    volumes:
      - app-data:/app/data
    environment:
      - NODE_ENV=production
      - PORT=3456
      - DATA_DIR=/app/data
    restart: unless-stopped
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=traefik_public"
      - "traefik.http.routers.app.rule=Host(`yourdomain.com`)"
      - "traefik.http.routers.app.entrypoints=http,https"
      - "traefik.http.routers.app.tls=true"
      - "traefik.http.services.app.loadbalancer.server.port=3456"

networks:
  frappe_network:
    external: true
  traefik_public:
    external: true

volumes:
  app-data:
```

### 3. tsconfig.server.json (服务器端编译)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist/server",
    "rootDir": "server",
    "declaration": false,
    "noEmit": false
  },
  "include": ["server/**/*"]
}
```

### 4. package.json 构建脚本

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.server.json && vite build"
  }
}
```

### 5. 服务器路径处理 (server/index.ts)

```typescript
// 重要: 编译后 __dirname 指向 dist/server，需要向上两级到 app
const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..', '..')  // 指向 /app
```

## 部署流程

### 本地构建

```bash
# 1. 本地构建 amd64 镜像
docker build --platform linux/amd64 -t app-name:amd64 .

# 2. 导出为 tar 文件
docker save app-name:amd64 -o /tmp/app-name.tar

# 3. 传输到远程服务器
scp -i ~/.ssh/id_rsa /tmp/app-name.tar root@SERVER_IP:/tmp/
```

### 服务器部署

```bash
# 1. SSH 登录服务器
ssh -i ~/.ssh/id_rsa root@SERVER_IP

# 2. 加载镜像
docker load -i /tmp/app-name.tar
docker tag app-name:amd64 app-name:latest

# 3. 创建项目目录并复制 docker-compose.yml
mkdir -p /root/app-name
# 编辑 docker-compose.yml 内容

# 4. 启动服务
cd /root/app-name
docker-compose down 2>/dev/null
docker-compose up -d

# 5. 检查日志
docker-compose logs --tail 20
```

### 验证部署

```bash
# 检查容器状态
docker ps | grep app-name

# 检查 Traefik 路由
curl -s http://localhost:8082/api/http/routers | grep app-name

# 测试访问
curl -I https://yourdomain.com
```

## 常见问题排查

### 1. 404 页面未找到
- 检查 Traefik 标签是否正确应用: `docker inspect CONTAINER --format='{{json .Config.Labels}}'`
- 检查 API 是否工作: `curl https://yourdomain.com/api/timeline`
- 检查静态文件路径: `docker exec CONTAINER ls -la /app/dist/`

### 2. 容器无法启动
- 检查日志: `docker logs CONTAINER`
- 检查路径问题: 编译后 `rootDir` 计算是否正确

### 3. 镜像平台不匹配
- 本地 M1/M2 Mac 构建时使用: `--platform linux/amd64`
- 验证架构: `docker inspect IMAGE --format='{{.Architecture}}'`

### 4. 服务器无法拉取 Docker Hub 镜像
- 配置镜像加速: 在 `/etc/docker/daemon.json` 添加
- `"registry-mirrors": ["https://registry.npmmirror.com"]`
- 重启 Docker: `systemctl restart docker`

## 更新部署

```bash
# 本地重新构建
docker build --platform linux/amd64 -t app-name:amd64 .
docker save app-name:amd64 -o /tmp/app-name.tar
scp -i ~/.ssh/id_rsa /tmp/app-name.tar root@SERVER_IP:/tmp/

# 服务器端更新
ssh -i ~/.ssh/id_rsa root@SERVER_IP
docker stop app-name-app-name-1
docker rm app-name-app-name-1
docker rmi app-name:latest
docker load -i /tmp/app-name.tar
docker tag app-name:amd64 app-name:latest
cd /root/app-name && docker-compose up -d
```
