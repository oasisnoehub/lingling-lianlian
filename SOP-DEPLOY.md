# 应用 Docker 部署 SOP

## 概述

本 SOP 描述如何将 React + Express + SQLite 应用构建为 Docker 镜像并部署到远程服务器。

## 前置条件

- Docker Desktop 已安装
- SSH 访问远程服务器权限
- 域名已配置 DNS 指向服务器 IP

## 数据持久化架构

**重要**: 应用使用 Docker 卷实现数据持久化，Redeploy 时不会丢失数据。

| 数据类型 | Docker 卷 | 容器路径 | 说明 |
|---------|-----------|---------|------|
| 数据库 | `lingling-data` | `/app/data/posts.db` | SQLite 数据库文件 |
| 上传文件 | `lingling-uploads` | `/app/uploads/` | 用户上传的图片/视频 |

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

RUN mkdir -p /app/data /app/uploads

ENV NODE_ENV=production
ENV PORT=3456
ENV DATA_DIR=/app/data
ENV UPLOADS_DIR=/app/uploads

EXPOSE 3456

CMD ["node", "dist/server/index.js"]
```

### 2. docker-compose.yml (带 Traefik 标签和卷挂载)

```yaml
services:
  lingling-lianlian:
    image: lingling-lianlian:latest
    networks:
      - frappe_network
      - traefik_public
    volumes:
      - lingling-data:/app/data        # 数据库持久化
      - lingling-uploads:/app/uploads  # 上传文件持久化
    environment:
      - NODE_ENV=production
      - PORT=3456
      - DATA_DIR=/app/data
      - UPLOADS_DIR=/app/uploads
    restart: unless-stopped
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=traefik_public"
      - "traefik.http.routers.lingling.rule=Host(`linglian.oasisnoe.com.cn`)"
      - "traefik.http.routers.lingling.entrypoints=http,https"
      - "traefik.http.routers.lingling.tls=true"
      - "traefik.http.services.lingling.loadbalancer.server.port=3456"
      - "traefik.http.middlewares.lingling-redirect-https.redirectscheme.scheme=https"
      - "traefik.http.middlewares.lingling-redirect-https.redirectscheme.permanent=true"

networks:
  frappe_network:
    external: true
  traefik_public:
    external: true

volumes:
  lingling-data:      # 声明数据库卷
  lingling-uploads:   # 声明上传文件卷
```

### 3. server/db.ts 路径处理

```typescript
// 使用环境变量定义路径，支持 Docker 卷挂载
const DATA_DIR = process.env.DATA_DIR || '/app/data'
const UPLOADS_DIR = process.env.UPLOADS_DIR || '/app/uploads'

// 确保目录存在
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true })
}
if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true })
}

// 导出供 server/index.ts 使用
export { DATA_DIR, UPLOADS_DIR }
```

### 4. server/index.ts 路径处理

```typescript
import { UPLOADS_DIR } from './db.js'

// 编译后 __dirname 指向 dist/server，需要向上两级到 app
const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..', '..')
const uploadsDir = UPLOADS_DIR  // 使用环境变量，与 db.ts 保持一致
```

### 5. tsconfig.server.json (服务器端编译)

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

### 6. package.json 构建脚本

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.server.json && vite build"
  }
}
```

## 部署流程

### 本地构建

```bash
# 1. 本地构建 amd64 镜像
docker build -t lingling-lianlian:latest --platform linux/amd64 .

# 2. 导出为 tar 文件
docker save lingling-lianlian:latest -o lingling-lianlian.tar
gzip lingling-lianlian.tar

# 3. 传输到远程服务器
scp lingling-lianlian.tar.gz root@39.108.89.255:/root/
```

### 服务器部署

```bash
# 1. SSH 登录服务器
ssh root@39.108.89.255

# 2. 加载镜像
gunzip -c lingling-lianlian.tar.gz | docker load
# 或: docker load -i lingling-lianlian.tar.gz

# 3. 创建项目目录并复制 docker-compose.yml
mkdir -p /appdata/lingling_lianlian
cd /appdata/lingling_lianlian

# 4. 启动服务（保留现有卷，数据不丢失）
docker-compose down
docker-compose up -d

# 5. 检查日志
docker-compose logs --tail 20
```

### 验证部署

```bash
# 检查容器状态
docker ps | grep lingling-lianlian

# 检查卷是否存在（数据持久化验证）
docker volume ls | grep lingling

# 检查 Traefik 路由
curl -s http://localhost:8082/api/http/routers | grep lingling

# 测试访问
curl -I https://linglian.oasisnoe.com.cn

# 检查 API 是否正常
curl https://linglian.oasisnoe.com.cn/api/timeline
```

## 数据持久化验证

**Redeploy 时确保数据不丢失的关键**:

1. **不要删除卷**: `docker-compose down` 不会删除卷，只有 `docker-compose down -v` 才会删除
2. **确认卷已创建**: 首次部署后，`docker volume ls` 应显示 `lingling-data` 和 `lingling-uploads`
3. **检查卷内容**:
   ```bash
   docker volume inspect lingling_lianlian_lingling-data
   docker volume inspect lingling_lianlian_lingling-uploads
   ```

## 常见问题排查

### 1. 404 页面未找到
- 检查 Traefik 标签是否正确应用: `docker inspect CONTAINER --format='{{json .Config.Labels}}'`
- 检查 API 是否工作: `curl https://linglian.oasisnoe.com.cn/api/timeline`
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

### 5. Redeploy 后数据丢失
- 检查卷是否被删除: `docker volume ls`
- 确认 docker-compose.yml 中卷配置正确
- 使用 `docker volume inspect` 检查卷挂载路径

## 更新部署

```bash
# 本地重新构建
docker build -t lingling-lianlian:latest --platform linux/amd64 .
docker save lingling-lianlian:latest -o lingling-lianlian.tar
gzip lingling-lianlian.tar

# 传输到服务器
scp lingling-lianlian.tar.gz root@39.108.89.255:/root/

# 服务器端更新
ssh root@39.108.89.255
gunzip -c lingling-lianlian.tar.gz | docker load
cd /appdata/lingling_lianlian && docker-compose down && docker-compose up -d
```
