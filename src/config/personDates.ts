import type { OccasionConfig } from '../utils/countdown'

export type PersonTheme = 'lingling' | 'lianlian'

/**
 * One person's countdown. The date is intentionally kept here rather than in
 * the database, so it can be corrected by editing this file alone.
 *
 * The month and day are only a fallback for the moments before the server has
 * answered: the server decides when the gift is due and the box follows the
 * server. The gift id says which box this is.
 */
export interface PersonDateConfig extends OccasionConfig {
  personId: string
  name: string
  theme: PersonTheme
  /** The box this countdown is about. */
  giftId: string
  /** Shown beside the name, e.g. "1月11日". */
  dateLabel: string
}

/**
 * The countdowns on the timeline. Only Lingling's gift box is here for now;
 * a new entry is just a new object in this list.
 */
export const PERSON_DATES: readonly PersonDateConfig[] = [
  {
    personId: 'person-a',
    name: 'Lingling',
    theme: 'lingling',
    giftId: 'lingling-gift',
    month: 1,
    day: 11,
    dateLabel: '1月11日',
  },
]
