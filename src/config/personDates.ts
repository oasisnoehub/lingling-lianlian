import type { OccasionConfig } from '../utils/countdown'

export type PersonTheme = 'lingling' | 'lianlian'

/**
 * One person's countdown. Dates are intentionally kept here rather than in the
 * database, so both birthdays can be corrected by editing this file alone.
 */
export interface PersonDateConfig extends OccasionConfig {
  personId: string
  name: string
  theme: PersonTheme
  /** Shown beside the name, e.g. "1月11日". */
  dateLabel: string
  /** Emoji shown on the card, and highlighted on the day itself. */
  emoji: string
}

/**
 * `kind` decides the wording:
 *  - `gift` counts down to receiving a gift and never shows an age.
 *  - `birthday` counts down to a birthday and shows the age being turned.
 */
export const PERSON_DATES: readonly PersonDateConfig[] = [
  {
    personId: 'person-a',
    name: 'Lingling',
    theme: 'lingling',
    kind: 'gift',
    month: 1,
    day: 11,
    birthYear: 1998,
    dateLabel: '1月11日',
    emoji: '🎁',
  },
  {
    personId: 'person-b',
    name: 'Lianlian',
    theme: 'lianlian',
    kind: 'birthday',
    month: 6,
    day: 28,
    birthYear: 2000,
    dateLabel: '6月28日',
    emoji: '🎂',
  },
]
