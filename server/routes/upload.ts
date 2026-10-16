import { Router, type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import { mkdirSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { UPLOADS_DIR } from '../db.js'
import { createRateLimiter } from '../auth.js'

const uploadsDir = UPLOADS_DIR
mkdirSync(uploadsDir, { recursive: true })

const MAX_FILE_SIZE = 100 * 1024 * 1024

/**
 * The stored extension is derived from the MIME type, never from the
 * client-supplied filename. Anything off these lists is rejected, so an
 * uploaded file can never be served back as .html / .svg and execute script
 * on our own origin.
 */
const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/heic-sequence': '.heic',
  'image/heif-sequence': '.heif',
}

const VIDEO_TYPES: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'video/x-matroska': '.mkv',
}

type SingleFileMiddleware = (req: Request, res: Response, next: (err?: unknown) => void) => void

function makeUploader(types: Record<string, string>, label: string): SingleFileMiddleware {
  return multer({
    limits: { fileSize: MAX_FILE_SIZE, files: 1 },
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadsDir),
      filename: (_req, file, cb) => {
        cb(null, uuidv4() + (types[file.mimetype] ?? ''))
      },
    }),
    fileFilter: (_req, file, cb) => {
      if (!types[file.mimetype]) {
        cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', label))
        return
      }
      cb(null, true)
    },
  }).single('file')
}

const imageUpload = makeUploader(IMAGE_TYPES, 'image')
const videoUpload = makeUploader(VIDEO_TYPES, 'video')

const uploadLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 60 })

function describeUploadError(err: unknown, label: string): { status: number; message: string } {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return { status: 413, message: '文件太大，单个文件不能超过 100MB' }
    }
    return { status: 400, message: '不支持的文件格式，请上传' + label + '文件' }
  }
  return { status: 500, message: '上传失败，请稍后重试' }
}

function handleUpload(upload: SingleFileMiddleware, label: string, type: 'image' | 'video') {
  return (req: Request, res: Response, next: NextFunction): void => {
    upload(req, res, (err?: unknown) => {
      if (err) {
        const { status, message } = describeUploadError(err, label)
        res.status(status).json({ error: message })
        return
      }

      if (!req.file) {
        res.status(400).json({ error: '没有收到文件' })
        return
      }

      res.status(201).json({
        id: 'media-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        type,
        url: '/uploads/' + req.file.filename,
      })
    })

    void next
  }
}

const router = Router()

router.post('/image', uploadLimiter, handleUpload(imageUpload, '图片', 'image'))
router.post('/video', uploadLimiter, handleUpload(videoUpload, '视频', 'video'))

export default router
