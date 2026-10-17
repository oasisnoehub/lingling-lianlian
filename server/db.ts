import Database from 'better-sqlite3'
import { basename, join } from 'path'
import { mkdirSync, existsSync, unlinkSync } from 'fs'
import { createHash } from 'node:crypto'

// In production: DATA_DIR=/app/data, UPLOADS_DIR=/app/uploads
// Both are mounted as Docker volumes
const DATA_DIR = process.env.DATA_DIR || '/app/data'
const UPLOADS_DIR = process.env.UPLOADS_DIR || '/app/uploads'

// Ensure directories exist
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true })
}
if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true })
}

const dbPath = join(DATA_DIR, 'posts.db')
const db = new Database(dbPath)

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL')

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS persons (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar_color TEXT NOT NULL,
    avatar_url TEXT,
    avatar_updated_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    author_id TEXT NOT NULL,
    content TEXT NOT NULL,
    emotion TEXT,
    media TEXT NOT NULL DEFAULT '[]',
    location TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER,
    FOREIGN KEY (author_id) REFERENCES persons(id)
  );

  CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
  CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
`)

// Add location column if it doesn't exist (for existing databases)
try {
  db.exec('ALTER TABLE posts ADD COLUMN location TEXT')
} catch (e) {
  // Column already exists, ignore
}

// Add emotion column if it doesn't exist (for existing databases)
try {
  db.exec('ALTER TABLE posts ADD COLUMN emotion TEXT')
} catch (e) {
  // Column already exists, ignore
}

// Add avatar_url and avatar_updated_at columns if they don't exist (for existing databases)
try {
  db.exec('ALTER TABLE persons ADD COLUMN avatar_url TEXT')
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec('ALTER TABLE persons ADD COLUMN avatar_updated_at INTEGER')
} catch (e) {
  // Column already exists, ignore
}

// Seed default persons if not exist
const existingPersons = db.prepare('SELECT COUNT(*) as count FROM persons').get() as { count: number }
if (existingPersons.count === 0) {
  const insertPerson = db.prepare('INSERT INTO persons (id, name, avatar_color, created_at) VALUES (?, ?, ?, ?)')
  insertPerson.run('person-a', 'Ling Ling', '#4f8ef7', Date.now())
  insertPerson.run('person-b', 'Lian Lian', '#B8D4E8', Date.now())
}

// Types
export interface Person {
  id: string
  name: string
  avatar_color: string
  avatar_url?: string
  avatar_updated_at?: number
  created_at: number
}

export interface MediaItem {
  id: string
  type: 'image' | 'video'
  url: string
  thumbnail_url?: string
  width?: number
  height?: number
}

export interface PostLocation {
  address: string
  name?: string
  latitude: number
  longitude: number
}

export interface Post {
  id: string
  author_id: string
  content: string
  emotion?: string
  media: MediaItem[]
  location?: PostLocation
  created_at: number
  updated_at?: number
}

export interface PostWithAuthor extends Post {
  author: Person
}

// Export paths for use in index.ts
export { DATA_DIR, UPLOADS_DIR }

// Queries
export function getAllPersons(): Person[] {
  return db.prepare('SELECT * FROM persons ORDER BY created_at ASC').all() as Person[]
}

export function getPersonById(id: string): Person | undefined {
  return db.prepare('SELECT * FROM persons WHERE id = ?').get(id) as Person | undefined
}

export function getTimeline(): PostWithAuthor[] {
  const posts = db.prepare(`
    SELECT p.*, json_object(
      'id', pr.id,
      'name', pr.name,
      'avatar_color', pr.avatar_color,
      'avatar_url', pr.avatar_url,
      'avatar_updated_at', pr.avatar_updated_at,
      'created_at', pr.created_at
    ) as author_json
    FROM posts p
    JOIN persons pr ON p.author_id = pr.id
    ORDER BY p.created_at DESC
  `).all() as Array<{
    id: string
    author_id: string
    content: string
    media: string
    location: string | null
    created_at: number
    updated_at?: number
    author_json: string
  }>

  return posts.map(post => ({
    id: post.id,
    author_id: post.author_id,
    content: post.content,
    emotion: (post as any).emotion || undefined,
    media: JSON.parse(post.media) as MediaItem[],
    location: post.location ? JSON.parse(post.location) as PostLocation : undefined,
    created_at: post.created_at,
    updated_at: post.updated_at,
    author: JSON.parse(post.author_json) as Person,
  }))
}

export function getPostAuthorId(id: string): string | undefined {
  const row = db.prepare('SELECT author_id FROM posts WHERE id = ?').get(id) as
    | { author_id: string }
    | undefined
  return row?.author_id
}

/**
 * Cheap fingerprint of the whole timeline, used to answer conditional polls
 * with 304. COUNT + MAX + SUM changes whenever a post is added, edited or
 * removed, so a client that polls can skip re-sending the entire timeline.
 */
export function getTimelineETag(): string {
  const row = db.prepare(`
    SELECT COUNT(*) AS count,
           MAX(COALESCE(updated_at, created_at)) AS latest,
           SUM(COALESCE(updated_at, created_at)) AS checksum
    FROM posts
  `).get() as { count: number; latest: number | null; checksum: number | null }

  const fingerprint = [row.count, row.latest ?? 0, row.checksum ?? 0].join(':')
  return '"' + createHash('sha1').update(fingerprint).digest('base64url').slice(0, 22) + '"'
}
/**
 * Removes a post's media files from disk. Only basenames are used so a
 * crafted media URL can never escape the uploads directory. Failures are
 * logged rather than thrown: the post itself is already gone, and an
 * orphaned file is recoverable while a failed request is not.
 */
function removeMediaFiles(media: MediaItem[]): void {
  for (const item of media) {
    const filename = basename(item.url)
    if (!filename || filename === item.url) continue
    try {
      unlinkSync(join(UPLOADS_DIR, filename))
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        console.error('Failed to delete media file', filename, err)
      }
    }
  }
}

export function createPost(
  authorId: string,
  content: string,
  emotion: string | undefined,
  media: MediaItem[] = [],
  location?: PostLocation | null
): Post {
  const now = Date.now()
  const id = `post-${now}-${Math.random().toString(36).slice(2, 8)}`

  db.prepare(`
    INSERT INTO posts (id, author_id, content, emotion, media, location, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, authorId, content, emotion || null, JSON.stringify(media), location ? JSON.stringify(location) : null, now)

  return {
    id,
    author_id: authorId,
    content,
    emotion,
    media,
    location: location || undefined,
    created_at: now,
  }
}

