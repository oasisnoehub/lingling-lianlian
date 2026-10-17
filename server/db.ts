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

// Without this, SQLite parses but never enforces the FOREIGN KEY clauses --
// so `ON DELETE CASCADE` on reactions would silently do nothing.
db.pragma('foreign_keys = ON')

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

  CREATE TABLE IF NOT EXISTS reactions (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    person_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (person_id) REFERENCES persons(id),
    UNIQUE(post_id, person_id)
  );

  CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
  CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_reactions_post ON reactions(post_id);
  CREATE INDEX IF NOT EXISTS idx_reactions_person ON reactions(person_id);
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

// Add reactions table if it doesn't exist (for existing databases)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reactions (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY (person_id) REFERENCES persons(id),
      UNIQUE(post_id, person_id)
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_reactions_post ON reactions(post_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_reactions_person ON reactions(person_id)')
} catch (e) {
  // Table already exists, ignore
}

// Seed default persons if not exist
const existingPersons = db.prepare('SELECT COUNT(*) as count FROM persons').get() as { count: number }
if (existingPersons.count === 0) {
  const insertPerson = db.prepare('INSERT INTO persons (id, name, avatar_color, created_at) VALUES (?, ?, ?, ?)')
  insertPerson.run('person-a', 'Lingling', '#4f8ef7', Date.now())
  insertPerson.run('person-b', 'Lianlian', '#B8D4E8', Date.now())
}

/**
 * Canonical display names, keyed by the unchanged person ids.
 *
 * `persons.name` is the single source of truth for every user-visible name:
 * the timeline builds each post's author with a SQL JOIN rather than a stored
 * copy, so correcting these two rows updates names everywhere at once.
 */
const CANONICAL_NAMES: Record<string, string> = {
  'person-a': 'Lingling',
  'person-b': 'Lianlian',
}

/*
 * Bring databases created before the rename in line. This runs on every start:
 * it only writes when the stored name actually differs, so it is idempotent,
 * and it touches the name column alone -- no row is inserted or deleted, ids are
 * never reassigned, and posts, avatars, media and reactions are left untouched.
 */
for (const [id, name] of Object.entries(CANONICAL_NAMES)) {
  db.prepare('UPDATE persons SET name = ? WHERE id = ? AND name IS NOT ?').run(name, id, name)
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

export interface Reaction {
  id: string
  post_id: string
  person_id: string
  emoji: string
  created_at: number
  updated_at?: number
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

  // Reactions are removed explicitly as well as by ON DELETE CASCADE, so a
  // deleted post never leaves rows behind for the other person's timeline.
  const remove = db.transaction(() => {
    db.prepare('DELETE FROM reactions WHERE post_id = ?').run(id)
    return db.prepare('DELETE FROM posts WHERE id = ?').run(id)
  })

  const result = remove()
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
 * Get all reactions for a post
 */
export function getReactionsByPostId(postId: string): Reaction[] {
  return db.prepare('SELECT * FROM reactions WHERE post_id = ? ORDER BY created_at ASC').all(postId) as Reaction[]
}

/**
 * Get all reactions for multiple posts, grouped by post_id
 */
export function getReactionsByPostIds(postIds: string[]): Record<string, Reaction[]> {
  if (postIds.length === 0) return {}
  
  const placeholders = postIds.map(() => '?').join(',')
  const rows = db.prepare(`
    SELECT * FROM reactions 
    WHERE post_id IN (${placeholders})
    ORDER BY post_id, created_at ASC
  `).all(...postIds) as Array<Reaction & { post_id: string }>
  
  const grouped: Record<string, Reaction[]> = {}
  for (const row of rows) {
    const postId = row.post_id
    if (!grouped[postId]) {
      grouped[postId] = []
    }
    grouped[postId].push({
      id: row.id,
      post_id: row.post_id,
      person_id: row.person_id,
      emoji: row.emoji,
      created_at: row.created_at,
      updated_at: row.updated_at,
    })
  }
  
  return grouped
}

/**
 * Upsert a reaction (create or update)
 * Returns the reaction with its id
 */
export function upsertReaction(
  postId: string,
  personId: string,
  emoji: string
): Reaction {
  const now = Date.now()
  const id = `reaction-${now}-${Math.random().toString(36).slice(2, 8)}`
  
  // Check if reaction exists
  const existing = db.prepare('SELECT * FROM reactions WHERE post_id = ? AND person_id = ?').get(postId, personId) as Reaction | undefined
  
  if (existing) {
    // Update existing reaction
    db.prepare('UPDATE reactions SET emoji = ?, updated_at = ? WHERE post_id = ? AND person_id = ?').run(emoji, now, postId, personId)
    return {
      ...existing,
      emoji,
      updated_at: now,
    }
  } else {
    // Create new reaction
    db.prepare('INSERT INTO reactions (id, post_id, person_id, emoji, created_at) VALUES (?, ?, ?, ?, ?)').run(id, postId, personId, emoji, now)
    return {
      id,
      post_id: postId,
      person_id: personId,
      emoji,
      created_at: now,
      updated_at: undefined,
    }
  }
}

/**
 * Delete a reaction
 */
export function deleteReaction(postId: string, personId: string): boolean {
  const result = db.prepare('DELETE FROM reactions WHERE post_id = ? AND person_id = ?').run(postId, personId)
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
