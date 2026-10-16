import { createHmac, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

/** How long an issued token stays valid. */
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

function getSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('AUTH_SECRET is not configured')
  }
  return secret
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url')
}

export function createToken(personId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: personId, exp: Date.now() + TOKEN_TTL_MS }),
  ).toString('base64url')

  return payload + '.' + sign(payload)
}

/** Returns the person id the token was issued for, or null if it is invalid/expired. */
export function verifyToken(token: string | undefined): string | null {
  if (!token) return null

  const separator = token.lastIndexOf('.')
  if (separator <= 0) return null

  const payload = token.slice(0, separator)
  const signature = token.slice(separator + 1)

  const expected = Buffer.from(sign(payload))
  const provided = Buffer.from(signature)
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return null
  }

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub?: unknown
      exp?: unknown
    }
    if (typeof data.sub !== 'string' || typeof data.exp !== 'number') return null
    if (Date.now() > data.exp) return null
    return data.sub
  } catch {
    return null
  }
}

/** Constant-time comparison, so a wrong password leaks no timing information. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

declare global {
  namespace Express {
    interface Request {
      personId?: string
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined
  const personId = verifyToken(token)

  if (!personId) {
    res.status(401).json({ error: '未登录或登录已过期，请重新解锁' })
    return
  }

  req.personId = personId
  next()
}

interface RateLimitOptions {
  windowMs: number
  max: number
}

/**
 * Minimal in-memory fixed-window rate limiter. Enough for a two-person site and
 * avoids another dependency; state resets on process restart.
 */
export function createRateLimiter({ windowMs, max }: RateLimitOptions) {
  const hits = new Map<string, { count: number; resetAt: number }>()

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now()
    const key = req.ip ?? 'unknown'

    for (const [k, v] of hits) {
      if (now > v.resetAt) hits.delete(k)
    }

    const entry = hits.get(key)
    if (!entry) {
      hits.set(key, { count: 1, resetAt: now + windowMs })
      next()
      return
    }

    entry.count += 1
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000))
      res.status(429).json({ error: '尝试过于频繁，请稍后再试' })
      return
    }

    next()
  }
}
