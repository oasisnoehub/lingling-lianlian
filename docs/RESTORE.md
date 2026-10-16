# 从备份恢复

前置：已经跑过至少一次自动备份（服务启动约 10 秒后会在 `/app/backups` 生成第一份，
可用 `ls /app/backups` 确认）。

```bash
# 1. 停服，避免继续写入
docker compose stop lingling-lianlian

# 2. 看看有哪些备份
docker compose run --rm --entrypoint ls lingling-lianlian -la /app/backups
```

下面假设要恢复 `20261016-040700` 这一份，请换成实际的时间戳。

```bash
# 3. 恢复数据库
#    WAL 库不能直接 cp，所以顺便删掉旧的 -wal / -shm，避免残留写入被重放
docker compose run --rm --entrypoint sh lingling-lianlian -c \
  'cp /app/backups/posts-20261016-040700.db /app/data/posts.db &&
   rm -f /app/data/posts.db-wal /app/data/posts.db-shm'

# 4. 恢复媒体
docker compose run --rm --entrypoint sh lingling-lianlian -c \
  'rm -rf /app/uploads/* &&
   cp -r /app/backups/uploads-20261016-040700/. /app/uploads/'

# 5. 起服
docker compose start lingling-lianlian
```

## 只想要数据库、照片不动

跳过第 4 步即可。数据库和媒体是互相独立的备份，单独恢复其中一份是安全的。

## 恢复后检查

- `docker compose logs -f` 看启动日志有没有报错
- 打开站点，随便发一条动态
- 确认照片能正常显示（如果只恢复了数据库，图会是裂图，但文字都在）
