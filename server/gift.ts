import db from './db.js'
import { daysBetweenKeys, todayKey } from './dates.js'

/*
 * The gift box that fills Lingling's countdown slot.
 *
 * The wrapping paper comes off one layer per day, and the layer that is due
 * on a given day is a function of the calendar rather than of how often
 * somebody happened to visit: the day of the very first tear is stored as the
 * anchor, and every later day earns one more layer. Missing a few days
 * therefore loses no progress -- the next tear simply skips ahead to where
 * the box should be by then.
 *
 * The state lives on the server rather than in the browser so a reload, a
 * different device and the other person's timeline all see the same box.
 */

export const GIFT_ID = 'lingling-gift'

/** How many layers of wrapping paper the box has. */
export const GIFT_MAX_STAGE = 5

export interface GiftState {
  /** The day of the first tear, or null while the box has never been opened. */
  anchorDate: string | null
  /** Whether the box has already been torn open today. */
  openedToday: boolean
  /** Days between the anchor and today. */
  elapsedDays: number
  /** How much wrapping is off, 0..maxStage. */
  stage: number
  /** The number of layers, so a client never has to hard-code it. */
  maxStage: number
  /** Today in Asia/Shanghai, as a date key. */
  today: string
}

export interface GiftOpenResult {
  state: GiftState
  /** True when this call is the one that actually tore the paper today. */
  justOpened: boolean
}

function getAnchorDate(): string | null {
  const row = db.prepare('SELECT anchor_date FROM gift_progress WHERE gift_id = ?').get(GIFT_ID) as
    | { anchor_date: string }
    | undefined
  return row?.anchor_date ?? null
}

function hasOpenedOn(date: string): boolean {
  const row = db
    .prepare('SELECT 1 AS hit FROM gift_opens WHERE gift_id = ? AND open_date = ?')
    .get(GIFT_ID, date) as { hit: number } | undefined
  return row !== undefined
}

/**
 * The box's current state, derived from the stored anchor and today's date.
 *
 * Nothing here depends on the requester, so both people always read the same
 * progress, and the answer is the same no matter which device asks.
 */
export function getGiftState(now: Date = new Date()): GiftState {
  const today = todayKey(now)
  const anchorDate = getAnchorDate()
  const openedToday = hasOpenedOn(today)
  const elapsedDays = anchorDate ? Math.max(0, daysBetweenKeys(anchorDate, today)) : 0

  // Today's tear adds one layer on top of the layers the calendar has already
  // earned, so the box is one step further along once it has been opened.
  const stage = Math.min(openedToday ? elapsedDays + 1 : elapsedDays, GIFT_MAX_STAGE)

  return { anchorDate, openedToday, elapsedDays, stage, maxStage: GIFT_MAX_STAGE, today }
}

/**
 * Tear the wrapping a little further.
 *
 * Opening twice on the same day is not an error: the second call simply
 * reports that nothing changed, so a double-tap or a second device cannot
 * peel extra paper.
 */
export function openGift(now: Date = new Date()): GiftOpenResult {
  const today = todayKey(now)
  const stamp = now.getTime()

  // The anchor and today's tear are written together, so a failure can never
  // leave an anchor without the tear it was created for.
  const tear = db.transaction((): boolean => {
    const anchor = db.prepare('SELECT 1 AS hit FROM gift_progress WHERE gift_id = ?').get(GIFT_ID)
    if (!anchor) {
      db.prepare('INSERT INTO gift_progress (gift_id, anchor_date, created_at) VALUES (?, ?, ?)').run(
        GIFT_ID,
        today,
        stamp,
      )
    }

    const result = db
      .prepare('INSERT OR IGNORE INTO gift_opens (gift_id, open_date, created_at) VALUES (?, ?, ?)')
      .run(GIFT_ID, today, stamp)
    return result.changes > 0
  })

  const justOpened = tear()
  return { state: getGiftState(now), justOpened }
}
