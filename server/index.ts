import express from 'express'
import cors from 'cors'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

import personsRouter from './routes/persons.js'
import postsRouter from './routes/posts.js'
import uploadRouter from './routes/upload.js'
import { getTimeline } from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const uploadsDir = join(rootDir, 'uploads')

const app = express()
const PORT = process.env.PORT || 3456

// Middleware
app.use(cors())
app.use(express.json({ limit: '10mb' }))

// Serve uploaded files
if (existsSync(uploadsDir)) {
  app.use('/uploads', express.static(uploadsDir))
}

// API Routes
app.use('/api/persons', personsRouter)
app.use('/api/posts', postsRouter)
app.use('/api/upload', uploadRouter)

// Timeline endpoint at /api/timeline
app.get('/api/timeline', (_req, res) => {
  try {
    const timeline = getTimeline()
    res.json(timeline)
  } catch (err) {
    console.error('Error getting timeline:', err)
    res.status(500).json({ error: 'Failed to get timeline' })
  }
})

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
