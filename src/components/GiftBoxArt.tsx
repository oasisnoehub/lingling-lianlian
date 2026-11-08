import type { CSSProperties } from 'react'
import giftClosed from '../assets/gift-closed.webp'
import giftPeeling from '../assets/gift-peeling.webp'
import giftClosedSun from '../assets/gift-closed-sun.webp'
import giftPeelingSun from '../assets/gift-peeling-sun.webp'
import giftTear from '../assets/gift-tear.webp'

/*
 * The gift box is a painting, not a drawing. The picture in src/assets is
 * cut from the original in the project root so that the body of the box has
 * the same width and the bottom of the box stands on the same line, and the
 * torn paper that comes off it is a layer of its own: the ragged hole in the
 * ribbon and the scrap hanging from it, cut out of the torn painting.
 *
 * The tears are therefore real paper, not a picture being scaled or faded:
 * every day one of them opens a little further along the ribbon, and the
 * paper that is already torn stays torn.
 */

/** The two pictures of the box itself. */
export type GiftArtState = 'closed' | 'peeling'

/**
 * How the wrapping paper is printed.
 *
 * The plain pictures are the painting as it was painted: a night sky with a
 * moon and stars over the box. The sun pictures are the same painting with
 * the night taken off it -- the moon and the stars are painted out and a
 * golden sun and white clouds are painted in their place -- and the whole
 * thing is turned to the pink of the lianlian theme.
 */
export type GiftPaperPattern = 'plain' | 'sun'

const PICTURES: Record<GiftPaperPattern, { state: GiftArtState; src: string }[]> = {
  plain: [
    { state: 'closed', src: giftClosed },
    { state: 'peeling', src: giftPeeling },
  ],
  sun: [
    { state: 'closed', src: giftClosedSun },
    { state: 'peeling', src: giftPeelingSun },
  ],
}

/**
 * Where the paper has been torn, in the coordinates of the cut picture.
 *
 * The tear walks along the ribbon towards the left, and the first spot is
 * the tear the painter drew in the torn painting, so the box starts out
 * exactly as it was painted and grows more ragged from there. The pieces
 * after the first are turned a little and are not quite the same size, so
 * the ribbon does not look as if it was cut with a stamp.
 */
export const TEAR_SPOTS: readonly { x: number; y: number; angle: number; size: number; flip: boolean }[] = [
  { x: 330, y: 299, angle: 0, size: 1, flip: false },
  { x: 278, y: 290.8, angle: -3, size: 0.92, flip: true },
  { x: 226, y: 282.6, angle: 2.5, size: 0.86, flip: false },
  { x: 174, y: 274.4, angle: -2, size: 0.95, flip: true },
  { x: 122, y: 266.2, angle: 3, size: 0.88, flip: false },
  { x: 70, y: 258, angle: -3.5, size: 0.93, flip: true },
]

/**
 * The ragged edge of a tear, as points around the middle of the torn paper.
 * The tear opens out from the line where the ribbon is broken, so this shape
 * is what grows: at its full size it covers the whole torn paper.
 */
const TEAR_EDGE: readonly { x: number; y: number }[] = [
  { x: -0.84, y: -0.48 },
  { x: -0.36, y: -0.8 },
  { x: 0.16, y: -0.88 },
  { x: 0.68, y: -0.64 },
  { x: 0.92, y: -0.12 },
  { x: 0.8, y: 0.44 },
  { x: 0.32, y: 0.84 },
  { x: -0.28, y: 0.88 },
  { x: -0.76, y: 0.52 },
  { x: -0.96, y: 0.0 },
]

/** How much of a tear is showing: 0 is nothing, 1 is the whole tear. */
function tearScale(growth: number): number {
  return 0.12 + 0.88 * Math.max(0, Math.min(1, growth))
}

/** The shape of the tear at a given size, used to cut the paper open. */
function tearClip(scale: number): string {
  const points = TEAR_EDGE.map(point => {
    const x = (46 + point.x * 50 * scale).toFixed(2)
    const y = (50 + point.y * 50 * scale).toFixed(2)
    return `${x}% ${y}%`
  })
  return `polygon(${points.join(', ')})`
}

