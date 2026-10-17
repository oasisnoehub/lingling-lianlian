# Ling Ling Lian Lian

两人时间线分享应用。Lingling 和 Lianlian 各自记录生活瞬间，发布到共享时间线中。

## 功能特点

- **密码保护**：每个人有独立的解锁密码，只有输入正确密码才能进入自己的时间线
- **共享时间线**：两个人的帖子会出现在同一条时间线上，按时间倒序排列
- **媒体支持**：支持发布图片和视频，带缩略图预览
- **位置标记**：支持将当前位置附加到帖子上（需要配置高德地图 API Key）
- **情绪标签**：发布时可选择当前情绪状态
- **实时更新**：时间线每 15 秒自动刷新，切换到其他标签页后也会立即刷新
- **自动备份**：每日自动备份数据库和上传文件到独立卷

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Vite |
| 后端 | Express + better-sqlite3 |
| 部署 | Docker + Traefik |
| 样式 | CSS（暗色玻璃拟态主题）|

## 项目结构

```
lingling-lianlian/
├── src/                    # React 前端
│   ├── pages/            # HomePage, TimelinePage
│   ├── components/       # Timeline, PostInput, MediaPreview, Toaster, Footer
│   ├── api/client.ts    # API 客户端
│   └── types/index.ts    # TypeScript 类型定义
├── server/               # Express 后端
│   ├── index.ts         # 服务器入口
│   ├── db.ts            # SQLite 数据库封装
│   ├── auth.ts          # JWT 认证
│   ├── backup.ts        # 自动备份
│   └── routes/          # API 路由
│       ├── auth.ts      # 登录/登出
│       ├── posts.ts     # 帖子 CRUD
│       ├── persons.ts   # 用户信息
│       ├── upload.ts    # 文件上传
│       └── location.ts  # 地理位置
├── dist/                 # 构建产物
├── Dockerfile            # 多阶段 Docker 构建
├── docker-compose.yml    # Docker Compose 配置
└── SOP-DEPLOY.md        # 详细部署文档
```

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev          # 前端 (Vite, port 5173)
npm run server       # 后端 (tsx watch, port 3456)

# 类型检查
npm run typecheck

# 生产构建
npm run build
```

首次运行需要创建 `.env` 文件：

```bash
cp .env.example .env
# 编辑 .env，填写必要的配置
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `PORT` | 否 | 服务端口，默认 3456 |
| `DATA_DIR` | 否 | 数据库目录，默认 ./data |
| `UPLOADS_DIR` | 否 | 上传文件目录，默认 ./uploads |
| `CORS_ORIGIN` | 是 | 允许的浏览器来源，如 https://example.com |
| `AUTH_SECRET` | 是 | JWT 签名密钥 |
| `AMAP_KEY` | 否 | 高德地图 Web 服务 Key，用于 GPS 转中文地址 |
| `BACKUP_ENABLED` | 否 | 是否启用自动备份，默认 true |
| `BACKUP_KEEP_DAYS` | 否 | 数据库备份保留天数，默认 30 |
| `BACKUP_UPLOADS_KEEP_DAYS` | 否 | 媒体备份保留天数，默认 7 |

## 数据持久化

| 数据 | Docker 卷 | 说明 |
|------|----------|------|
| 数据库 | `lingling-data` | SQLite 数据库文件 |
| 上传文件 | `lingling-uploads` | 图片和视频 |
| 备份 | `lingling-backups` | 每日自动备份 |

**重要**：`docker-compose down` 不会删除卷，只有 `docker-compose down -v` 才会删除。

## License

Private - All rights reserved