export function updatePost(
  id: string,
  content: string,
  emotion?: string,
  media?: MediaItem[],
  location?: PostLocation | null
): Post | undefined {
  const existing = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as {
    id: string
    author_id: string
    content: string
    emotion?: string | null
    media: string
    location: string | null
    created_at: number
  } | undefined

  if (!existing) return undefined

  const updatedAt = Date.now()
  const updates: string[] = ['content = ?', 'updated_at = ?']
  const values: (string | number | null)[] = [content, updatedAt]

  if (emotion !== undefined) {
    updates.push('emotion = ?')
    values.push(emotion || null)
  }

  if (media !== undefined) {
    updates.push('media = ?')
    values.push(JSON.stringify(media))
  }

  if (location !== undefined) {
    updates.push('location = ?')
    values.push(location ? JSON.stringify(location) : null)
  }

  values.push(id)

  db.prepare(`UPDATE posts SET ${updates.join(', ')} WHERE id = ?`).run(...values)

  // Drop files for media the user removed while editing.
  if (media !== undefined) {
    const kept = new Set(media.map(item => basename(item.url)))
    const removed = (JSON.parse(existing.media) as MediaItem[])
      .filter(item => !kept.has(basename(item.url)))
    if (removed.length > 0) removeMediaFiles(removed)
  }

  return {
    id,
    author_id: existing.author_id,
    content,
    emotion: emotion !== undefined ? emotion : (existing.emotion ?? undefined),
    media: media !== undefined ? media : JSON.parse(existing.media),
    location: location !== undefined
      ? location || undefined
      : existing.location ? JSON.parse(existing.location) as PostLocation : undefined,
    created_at: existing.created_at,
    updated_at: updatedAt,
  }
}

export function deletePost(id: string): boolean {
  const existing = db.prepare('SELECT media FROM posts WHERE id = ?').get(id) as
    | { media: string }
    | undefined
  if (!existing) return false

  const result = db.prepare('DELETE FROM posts WHERE id = ?').run(id)
  if (result.changes === 0) return false

  try {
    removeMediaFiles(JSON.parse(existing.media) as MediaItem[])
  } catch (err) {
    console.error('Failed to parse media while deleting post', id, err)
  }

  return true
}

export function updatePersonAvatar(personId: string, avatarUrl: string, updatedAt: number): boolean {
  const result = db.prepare('UPDATE persons SET avatar_url = ?, avatar_updated_at = ? WHERE id = ?').run(avatarUrl, updatedAt, personId)
  return result.changes > 0
}

/**
 * Checkpoint the WAL and close the handle. Safe to call once, at shutdown:
 * without it a SIGTERM leaves -wal/-shm files behind for the next start.
 */
let closed = false
export function closeDatabase(): void {
  if (closed) return
  closed = true
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
    db.close()
  } catch (err) {
    console.error('Error closing database:', err)
  }
}

export default db
