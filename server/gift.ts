import db from './db.js'
import {
  addDays,
  daysBetween,
  daysBetweenKeys,
  isRealDate,
  parseDateKey,
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

/**
 * The gift boxes there are, and the day each one's gift is due.
 *
 * The dates live here rather than in the database, so a date can be corrected
 * by editing this file alone. The client asks for a box by its id, so a
 * second occasion is a second entry here.
 */
const GIFTS: Record<string, { month: number; day: number }> = {
  'lingling-gift': { month: 1, day: 11 },
  'lianlian-gift': { month: 6, day: 28 },
}

/** Whether there is a box with this id. */
export function isGiftBox(giftId: string): boolean {
  return Object.prototype.hasOwnProperty.call(GIFTS, giftId)
}

export interface GiftState {
  /** The box this state belongs to. */
  giftId: string
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
  /**
   * How far along the paper is, 0..1: 0 is the first tear and 1 is the day of
   * the gift itself. The client turns this into tears along the ribbon, so
   * the number of tears stays a fact about the painting rather than of the
   * server.
   */
  progress: number
  /** Today in Asia/Shanghai, as a date key. */
  today: string
}

export interface GiftOpenResult {
  state: GiftState
  /** True when this call is the one that actually tore the paper today. */
  justOpened: boolean
}

/**
 * Whether an anchor can be believed.
 *
 * An anchor that cannot be read, or one that has not happened yet, is treated
 * as if the box had never been opened: a broken row must not make the box look
 * unwrapped, and an anchor in the future would put the whole cycle in the
 * future and undo every tear of the day.
 */
function isUsableAnchor(anchor: string | undefined, today: string): boolean {
  if (!anchor || !parseDateKey(anchor)) return false
  return anchor <= today
}

/** The stored anchor of a box, or null if it has never been opened. */
function getAnchorDate(giftId: string, today: string): string | null {
  const row = db.prepare('SELECT anchor_date FROM gift_progress WHERE gift_id = ?').get(giftId) as
    | { anchor_date: string }
    | undefined
  if (!row) return null
  return isUsableAnchor(row.anchor_date, today) ? row.anchor_date : null
}

function hasOpenedOn(giftId: string, date: string): boolean {
  const row = db
    .prepare('SELECT 1 AS hit FROM gift_opens WHERE gift_id = ? AND open_date = ?')
    .get(giftId, date) as { hit: number } | undefined
  return row !== undefined
}

/** The gift date of a box in a given year, or null in a year it does not exist. */
function giftDateOf(giftId: string, year: number): CivilDate | null {
  const { month, day } = GIFTS[giftId]
  const candidate = { year, month, day }
  return isRealDate(candidate) ? candidate : null
}

/** The first gift date of a box on or after the given date. */
function nextGiftDate(giftId: string, from: CivilDate): CivilDate {
  // Eight years always covers the worst case for 29 February.
  for (let year = from.year; year <= from.year + 8; year++) {
    const candidate = giftDateOf(giftId, year)
    if (candidate && daysBetween(from, candidate) >= 0) return candidate
  }
  throw new Error('no gift date within eight years')
}

/** The gift date of a box before the given date. */
function previousGiftDate(giftId: string, before: CivilDate): CivilDate | null {
  for (let year = before.year - 1; year >= before.year - 8; year--) {
    const candidate = giftDateOf(giftId, year)
    if (candidate && daysBetween(candidate, before) > 0) return candidate
  }
  return null
}

/**
 * The cycle a box is in right now.
 *
 * The cycle ends at the next gift date. It starts on the day the box was
 * first opened, unless a gift date has passed since then -- then it starts on
 * the day after that gift date, so the wrapping begins again instead of the
 * box jumping back to how much was torn a year ago.
 */
function currentCycle(
  giftId: string,
  anchorDate: string | null,
  today: CivilDate
): { start: string | null; target: string } {
  const target = nextGiftDate(giftId, today)
  const targetKey = toDateKey(target)
  if (!anchorDate) return { start: null, target: targetKey }

  // The day after the gift date before this one: where a new cycle begins.
  const previous = previousGiftDate(giftId, target)
  const naturalStart = previous ? toDateKey(addDays(previous, 1)) : anchorDate
  const start = daysBetweenKeys(anchorDate, naturalStart) > 0 ? naturalStart : anchorDate
  return { start, target: targetKey }
}

/**
 * A box's current state, derived from the stored anchor and today's date.
 *
 * Nothing here depends on the requester, so both people always read the same
 * progress, and the answer is the same no matter which device asks.
 */
export function getGiftState(giftId: string, now: Date = new Date()): GiftState {
  const today = todayKey(now)
  const anchorDate = getAnchorDate(giftId, today)
  const openedToday = hasOpenedOn(giftId, today)
  const cycle = currentCycle(giftId, anchorDate, shanghaiCivilDate(now))

  const elapsedDays = cycle.start ? Math.max(0, daysBetweenKeys(cycle.start, today)) : 0
  const cycleDays = cycle.start ? Math.max(0, daysBetweenKeys(cycle.start, cycle.target)) : 0

  // Today's tear counts, so the paper comes off when the box is tapped.
  const torn = elapsedDays + (openedToday ? 1 : 0)
  // A box that has never been opened has no paper off it at all. On the day
  // the gift is due the whole of the paper is off, whatever the length of the
  // cycle -- a cycle of a single day would otherwise never be finished.
  const progress = !cycle.start
    ? 0
    : elapsedDays >= cycleDays
      ? 1
      : Math.max(0, Math.min(1, (Math.min(torn, cycleDays) - 1) / Math.max(1, cycleDays - 1)))

  return {
    giftId,
    anchorDate,
    cycleStart: cycle.start,
    targetDate: cycle.target,
    openedToday,
    elapsedDays,
    cycleDays,
    progress,
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
export function openGift(giftId: string, now: Date = new Date()): GiftOpenResult {
  const today = todayKey(now)
  const stamp = now.getTime()
  const cycle = currentCycle(giftId, getAnchorDate(giftId, today), shanghaiCivilDate(now))

  // The anchor and today's tear are written together, so a failure can never
  // leave an anchor without the tear it was created for.
  const tear = db.transaction((): boolean => {
    const stored = db
      .prepare('SELECT anchor_date FROM gift_progress WHERE gift_id = ?')
      .get(giftId) as { anchor_date: string } | undefined

    // A box that has never been opened, or whose anchor cannot be believed, is
    // anchored to today.
    if (!stored || !isUsableAnchor(stored.anchor_date, today)) {
      db.prepare(
        `INSERT INTO gift_progress (gift_id, anchor_date, created_at) VALUES (?, ?, ?)
         ON CONFLICT(gift_id) DO UPDATE SET anchor_date = excluded.anchor_date`
      ).run(giftId, today, stamp)
    }

    // The tears of cycles that are over are of no use any more.
    if (cycle.start) {
      db.prepare('DELETE FROM gift_opens WHERE gift_id = ? AND open_date < ?').run(giftId, cycle.start)
    }

    const result = db
      .prepare('INSERT OR IGNORE INTO gift_opens (gift_id, open_date, created_at) VALUES (?, ?, ?)')
      .run(giftId, today, stamp)
    return result.changes > 0
  })

  const justOpened = tear()
  return { state: getGiftState(giftId, now), justOpened }
}
