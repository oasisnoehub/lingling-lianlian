import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import db, { DATA_DIR, UPLOADS_DIR } from './db.js'

/*
 * Nightly backup of the timeline database and uploaded media.
 *
 * Backups deliberately land in BACKUP_DIR, which is a *separate* volume from
 * DATA_DIR. A backup stored inside the volume it protects is worthless if
 * that volume is what gets lost.
 */

// Defaults to a sibling of the data directory: /app/backups in the image, and
// never inside DATA_DIR itself.
const BACKUP_DIR = process.env.BACKUP_DIR || join(DATA_DIR, '..', 'backups')
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS || 30)
const UPLOADS_KEEP_DAYS = Number(process.env.BACKUP_UPLOADS_KEEP_DAYS || 7)
const INTERVAL_MS = Number(process.env.BACKUP_INTERVAL_MS || 24 * 60 * 60 * 1000)
const ENABLED = process.env.BACKUP_ENABLED !== 'false'

function stamp(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    now.getFullYear() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    '-' +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  )
}

async function pruneDir(dir: string, prefix: string, keepDays: number): Promise<void> {
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return
  }

  for (const entry of entries) {
    if (!entry.startsWith(prefix)) continue
    const full = join(dir, entry)
    try {
      const info = await stat(full)
      if (info.mtimeMs < cutoff) await rm(full, { recursive: true, force: true })
    } catch {
      /* already gone */
    }
  }
}

export async function runBackup(): Promise<void> {
  if (!ENABLED) return

  await mkdir(BACKUP_DIR, { recursive: true })

  // better-sqlite3 exposes SQLite's online backup API, which is safe to run
  // against a live WAL database -- unlike copying the .db file directly.
  const dbTarget = join(BACKUP_DIR, `posts-${stamp()}.db`)
  await db.backup(dbTarget)
  console.log('backup: database ->', dbTarget)

  // Photos and videos. A missing or empty uploads dir is not a failure.
  try {
    const mediaTarget = join(BACKUP_DIR, `uploads-${stamp()}`)
    await cp(UPLOADS_DIR, mediaTarget, { recursive: true })
    console.log('backup: uploads ->', mediaTarget)
  } catch (err) {
    console.warn('backup: uploads skipped:', (err as Error).message)
  }

  await pruneDir(BACKUP_DIR, 'posts-', KEEP_DAYS)
  await pruneDir(BACKUP_DIR, 'uploads-', UPLOADS_KEEP_DAYS)
}

let timer: NodeJS.Timeout | undefined

export function startBackupSchedule(): void {
  if (!ENABLED || timer) return

  // Fire once shortly after boot so every redeploy produces a fresh copy,
  // then settle into a daily cadence.
  const initialDelay = Number(process.env.BACKUP_INITIAL_DELAY_MS || 10_000)

  setTimeout(() => {
    void runBackup().catch(err => console.error('backup failed:', err))
  }, initialDelay).unref()

  timer = setInterval(() => {
    void runBackup().catch(err => console.error('backup failed:', err))
  }, INTERVAL_MS)
  timer.unref()
}

export function stopBackupSchedule(): void {
  if (timer) {
    clearInterval(timer)
    timer = undefined
  }
}

export { BACKUP_DIR }
