import { Router, Request, Response } from 'express'
import { requireAuth } from '../auth.js'
import { getGiftState, giftOwner, isGiftBox, openGift } from '../gift.js'

const router = Router()

/*
 * The gift box is shared by both people, so the state is global rather than
 * per-user -- but the token still has to be valid, like every other write.
 */
router.use(requireAuth)

/** The box this request is about, if there is one. */
function boxOf(req: Request): string | null {
  const giftId = req.params.giftId
  return giftId && isGiftBox(giftId) ? giftId : null
}

/** Current state of the box: how much wrapping is off and whether today is done. */
router.get('/:giftId', (req: Request, res: Response) => {
  const giftId = boxOf(req)
  if (!giftId) {
    res.status(404).json({ error: '没有这个礼物盒' })
    return
  }
  try {
    res.json({ state: getGiftState(giftId) })
  } catch (err) {
    console.error('Error reading gift state:', err)
    res.status(500).json({ error: '获取礼物状态失败' })
  }
})

/**
 * Tear the wrapping a little further.
 *
 * Only the person the box belongs to may tear it: the paper that comes off is
 * theirs. The other person may read the box, but not open it.
 *
 * Idempotent per day: the second call of the day reports justOpened=false
 * and leaves the box exactly where it was.
 */
router.post('/:giftId/open', (req: Request, res: Response) => {
  const giftId = boxOf(req)
  if (!giftId) {
    res.status(404).json({ error: '没有这个礼物盒' })
    return
  }
  if (giftOwner(giftId) !== req.personId) {
    res.status(403).json({ error: '这个礼物盒只能由本人拆开' })
    return
  }
  try {
    const result = openGift(giftId)
    res.json({ state: result.state, justOpened: result.justOpened })
  } catch (err) {
    console.error('Error opening gift:', err)
    res.status(500).json({ error: '打开礼物失败' })
  }
})

export default router