interface GiftBoxArtProps {
  /**
   * How much paper is off the box, in tears. The whole number is the tears
   * that are done; the fraction is the one that is still being torn.
   */
  tears: number
  /** True while the newest tear is being made. */
  tearing: boolean
  /** How much paper was off before this tear, so it can open out of it. */
  tearsBefore?: number
  /** How the wrapping paper is printed. */
  pattern?: GiftPaperPattern
}

interface GiftConfettiPiece {
  shape: 'star' | 'heart' | 'sparkle' | 'leaf'
  /** Where the piece starts, in percent of the box. */
  x: number
  y: number
  /** How far it flies, in px. */
  dx: number
  dy: number
  /** How far it turns, in degrees. */
  rotate: number
  delay: number
  scale: number
}

/** The loose shapes that float around the box on the day itself. */
const CONFETTI: GiftConfettiPiece[] = [
  { shape: 'star', x: 16, y: 44, dx: -30, dy: -58, rotate: -40, delay: 0, scale: 1 },
  { shape: 'heart', x: 32, y: 34, dx: -12, dy: -70, rotate: 22, delay: 0.08, scale: 0.8 },
  { shape: 'sparkle', x: 50, y: 30, dx: 6, dy: -80, rotate: 0, delay: 0.04, scale: 1.1 },
  { shape: 'heart', x: 68, y: 34, dx: 20, dy: -68, rotate: -26, delay: 0.12, scale: 0.75 },
  { shape: 'star', x: 84, y: 44, dx: 32, dy: -54, rotate: 46, delay: 0.06, scale: 0.9 },
  { shape: 'leaf', x: 38, y: 50, dx: -24, dy: -46, rotate: 30, delay: 0.16, scale: 0.8 },
  { shape: 'leaf', x: 64, y: 50, dx: 26, dy: -44, rotate: -34, delay: 0.2, scale: 0.75 },
]

const CONFETTI_SHAPES = {
  star: 'M12 1.6 L14.9 8.9 L22.7 9.4 L16.7 14.3 L18.7 21.9 L12 17.7 L5.3 21.9 L7.3 14.3 L1.3 9.4 L9.1 8.9 Z',
  heart:
    'M12 21.2 C12 21.2 2.9 14.7 2.9 8.9 C2.9 5.8 5.3 3.4 8.2 3.4 C10 3.4 11.3 4.4 12 5.8 ' +
    'C12.7 4.4 14 3.4 15.8 3.4 C18.7 3.4 21.1 5.8 21.1 8.9 C21.1 14.7 12 21.2 12 21.2 Z',
  sparkle:
    'M12 1 C12.6 6.4 17.6 11.4 23 12 C17.6 12.6 12.6 17.6 12 23 C11.4 17.6 6.4 12.6 1 12 C6.4 11.4 11.4 6.4 12 1 Z',
  leaf: 'M20 3 C20 12 14 18 4 20 C4 11 10 5 20 3 Z M4 20 L15 9',
} as const

interface GiftConfettiProps {
  /** Bumped on every click so the burst plays again. */
  burst: number
  /** Reduced motion: the shapes show up, they just do not fly. */
  still?: boolean
}

