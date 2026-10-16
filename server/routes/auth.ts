import { Router } from 'express'
import { createRateLimiter, createToken, requireAuth, safeEqual } from '../auth.js'
import { getPersonById } from '../db.js'

const router = Router()

/** Wrong-password attempts allowed per IP per 15 minutes. */
const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 })

function configuredPassword(personId: string): string | undefined {
  if (personId === 'person-a') return process.env.PERSON_A_PASSWORD
  if (personId === 'person-b') return process.env.PERSON_B_PASSWORD
  return undefined
}

router.post('/login', loginLimiter, (req, res) => {
  const { personId, password } = req.body ?? {}

  if (typeof personId !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'personId 和 password 均为必填' })
    return
  }

  const person = getPersonById(personId)
  // Same response for "no such person" and "wrong password" so this endpoint
  // cannot be used to enumerate valid person ids.
  if (!person) {
    res.status(401).json({ error: '密码错误，请重试' })
    return
  }

  const expected = configuredPassword(personId)
  if (!expected) {
    // Only reachable when the server itself is misconfigured.
    console.error('No password configured for person:', personId)
    res.status(503).json({ error: '服务端尚未配置访问密码，请联系管理员' })
    return
  }

  if (!safeEqual(password, expected)) {
    res.status(401).json({ error: '密码错误，请重试' })
    return
  }

  res.json({ token: createToken(personId), person })
})

router.get('/me', requireAuth, (req, res) => {
  const person = getPersonById(req.personId as string)
  if (!person) {
    res.status(401).json({ error: '未登录或登录已过期，请重新解锁' })
    return
  }
  res.json({ person })
})

export default router
