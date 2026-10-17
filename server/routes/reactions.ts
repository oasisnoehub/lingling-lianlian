import { Router, Request, Response } from 'express'
import { requireAuth } from '../auth.js'
import {
  deleteReaction,
  getPostAuthorId,
  getReactionsByPostIds,
  upsertReaction,
} from '../db.js'

const router = Router()

/** A timeline is small; anything beyond this is a malformed or abusive query. */
const MAX_POST_IDS = 200

/*
 * An emoji may be a ZWJ family sequence, a flag pair or a single pictograph, so
 * the length check is on code points and the character class has to admit ZWJ,
 * variation selectors, skin-tone modifiers and tag sequences. Requiring an
 * Extended_Pictographic (or a flag) base is what keeps plain digits, "#" and
 * "*" -- all of which carry the Unicode `Emoji` property -- from being stored
 * as if they were reactions. Keycaps (9 + FE0F + 20E3) are the one legitimate
 * case whose base is a digit, so they get their own alternative.
 */
const EMOJI_ALLOWED = /^[0-9#*\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Presentation}\uFE0E\uFE0F\u20E3\u200D\u{E0020}-\u{E007E}\u{E007F}]{1,32}$/u
const EMOJI_BASE = /(?:[\p{Extended_Pictographic}\p{Regional_Indicator}]|[0-9#*]\uFE0F?\u20E3)/u

function isValidEmoji(value: string): boolean {
  return EMOJI_ALLOWED.test(value) && EMOJI_BASE.test(value)
}

// Every route below requires a valid token; the person always comes from it.
router.use(requireAuth)

/**
 * Get reactions for multiple posts
 * Query: ?postIds=id1,id2,id3
 */
router.get('/', (req: Request, res: Response) => {
  const postIdsParam = req.query.postIds as string | undefined
  
  if (!postIdsParam) {
    res.status(400).json({ error: '缺少 postIds 参数' })
    return
  }
  
  const postIds = [...new Set(postIdsParam.split(',').map(id => id.trim()).filter(id => id !== ''))]
  
  if (postIds.length === 0) {
    res.status(400).json({ error: 'postIds 不能为空' })
    return
  }

  if (postIds.length > MAX_POST_IDS) {
    res.status(400).json({ error: `一次最多查询 ${MAX_POST_IDS} 条动态的表情回应` })
    return
  }
  
  try {
    const reactions = getReactionsByPostIds(postIds)
    res.json({ reactions })
  } catch (err) {
    console.error('Error getting reactions:', err)
    res.status(500).json({ error: '获取表情回应失败' })
  }
})

/**
 * Create or update a reaction
 * Body: { postId: string, emoji: string }
 */
router.post('/', (req: Request, res: Response) => {
  const { postId, emoji } = req.body ?? {}
  
  if (typeof postId !== 'string' || typeof emoji !== 'string') {
    res.status(400).json({ error: 'postId 和 emoji 均为必填' })
    return
  }
  
  if (!isValidEmoji(emoji)) {
    res.status(400).json({ error: '无效的表情符号' })
    return
  }
  
  const personId = req.personId as string
  if (!personId) {
    res.status(401).json({ error: '未登录或登录已过期' })
    return
  }

  // Reject reactions on posts that no longer exist, rather than letting the
  // foreign key turn it into a 500.
  if (!getPostAuthorId(postId)) {
    res.status(404).json({ error: '动态不存在或已删除' })
    return
  }
  
  try {
    const reaction = upsertReaction(postId, personId, emoji)
    res.status(200).json({ reaction })
  } catch (err) {
    console.error('Error upserting reaction:', err)
    res.status(500).json({ error: '保存表情回应失败' })
  }
})

/**
 * Delete a reaction
 * Body: { postId: string }
 */
router.delete('/', (req: Request, res: Response) => {
  const { postId } = req.body ?? {}
  
  if (typeof postId !== 'string') {
    res.status(400).json({ error: 'postId 为必填' })
    return
  }
  
  const personId = req.personId as string
  if (!personId) {
    res.status(401).json({ error: '未登录或登录已过期' })
    return
  }
  
  try {
    // Idempotent: withdrawing a reaction that is already gone is a success,
    // which keeps a double-tap from surfacing a spurious error.
    const removed = deleteReaction(postId, personId)
    res.status(200).json({ success: true, removed })
  } catch (err) {
    console.error('Error deleting reaction:', err)
    res.status(500).json({ error: '删除表情回应失败' })
  }
})

export default router
