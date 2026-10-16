import express from 'express'
import cors from 'cors'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

import authRouter from './routes/auth.js'
import personsRouter from './routes/persons.js'
import postsRouter from './routes/posts.js'
import uploadRouter from './routes/upload.js'
import locationRouter from './routes/location.js'
import { requireAuth } from './auth.js'
import { getTimeline, UPLOADS_DIR } from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..', '..')
const uploadsDir = UPLOADS_DIR

const app = express()
const PORT = process.env.PORT || 3456

// Only the configured origins may call the API from a browser. When the
// variable is unset no cross-origin request is allowed at all, which is the
// right default for a single-origin deployment.
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)

if (allowedOrigins.length === 0) {
  console.warn('CORS_ORIGIN is not set; cross-origin API requests will be blocked.')
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
      return
    }
    // No Access-Control-Allow-Origin header, so the browser refuses to hand
    // the response to the calling page. CORS is not an auth mechanism: the
    // bearer token is.
    callback(null, false)
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}))

// Uploads are never interpreted as anything but their declared media type.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('X-Frame-Options', 'DENY')
  next()
})

app.use(express.json({ limit: '1mb' }))

// Serve uploaded files with long-term caching. Filenames are UUIDs, so they
// are not guessable.
if (existsSync(uploadsDir)) {
  app.use('/uploads', express.static(uploadsDir, {
    maxAge: '1y',
    etag: true,
    lastModified: true,
    immutable: true,
    index: false,
    dotfiles: 'deny',
    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
    },
  }))
}

app.use('/api/auth', authRouter)
app.use('/api/persons', requireAuth, personsRouter)
app.use('/api/posts', postsRouter)
app.use('/api/upload', requireAuth, uploadRouter)
app.use('/api/location', requireAuth, locationRouter)

app.get('/api/timeline', requireAuth, (_req, res) => {
  try {
    res.json(getTimeline())
  } catch (err) {
    console.error('Error getting timeline:', err)
    res.status(500).json({ error: 'Failed to get timeline' })
  }
})

/**
 * Locate the built frontend. In the Docker image the server lives at
 * /app/dist/server, so the app root is two levels up; when built somewhere
 * else it is one level up or the working directory. Probing for index.html
 * keeps every layout working instead of hard-coding one.
 */
function resolveDistDir(): string | null {
  const candidates = [rootDir, join(__dirname, '..'), process.cwd()]
  for (const base of candidates) {
    const dir = join(base, 'dist')
    if (existsSync(join(dir, 'index.html'))) return dir
  }
  return null
}

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const distDir = resolveDistDir()
  if (!distDir) {
    console.warn('Could not find the built frontend; running in API-only mode.')
  }
  if (distDir) {
    app.use(
      express.static(distDir, {
        index: false,
        setHeaders(res, path) {
          // Hashed asset filenames can be cached hard, index.html cannot.
          if (path.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache')
          }
        },
      }),
    )
    app.get('*', (_req, res) => {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; " +
          "script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; " +
          "base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      )
      res.sendFile(join(distDir, 'index.html'))
    })
  }
}

interface HttpError extends Error {
  /** Set by body-parser for malformed or oversized payloads. */
  type?: string
}

// Malformed JSON bodies land here; everything else is a genuine 500.
app.use((err: HttpError, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(err)
    return
  }
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    res.status(400).json({ error: '请求内容无效' })
    return
  }
  console.error('Unhandled error:', err)
  res.status(500).json({ error: '服务器内部错误' })
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
