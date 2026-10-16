import { Router } from 'express'
import { createPost, deletePost, getPostAuthorId, updatePost } from '../db.js'
import type { MediaItem, PostLocation } from '../db.js'
import { requireAuth } from '../auth.js'

const router = Router()

function isValidLocation(value: unknown): value is PostLocation {
  if (!value || typeof value !== 'object') return false
  const location = value as Record<string, unknown>
  return typeof location.address === 'string'
    && location.address.trim().length > 0
    && (location.name === undefined || typeof location.name === 'string')
    && typeof location.latitude === 'number'
    && Number.isFinite(location.latitude)
    && location.latitude >= -90
    && location.latitude <= 90
    && typeof location.longitude === 'number'
    && Number.isFinite(location.longitude)
    && location.longitude >= -180
    && location.longitude <= 180
}

/*
 * Media must live under our own /uploads prefix. Rejecting anything else stops
 * a client from embedding arbitrary third-party URLs or javascript: links in
 * somebody else timeline.
 */
function parseMedia(value: unknown): MediaItem[] | null {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) return null
  if (value.length > 9) return null
  const items: MediaItem[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null
    const item = entry as Record<string, unknown>
    if (typeof item.id !== 'string' || item.id.length === 0) return null
    if (item.type !== 'image' && item.type !== 'video') return null
    if (typeof item.url !== 'string' || !item.url.startsWith('/uploads/')) return null
    items.push({ id: item.id, type: item.type, url: item.url })
  }
  return items
}

function normaliseLocation(value: unknown): PostLocation | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (!isValidLocation(value)) return undefined
  return value
}

// Every route below requires a valid token.
router.use(requireAuth)

router.post('/', (req, res) => {
  try {
    // The author always comes from the token, never from the request body.
    const authorId = req.personId as string
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : ''
    const emotion = typeof req.body?.emotion === 'string' ? req.body.emotion : undefined
    const media = parseMedia(req.body?.media)
    if (media === null) {
      res.status(400).json({ error: '媒体格式无效' })
      return
    }
    // A post may be media-only, so content alone is not required.
    if (!content && media.length === 0) {
      res.status(400).json({ error: '写点什么，或者放张照片吧' })
      return
    }
    const location = normaliseLocation(req.body?.location)
    if (location === undefined && req.body?.location != null) {
      res.status(400).json({ error: '位置格式无效，请重新定位后再试' })
      return
    }
    res.status(201).json(createPost(authorId, content, emotion, media, location ?? null))
  } catch (err) {
    console.error('Error creating post:', err)
    res.status(500).json({ error: '发布失败，请稍后重试' })
  }
})

router.put('/:id', (req, res) => {
  try {
    const authorId = getPostAuthorId(req.params.id)
    if (!authorId) {
      res.status(404).json({ error: '这条动态不存在' })
      return
    }
    if (authorId !== req.personId) {
      res.status(403).json({ error: '只能修改自己的动态' })
      return
    }
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : ''
    const emotion = typeof req.body?.emotion === 'string' ? req.body.emotion : undefined
    const media = parseMedia(req.body?.media)
    if (media === null) {
      res.status(400).json({ error: '媒体格式无效' })
      return
    }
    const location = normaliseLocation(req.body?.location)
    if (location === undefined && req.body?.location != null) {
      res.status(400).json({ error: '位置格式无效，请重新定位后再试' })
      return
    }
    const post = updatePost(req.params.id, content, emotion, media, location ?? null)
    if (!post) {
      res.status(404).json({ error: '这条动态不存在' })
      return
    }
    res.json(post)
  } catch (err) {
    console.error('Error updating post:', err)
    res.status(500).json({ error: '保存失败，请稍后重试' })
  }
})

router.delete('/:id', (req, res) => {
  try {
    const authorId = getPostAuthorId(req.params.id)
    if (!authorId) {
      res.status(404).json({ error: '这条动态不存在' })
      return
    }
    if (authorId !== req.personId) {
      res.status(403).json({ error: '只能删除自己的动态' })
      return
    }
    if (!deletePost(req.params.id)) {
      res.status(404).json({ error: '这条动态不存在' })
      return
    }
    res.status(204).send()
  } catch (err) {
    console.error('Error deleting post:', err)
    res.status(500).json({ error: '删除失败，请稍后重试' })
  }
})

export default router
