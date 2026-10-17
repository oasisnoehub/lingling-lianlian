/*
 * Countdown maths for the birthday and gift cards.
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
function isRealDate(year: number, month: number, day: number): boolean {
  const probe = new Date(Date.UTC(year, month - 1, day))
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
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
    if (!isRealDate(year, month, day)) continue
    const candidate = { year, month, day }
    if (daysBetween(today, candidate) >= 0) return candidate
  }
  // Unreachable for any real month/day; keeps the return type honest.
  return { year: today.year + 1, month, day }
}

export interface OccasionConfig {
  /** 1-12 */
  month: number
  /** 1-31 */
  day: number
  /** Used only to project an age for birthday countdowns. */
  birthYear: number
  kind: 'gift' | 'birthday'
}

export interface Countdown {
  /** 0 when the occasion falls today. */
  days: number
  /** Age being turned on the upcoming birthday; null for gift countdowns. */
  age: number | null
  isToday: boolean
  /** Within a week, counting today itself as day 0. */
  isImminent: boolean
  target: CivilDate
}

/** How close counts as "imminent" for the glow. */
export const IMMINENT_DAYS = 7

export function resolveCountdown(config: OccasionConfig, now: Date): Countdown {
  const today = shanghaiCivilDate(now)
  const target = nextOccurrence(today, config.month, config.day)
  const days = daysBetween(today, target)

  return {
    days,
    age: config.kind === 'birthday' ? target.year - config.birthYear : null,
    isToday: days === 0,
    isImminent: days >= 0 && days <= IMMINENT_DAYS,
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
