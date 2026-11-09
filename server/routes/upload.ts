import { Router, type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import { mkdirSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { UPLOADS_DIR } from '../db.js'
import { createRateLimiter } from '../auth.js'

const uploadsDir = UPLOADS_DIR
mkdirSync(uploadsDir, { recursive: true })

/** A picture is meant to be a moment, not a file; a video may be longer. */
const MAX_IMAGE_SIZE = 20 * 1024 * 1024
const MAX_VIDEO_SIZE = 100 * 1024 * 1024

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

function makeUploader(types: Record<string, string>, label: string, maxFileSize: number): SingleFileMiddleware {
  return multer({
    limits: { fileSize: maxFileSize, files: 1 },
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

const imageUpload = makeUploader(IMAGE_TYPES, 'image', MAX_IMAGE_SIZE)
const videoUpload = makeUploader(VIDEO_TYPES, 'video', MAX_VIDEO_SIZE)

const uploadLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 60 })

function describeUploadError(err: unknown, label: string, maxFileSize: number): { status: number; message: string } {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const mb = Math.round(maxFileSize / 1024 / 1024)
      return { status: 413, message: '文件太大，单个文件不能超过 ' + mb + 'MB' }
    }
    return { status: 400, message: '不支持的文件格式，请上传' + label + '文件' }
  }
  return { status: 500, message: '上传失败，请稍后重试' }
}

function handleUpload(
  upload: SingleFileMiddleware,
  label: string,
  type: 'image' | 'video',
  maxFileSize: number,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    upload(req, res, (err?: unknown) => {
      if (err) {
        const { status, message } = describeUploadError(err, label, maxFileSize)
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

router.post('/image', uploadLimiter, handleUpload(imageUpload, '图片', 'image', MAX_IMAGE_SIZE))
router.post('/video', uploadLimiter, handleUpload(videoUpload, '视频', 'video', MAX_VIDEO_SIZE))

export default router