/** The stars, hearts and leaves that come out of the box on the day. */
export function GiftConfetti({ burst, still = false }: GiftConfettiProps) {
  if (burst <= 0) return null

  return (
    <div
      className={still ? 'gift-confetti gift-confetti--still' : 'gift-confetti'}
      key={burst}
      aria-hidden="true"
    >
      {CONFETTI.map((piece, index) => (
        <svg
          key={index}
          className="gift-confetti-piece"
          viewBox="0 0 24 24"
          style={
            {
              left: piece.x + '%',
              top: piece.y + '%',
              '--tx': piece.dx + 'px',
              '--ty': piece.dy + 'px',
              '--rot': piece.rotate + 'deg',
              '--delay': piece.delay + 's',
              '--scale': piece.scale,
            } as CSSProperties
          }
        >
          <path
            d={CONFETTI_SHAPES[piece.shape]}
            fill={
              piece.shape === 'heart'
                ? '#E4715A'
                : piece.shape === 'leaf'
                  ? '#7B8B5B'
                  : piece.shape === 'star'
                    ? '#DFA743'
                    : '#F4E6C2'
            }
            stroke="#2F4A6D"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </div>
  )
}

/**
 * The box itself: the picture of it, the tears in its wrapping paper, and
 * the scrap of paper that comes off while a tear is being made.
 */
export default function GiftBoxArt({ tears, tearing, tearsBefore, pattern = 'plain' }: GiftBoxArtProps) {
  const done = Math.floor(tears)
  const growth = tears - done

  // The tear that is being made right now: the one that is still opening,
  // or the one that has just been finished.
  const freshIndex = growth > 0 ? done : done - 1

  const marks = []
  for (let index = 0; index < TEAR_SPOTS.length; index++) {
    if (index < done) {
      marks.push({ spot: TEAR_SPOTS[index], scale: tearScale(1), fresh: false, from: tearClip(tearScale(1)) })
    } else if (index === done && growth > 0) {
      marks.push({ spot: TEAR_SPOTS[index], scale: tearScale(growth), fresh: false, from: tearClip(tearScale(growth)) })
    } else {
      break
    }
  }

  // The tear that is being made opens out of where it was before it.
  const freshMark = marks[freshIndex]
  if (tearing && freshMark) {
    // Without a yesterday to start from, the tear opens from nothing.
    const before = tearsBefore === undefined ? tearScale(0) : tearScale(tearsBefore - freshIndex)
    freshMark.fresh = true
    freshMark.from = tearClip(before)
  }
  const fresh = tearing ? freshMark : undefined

  return (
    <span className="gift-art">
      {PICTURES[pattern].map(picture => (
        <img
          key={picture.state}
          className="gift-art-layer"
          data-state={picture.state}
          src={picture.src}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      ))}

      {marks.map((mark, index) => (
        <span
          key={index}
          className={mark.fresh ? 'gift-tear gift-tear--fresh' : 'gift-tear'}
          style={
            {
              '--tear-x': mark.spot.x,
              '--tear-y': mark.spot.y,
              '--tear-angle': mark.spot.angle + 'deg',
              '--tear-size': mark.spot.size,
              '--tear-flip': mark.spot.flip ? -1 : 1,
              '--tear-clip': tearClip(mark.scale),
              '--tear-from': mark.from,
            } as CSSProperties
          }
        >
          <img src={giftTear} alt="" aria-hidden="true" draggable={false} />
        </span>
      ))}

      {fresh && (
        <>
          <span
            className="gift-scrap"
            style={
              {
                '--tear-x': fresh.spot.x,
                '--tear-y': fresh.spot.y,
                '--tear-scale': fresh.scale,
              } as CSSProperties
            }
            aria-hidden="true"
          >
            {/* A chip of the wrapping paper, torn along its edge. */}
            <svg viewBox="0 0 20 22">
              <path
                d="M3 4 L7 2 L9 5 L13 3 L14 7 L18 8 L15 11 L17 15 L12 16 L10 20 L6 17 L2 16 L4 12 L1 9 Z"
                fill="#FBF4E3"
                stroke="#C9B591"
                strokeWidth="0.9"
                strokeLinejoin="round"
              />
            </svg>
          </span>

          <span
            className="gift-scrap gift-scrap--small"
            style={
              {
                '--tear-x': fresh.spot.x,
                '--tear-y': fresh.spot.y,
                '--tear-scale': fresh.scale,
              } as CSSProperties
            }
            aria-hidden="true"
          >
            <svg viewBox="0 0 12 12">
              <path
                d="M2 3 L6 1 L9 4 L7 7 L10 9 L5 11 L2 8 L4 6 Z"
                fill="#F8F0DE"
                stroke="#C9B591"
                strokeWidth="0.8"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </>
      )}
    </span>
  )
}
