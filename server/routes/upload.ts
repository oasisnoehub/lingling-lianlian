import { Router } from 'express'
import multer from 'multer'
import { join, extname } from 'path'
import { mkdirSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { UPLOADS_DIR } from '../db'

const uploadsDir = UPLOADS_DIR

// Ensure upload directories exist
const imagesDir = join(uploadsDir, 'images')
const videosDir = join(uploadsDir, 'videos')
const thumbnailsDir = join(uploadsDir, 'thumbnails')
;[imagesDir, videosDir, thumbnailsDir].forEach(dir => {
  mkdirSync(dir, { recursive: true })
})

// Configure multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir)
  },
  filename: (_req, file, cb) => {
    const uniqueName = `${uuidv4()}${extname(file.originalname)}`
    cb(null, uniqueName)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
})

const router = Router()

interface MediaItem {
  id: string
  type: 'image' | 'video'
  url: string
  thumbnail_url?: string
}

router.post('/image', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const item: MediaItem = {
      id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'image',
      url: `/uploads/${req.file.filename}`,
    }

    res.status(201).json(item)
  } catch (err) {
    console.error('Error uploading image:', err)
    res.status(500).json({ error: 'Failed to upload image' })
  }
})

router.post('/video', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const item: MediaItem = {
      id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'video',
      url: `/uploads/${req.file.filename}`,
      thumbnail_url: undefined, // Could generate thumbnail with ffmpeg if available
    }

    res.status(201).json(item)
  } catch (err) {
    console.error('Error uploading video:', err)
    res.status(500).json({ error: 'Failed to upload video' })
  }
})

export default router
