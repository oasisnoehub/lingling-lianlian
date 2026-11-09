/**
 * Emoji helpers for the reaction input.
 *
 * The rules here mirror `server/routes/reactions.ts` exactly, so the client
 * rejects the same characters the server would, and a reaction typed on a
 * phone keyboard is accepted as-is.
 */

const EMOJI_ALLOWED =
  /^[0-9#*\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Presentation}\uFE0E\uFE0F\u20E3\u200D\u{E0020}-\u{E007E}\u{E007F}]{1,32}$/u
const EMOJI_BASE =
  /(?:[\p{Extended_Pictographic}\p{Regional_Indicator}]|[0-9#*]\uFE0F?\u20E3)/u

const BASE_CHAR = /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u
const MODIFIER_CHAR = /[\p{Emoji_Modifier}\uFE0E\uFE0F\u20E3\u{E0020}-\u{E007E}\u{E007F}]/u
const KEYCAP_BASE = /[0-9#*]/
const ZWJ = '\u200D'

/** True when the server would accept this string as a reaction. */
export function isValidEmoji(value: string): boolean {
  return EMOJI_ALLOWED.test(value) && EMOJI_BASE.test(value)
}

/**
 * Pulls the first emoji out of arbitrary text.
 *
 * The phone keyboard hands us the whole string, so a user may well type
 * a word along with the emoji. The scan keeps ZWJ sequences, flags, keycaps
 * and skin-tone modifiers together, because splitting them would produce a
 * string the server rejects.
 */
export function extractEmoji(text: string): string | null {
  const points = Array.from(text)

  for (let i = 0; i < points.length; i++) {
    const point = points[i]

    // Keycap: a digit or "#" / "*" followed by the combining keycap mark.
    if (KEYCAP_BASE.test(point) && points[i + 1] === '\uFE0F' && points[i + 2] === '\u20E3') {
      return points.slice(i, i + 3).join('')
    }

    if (!BASE_CHAR.test(point)) continue

    let end = i + 1
    // A regional indicator pair is one flag.
    if (/\p{Regional_Indicator}/u.test(point) && /\p{Regional_Indicator}/u.test(points[end] ?? '')) {
      end += 1
    }

    while (end < points.length) {
      const next = points[end]
      if (MODIFIER_CHAR.test(next)) {
        end += 1
        continue
      }
      // A ZWJ glues the next base character into the same emoji.
      if (next === ZWJ && BASE_CHAR.test(points[end + 1] ?? '')) {
        end += 2
        continue
      }
      break
    }

    const candidate = points.slice(i, end).join('')
    if (isValidEmoji(candidate)) return candidate
  }

  return null
}
