import { Router, Request, Response } from 'express'
import { requireAuth } from '../auth.js'
import { getGiftState, openGift } from '../gift.js'

const router = Router()

/*
 * The gift box is shared by both people, so the state is global rather than
 * per-user -- but the token still has to be valid, like every other write.
 */
router.use(requireAuth)

/** Current state of the box: how much wrapping is off and whether today is done. */
router.get('/', (_req: Request, res: Response) => {
  try {
    res.json({ state: getGiftState() })
  } catch (err) {
    console.error('Error reading gift state:', err)
    res.status(500).json({ error: '获取礼物状态失败' })
  }
})

/**
 * Tear the wrapping a little further.
 *
 * Idempotent per day: the second call of the day reports justOpened=false
 * and leaves the box exactly where it was.
 */
router.post('/open', (_req: Request, res: Response) => {
  try {
    const result = openGift()
    res.json({ state: result.state, justOpened: result.justOpened })
  } catch (err) {
    console.error('Error opening gift:', err)
    res.status(500).json({ error: '打开礼物失败' })
  }
})

export default router
