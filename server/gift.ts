import db from './db.js'
import {
  addDays,
  daysBetween,
  daysBetweenKeys,
  shanghaiCivilDate,
  toDateKey,
  todayKey,
  type CivilDate,
} from './dates.js'

/*
 * The gift box that fills Lingling's countdown slot.
 *
 * The wrapping paper comes off a little every day, and how much is off is a
 * function of the calendar rather than of how often somebody happened to
 * visit: the day of the very first tear is stored as the anchor, and the
 * paper is torn further as the days go by. Missing a few days therefore loses
 * no progress -- the next tear simply skips ahead to where the box should be
 * by then.
 *
 * The work is done in cycles. A cycle runs from the day its wrapping starts
 * to the day the gift is due, and it starts on the day the box was first
 * opened. Once the gift date has passed the wrapping starts again the next
 * day, so the box counts down to the next year's gift rather than snapping
 * back to half-torn.
 *
 * The state lives on the server rather than in the browser so a reload, a
 * different device and the other person's timeline all see the same box.
 */

export const GIFT_ID = 'lingling-gift'

/**
 * The day the gift is due. The client keeps the same date in
 * src/config/personDates.ts; the two trees cannot share a module, so the two
 * copies have to be kept in step.
 */
const GIFT_MONTH = 1
const GIFT_DAY = 11

export interface GiftState {
  /** The day of the first tear, or null while the box has never been opened. */
  anchorDate: string | null
  /** The day this cycle's wrapping started, or null before the first tear. */
  cycleStart: string | null
  /** The day this cycle's gift is due. */
  targetDate: string
  /** Whether the box has already been torn open today. */
  openedToday: boolean
  /** Days from the start of the cycle to today. */
  elapsedDays: number
  /** The length of the cycle in days. */
  cycleDays: number
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

/** The gift date in a given year. */
function giftDateOf(year: number): CivilDate {
  return { year, month: GIFT_MONTH, day: GIFT_DAY }
}

/** The first gift date on or after the given date. */
function nextGiftDate(from: CivilDate): CivilDate {
  const thisYear = giftDateOf(from.year)
  return daysBetween(from, thisYear) >= 0 ? thisYear : giftDateOf(from.year + 1)
}

/**
 * The cycle the box is in right now.
 *
 * The cycle ends at the next gift date. It starts on the day the box was
 * first opened, unless a gift date has passed since then -- then it starts on
 * the day after that gift date, so the wrapping begins again instead of the
 * box jumping back to how much was torn a year ago.
 */
function currentCycle(anchorDate: string | null, today: CivilDate): { start: string | null; target: string } {
  const target = nextGiftDate(today)
  const targetKey = toDateKey(target)
  if (!anchorDate) return { start: null, target: targetKey }

  // The day after the gift date before this one: where a new cycle begins.
  const naturalStart = toDateKey(addDays(giftDateOf(target.year - 1), 1))
  const start = daysBetweenKeys(anchorDate, naturalStart) > 0 ? naturalStart : anchorDate
  return { start, target: targetKey }
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
  const cycle = currentCycle(anchorDate, shanghaiCivilDate(now))

  const elapsedDays = cycle.start ? Math.max(0, daysBetweenKeys(cycle.start, today)) : 0
  const cycleDays = cycle.start ? Math.max(0, daysBetweenKeys(cycle.start, cycle.target)) : 0

  return {
    anchorDate,
    cycleStart: cycle.start,
    targetDate: cycle.target,
    openedToday,
    elapsedDays,
    cycleDays,
    today,
  }
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
