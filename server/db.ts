import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, '..', 'data')
mkdirSync(dataDir, { recursive: true })

const db = new Database(join(dataDir, 'posts.db'))

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
    media TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    updated_at INTEGER,
    FOREIGN KEY (author_id) REFERENCES persons(id)
  );

  CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
  CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
`)

// Seed default persons if not exist
const existingPersons = db.prepare('SELECT COUNT(*) as count FROM persons').get() as { count: number }
if (existingPersons.count === 0) {
  const insertPerson = db.prepare('INSERT INTO persons (id, name, avatar_color, created_at) VALUES (?, ?, ?, ?)')
  insertPerson.run('person-a', 'Ling Ling', '#4f8ef7', Date.now())
  insertPerson.run('person-b', 'Lian Lian', '#a855f7', Date.now())
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
  media: MediaItem[]
  created_at: number
  updated_at?: number
}

export interface PostWithAuthor extends Post {
  author: Person
}

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
    media: JSON.parse(post.media) as MediaItem[],
    created_at: post.created_at,
    updated_at: post.updated_at,
    author: JSON.parse(post.author_json) as Person,
  }))
}

export function createPost(authorId: string, content: string, media: MediaItem[] = []): Post {
  const id = `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const now = Date.now()

  db.prepare(`
    INSERT INTO posts (id, author_id, content, media, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, authorId, content, JSON.stringify(media), now)

  return {
    id,
    author_id: authorId,
    content,
    media,
    created_at: now,
  }
}

export function updatePost(id: string, content: string, media?: MediaItem[]): Post | undefined {
  const existing = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as {
    id: string
    author_id: string
    content: string
    media: string
    created_at: number
  } | undefined

  if (!existing) return undefined

  const updates: string[] = ['content = ?', 'updated_at = ?']
  const values: (string | number)[] = [content, Date.now()]

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
