/*
 * Civil-date helpers for Asia/Shanghai.
 *
 * This is a deliberate mirror of src/utils/countdown.ts. The two trees
 * cannot share a module: tsconfig.server.json pins rootDir to server/ and the
 * Dockerfile compiles the server on its own, so anything imported from src/
 * would break the image build. Keep the offset and the day maths in step with
 * the client copy -- scripts/smoke.mjs checks that the two agree.
 */

const MS_PER_DAY = 86_400_000

/** Asia/Shanghai is a fixed UTC+8 (no daylight saving since 1991). */
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

function pad2(value: number): string {
  return value < 10 ? '0' + value : String(value)
}

/** "2026-01-11" -- the sortable form every stored date uses. */
export function toDateKey(date: CivilDate): string {
  return `${date.year}-${pad2(date.month)}-${pad2(date.day)}`
}

/** The Shanghai date `now` falls on, as a date key. */
export function todayKey(now: Date = new Date()): string {
  return toDateKey(shanghaiCivilDate(now))
}

export function parseDateKey(key: string): CivilDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  if (!isRealDate({ year, month, day })) return null
  return { year, month, day }
}

/** Whether a month and day exist in that year (29 February only in leap years). */
export function isRealDate(date: CivilDate): boolean {
  const probe = new Date(Date.UTC(date.year, date.month - 1, date.day))
  return (
    probe.getUTCFullYear() === date.year &&
    probe.getUTCMonth() === date.month - 1 &&
    probe.getUTCDate() === date.day
  )
}

/** Whole days from one date to another; negative when `to` is earlier. */
export function daysBetween(from: CivilDate, to: CivilDate): number {
  const fromUtc = Date.UTC(from.year, from.month - 1, from.day)
  const toUtc = Date.UTC(to.year, to.month - 1, to.day)
  return Math.round((toUtc - fromUtc) / MS_PER_DAY)
}

/** The date a number of days after this one. */
export function addDays(date: CivilDate, days: number): CivilDate {
  const stamp = Date.UTC(date.year, date.month - 1, date.day) + days * MS_PER_DAY
  const shifted = new Date(stamp)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

/**
 * Whole days from one date key to another; negative when `to` is earlier.
 *
 * An unreadable key counts as zero days instead of throwing: one corrupt row
 * must never be able to take the timeline down.
 */
export function daysBetweenKeys(from: string, to: string): number {
  const a = parseDateKey(from)
  const b = parseDateKey(to)
  if (!a || !b) return 0
  const fromUtc = Date.UTC(a.year, a.month - 1, a.day)
  const toUtc = Date.UTC(b.year, b.month - 1, b.day)
  return Math.round((toUtc - fromUtc) / MS_PER_DAY)
}
