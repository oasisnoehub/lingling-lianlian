import { Router } from 'express'
import { getTimeline, createPost, updatePost, deletePost } from '../db.js'
import type { MediaItem, PostLocation } from '../db.js'

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

router.get('/timeline', (_req, res) => {
  try {
    const timeline = getTimeline()
    res.json(timeline)
  } catch (err) {
    console.error('Error getting timeline:', err)
    res.status(500).json({ error: 'Failed to get timeline' })
  }
})

router.post('/', (req, res) => {
  try {
    const { author_id, content, emotion, media, location } = req.body

    if (!author_id || !content) {
      return res.status(400).json({ error: 'author_id and content are required' })
    }

    if (location != null && !isValidLocation(location)) {
      return res.status(400).json({ error: '位置格式无效，请重新定位后再试' })
    }

    const post = createPost(author_id, content, emotion, media as MediaItem[] || [], location)
    res.status(201).json(post)
  } catch (err) {
    console.error('Error creating post:', err)
    res.status(500).json({ error: 'Failed to create post' })
  }
})

router.put('/:id', (req, res) => {
  try {
    const { content, emotion, media, location } = req.body

    if (location !== undefined && location !== null && !isValidLocation(location)) {
      return res.status(400).json({ error: '位置格式无效，请重新定位后再试' })
    }

    const post = updatePost(req.params.id, content, emotion, media, location)

    if (!post) {
      return res.status(404).json({ error: 'Post not found' })
    }

    res.json(post)
  } catch (err) {
    console.error('Error updating post:', err)
    res.status(500).json({ error: 'Failed to update post' })
  }
})

router.delete('/:id', (req, res) => {
  try {
    const deleted = deletePost(req.params.id)

    if (!deleted) {
      return res.status(404).json({ error: 'Post not found' })
    }

    res.status(204).send()
  } catch (err) {
    console.error('Error deleting post:', err)
    res.status(500).json({ error: 'Failed to delete post' })
  }
})

export default router
