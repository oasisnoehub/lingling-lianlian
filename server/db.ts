import Database from 'better-sqlite3'
import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'

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
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    author_id TEXT NOT NULL,
    content TEXT NOT NULL,
    emotion TEXT,
    media TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    updated_at INTEGER,
    FOREIGN KEY (author_id) REFERENCES persons(id)
  );

  CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
  CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
`)

// Add emotion column if it doesn't exist (for existing databases)
try {
  db.exec('ALTER TABLE posts ADD COLUMN emotion TEXT')
} catch (e) {
  // Column already exists, ignore
}

// Seed default persons if not exist
const existingPersons = db.prepare('SELECT COUNT(*) as count FROM persons').get() as { count: number }
if (existingPersons.count === 0) {
  const insertPerson = db.prepare('INSERT INTO persons (id, name, avatar_color, created_at) VALUES (?, ?, ?, ?)')
  insertPerson.run('person-a', 'Ling Ling', '#4f8ef7', Date.now())
  insertPerson.run('person-b', 'Lian Lian', '#60A5FA', Date.now())
}

// Types
export interface Person {
  id: string
  name: string
  avatar_color: string
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

export interface Post {
  id: string
  author_id: string
  content: string
  emotion?: string
  media: MediaItem[]
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
    created_at: post.created_at,
    updated_at: post.updated_at,
    author: JSON.parse(post.author_json) as Person,
  }))
}

export function createPost(authorId: string, content: string, emotion: string | undefined, media: MediaItem[] = []): Post {
  const id = `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const now = Date.now()

  db.prepare(`
    INSERT INTO posts (id, author_id, content, emotion, media, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, authorId, content, emotion || null, JSON.stringify(media), now)

  return {
    id,
    author_id: authorId,
    content,
    emotion,
    media,
    created_at: now,
  }
}

export function updatePost(
  id: string,
  content: string,
  emotion?: string,
  media?: MediaItem[]
): Post | undefined {
  const existing = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as {
    id: string
    author_id: string
    content: string
    emotion?: string
    media: string
    created_at: number
  } | undefined

  if (!existing) return undefined

  const updates: string[] = ['content = ?', 'updated_at = ?']
  const values: (string | number | null)[] = [content, Date.now()]

  if (emotion !== undefined) {
    updates.push('emotion = ?')
    values.push(emotion || null)
  }

  if (media !== undefined) {
    updates.push('media = ?')
    values.push(JSON.stringify(media))
  }

  values.push(id)

  db.prepare(`UPDATE posts SET ${updates.join(', ')} WHERE id = ?`).run(...values)

  return {
    id,
    author_id: existing.author_id,
    content,
    emotion: emotion !== undefined ? emotion : existing.emotion,
    media: media !== undefined ? media : JSON.parse(existing.media),
    created_at: existing.created_at,
    updated_at: Date.now(),
  }
}

export function deletePost(id: string): boolean {
  const result = db.prepare('DELETE FROM posts WHERE id = ?').run(id)
  return result.changes > 0
}

export default db
