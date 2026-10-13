import { Router } from 'express'
import { getTimeline, createPost, updatePost, deletePost } from '../db.js'
import type { MediaItem } from '../db.js'

const router = Router()

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
    const { author_id, content, emotion, media } = req.body

    if (!author_id || !content) {
      return res.status(400).json({ error: 'author_id and content are required' })
    }

    const post = createPost(author_id, content, emotion, media as MediaItem[] || [])
    res.status(201).json(post)
  } catch (err) {
    console.error('Error creating post:', err)
    res.status(500).json({ error: 'Failed to create post' })
  }
})

router.put('/:id', (req, res) => {
  try {
    const { content, emotion, media } = req.body
    const post = updatePost(req.params.id, content, emotion, media)

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
