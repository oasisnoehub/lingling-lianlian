import { Router, Request, Response } from 'express'
import multer from 'multer'
import { mkdirSync, existsSync, unlinkSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { UPLOADS_DIR } from '../db.js'
import { createRateLimiter } from '../auth.js'
import { getPersonById, updatePersonAvatar } from '../db.js'
import { join, basename } from 'path'

const avatarDir = join(UPLOADS_DIR, 'avatars')
mkdirSync(avatarDir, { recursive: true })

const MAX_AVATAR_SIZE = 2 * 1024 * 1024 // 2MB

/**
 * Avatar-specific MIME types - only common web image formats
 */
const AVATAR_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}

const avatarUpload = multer({
  limits: { fileSize: MAX_AVATAR_SIZE, files: 1 },
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, avatarDir),
    filename: (_req, file, cb) => {
      cb(null, 'avatar-' + uuidv4() + (AVATAR_TYPES[file.mimetype] ?? '.png'))
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (!AVATAR_TYPES[file.mimetype]) {
      cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'avatar'))
      return
    }
    cb(null, true)
  },
}).single('file')

const avatarLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 10 }) // 10 uploads per minute

function describeAvatarError(err: unknown): { status: number; message: string } {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return { status: 413, message: '头像文件太大，不能超过 2MB' }
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return { status: 400, message: '不支持的文件格式，请使用 JPEG、PNG 或 WebP 格式' }
    }
    return { status: 400, message: '上传失败，请检查文件格式' }
  }
  return { status: 500, message: '上传失败，请稍后重试' }
}

const router = Router()

router.post('/', avatarLimiter, (req: Request, res: Response) => {
  avatarUpload(req, res, (err?: unknown) => {
    if (err) {
      const { status, message } = describeAvatarError(err)
      res.status(status).json({ error: message })
      return
    }

    if (!req.file) {
      res.status(400).json({ error: '没有收到文件' })
      return
    }

    // req.personId is set by requireAuth middleware in index.ts
    const personId = (req as any).personId
    if (!personId) {
      // Clean up uploaded file
      try {
        unlinkSync(join(avatarDir, req.file.filename))
      } catch {
        // Ignore cleanup errors
      }
      res.status(401).json({ error: '未登录或登录已过期' })
      return
    }

    // Verify the person exists and matches the token
    const person = getPersonById(personId)
    if (!person) {
      try {
        unlinkSync(join(avatarDir, req.file.filename))
      } catch {
        // Ignore cleanup errors
      }
      res.status(404).json({ error: '用户不存在' })
      return
    }

    // Update person's avatar in database
    const avatarUrl = '/uploads/avatars/' + req.file.filename
    const updatedAt = Date.now()
    
    try {
      updatePersonAvatar(personId, avatarUrl, updatedAt)
    } catch (dbErr) {
      console.error('Failed to update person avatar in database:', dbErr)
      // Clean up uploaded file
      try {
        unlinkSync(join(avatarDir, req.file.filename))
      } catch {
        // Ignore cleanup errors
      }
      res.status(500).json({ error: '更新头像失败，请稍后重试' })
      return
    }

    res.status(200).json({
      avatar_url: avatarUrl,
      avatar_updated_at: updatedAt,
    })
  })
})

export default router
