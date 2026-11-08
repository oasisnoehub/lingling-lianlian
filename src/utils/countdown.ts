/*
 * Countdown maths for the gift box.
 *
 * Everything works on *civil dates in Asia/Shanghai* rather than on instants,
 * so a countdown never shifts by a day depending on where the browser is. China
 * has observed a fixed UTC+8 with no daylight saving since 1991, which is what
 * makes the constant offset below exact rather than an approximation.
 */

const MS_PER_DAY = 86_400_000

/** Asia/Shanghai is a fixed UTC+8 (no DST since 1991). */
export const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

export interface CivilDate {
  year: number
  /** 1-12 */
  month: number
  /** 1-31 */
  day: number
}

/** The Shanghai calendar date that `now` falls on. */
export function shanghaiCivilDate(now: Date): CivilDate {
  const shifted = new Date(now.getTime() + SHANGHAI_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

/** Whole days from `from` to `to`; negative when `to` is in the past. */
export function daysBetween(from: CivilDate, to: CivilDate): number {
  const fromUtc = Date.UTC(from.year, from.month - 1, from.day)
  const toUtc = Date.UTC(to.year, to.month - 1, to.day)
  return Math.round((toUtc - fromUtc) / MS_PER_DAY)
}

/** Whether a month/day pair exists in that year (29 February only in leap years). */
function isRealDate(date: CivilDate): boolean {
  const probe = new Date(Date.UTC(date.year, date.month - 1, date.day))
  return (
    probe.getUTCFullYear() === date.year &&
    probe.getUTCMonth() === date.month - 1 &&
    probe.getUTCDate() === date.day
  )
}

/**
 * The first occurrence of `month`/`day` on or after `today`.
 *
 * The result is derived from `today` on every call, so a countdown rolls over
 * to next year by itself the day after it passes -- there is no stored target to
 * reset. Skipping years where the date does not exist keeps 29 February correct.
 */
export function nextOccurrence(today: CivilDate, month: number, day: number): CivilDate {
  // Eight years always covers the worst case for 29 February (a 4-year gap).
  for (let year = today.year; year <= today.year + 8; year++) {
    if (!isRealDate({ year, month, day })) continue
    const candidate = { year, month, day }
    if (daysBetween(today, candidate) >= 0) return candidate
  }
  // Unreachable for any real month/day; keeps the return type honest.
  return { year: today.year + 1, month, day }
}

/** "2026-01-11" -- the form every date the server sends comes in. */
export function parseDateKey(key: string): CivilDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
  if (date.month < 1 || date.month > 12 || date.day < 1 || date.day > 31) return null
  return isRealDate(date) ? date : null
}

export interface OccasionConfig {
  /** 1-12 */
  month: number
  /** 1-31 */
  day: number
}

export interface Countdown {
  /** 0 when the occasion falls today. */
  days: number
  isToday: boolean
  target: CivilDate
}

export function resolveCountdown(config: OccasionConfig, now: Date): Countdown {
  const today = shanghaiCivilDate(now)
  const target = nextOccurrence(today, config.month, config.day)
  const days = daysBetween(today, target)

  return {
    days,
    isToday: days === 0,
    target,
  }
}

/**
 * A countdown to a day that is already known, rather than looked up.
 *
 * The server decides when the gift is due, so the countdown is worked out
 * from the date it sends.
 */
export function countdownToTarget(target: CivilDate, now: Date): Countdown {
  const days = daysBetween(shanghaiCivilDate(now), target)
  return {
    days,
    isToday: days === 0,
    target,
  }
}

/**
 * Milliseconds until the next Asia/Shanghai midnight, so a caller can schedule
 * the day rollover itself instead of asking the user to refresh.
 */
export function msUntilNextShanghaiMidnight(now: Date): number {
  const { year, month, day } = shanghaiCivilDate(now)
  // Shanghai midnight for the following calendar day, expressed as a UTC instant.
  const nextMidnight = Date.UTC(year, month - 1, day + 1) - SHANGHAI_OFFSET_MS
  return Math.max(nextMidnight - now.getTime(), 0)
}
