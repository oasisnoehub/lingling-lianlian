import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PersonDateConfig } from '../config/personDates'
import type { Countdown } from '../utils/countdown'
import { getGiftState, openGift, type GiftState } from '../api/client'
import { showToast } from './Toaster'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import GiftBoxArt, { GiftConfetti, TEAR_SPOTS, type GiftArtState } from './GiftBoxArt'

interface GiftBoxProps {
  config: PersonDateConfig
  countdown: Countdown
}

/** How often the shared state is re-read, so both people watch the same box. */
const POLL_INTERVAL = 20_000

/** Said on the day itself, next to the countdown. */
const GIFT_DAY_BLESSING = '愿所有期待都准时抵达'

/**
 * What the note says. Only the number of days is shown -- never a date --
 * and it only ever appears on the note.
 */
function buildMessage(countdown: Countdown): string {
  return countdown.isToday ? '今天' : countdown.days + ' 天'
}

/**
 * Which picture of the box shows.
 *
 * The lid only comes off on the day itself. Until then the box is the shut
 * one and the wrapping paper comes off it layer by layer.
 */
function artStateFor(isGiftDay: boolean): GiftArtState {
  return isGiftDay ? 'peeling' : 'closed'
}

/**
 * How much of the wrapping paper is off the box, in tears.
 *
 * The first tear is the one the painter drew, and the rest follow it along
 * the ribbon, one small piece at a time, until the day of the gift itself.
 * The calendar decides how far along the paper is, not how often somebody
 * happened to visit, so the box is torn the same amount for both people and
 * on every device.
 *
 * The length of the cycle and how far into it today is come from the server,
 * so the paper never jumps back to half-torn when the gift date passes and
 * the wrapping starts again for the next year.
 */
function tearCount(state: GiftState | null, asGiftDay = false): number {
  if (!state?.cycleStart) return 0

  // The days from the start of the cycle to the day of the gift.
  const total = state.cycleDays
  // The box was opened for the first time on the gift day itself: the whole
  // of the paper is off.
  if (total <= 0) return TEAR_SPOTS.length

  // Today's tear counts, so the paper comes off when the box is tapped.
  const elapsed = asGiftDay ? total : state.elapsedDays
  const torn = elapsed + (asGiftDay || state.openedToday ? 1 : 0)
  if (torn <= 0) return 0

  const beyond = (Math.min(torn, total) - 1) / Math.max(1, total - 1)
  return 1 + beyond * (TEAR_SPOTS.length - 1)
}

/**
 * A preview switch: ?gift=closed|peeling holds the box on one of the two
 * pictures, and ?tears=0..6 holds it on a number of tears, so the box can be
 * looked at without waiting for the calendar. It only picks the picture and
 * the tears -- the number of days and the shared progress are left exactly
 * as they are.
 */
function previewArtState(): GiftArtState | null {
  if (typeof window === 'undefined') return null
  const wanted = new URLSearchParams(window.location.search).get('gift')
  return wanted === 'closed' || wanted === 'peeling' ? wanted : null
}

/** How many tears the preview asks for, if it asks for any. */
function previewTears(): number | undefined {
  if (typeof window === 'undefined') return undefined
  const asked = new URLSearchParams(window.location.search).get('tears')
  if (asked === null) return undefined
  const wanted = Number(asked)
  return Number.isFinite(wanted) && wanted >= 0 ? wanted : undefined
}

/** Whether the preview asks for the tear to be watched being made. */
function previewTearing(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('tearing') === '1'
}

/**
 * A preview switch: ?giftday=1 shows the box as it looks on the day of the
 * gift itself, when the lid comes right off and the shapes come out of the
 * box. It only moves the picture, the tears and the number on the note -- the
 * shared progress is left exactly as it is.
 */
function previewGiftDay(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('giftday') === '1'
}

function previewCountdown(countdown: Countdown): Countdown {
  if (!previewGiftDay()) return countdown
  return { days: 0, isToday: true, target: countdown.target }
}

/**
 * Lingling's gift box.
 *
 * The box is closed until it is clicked. The first click of the day tears a
 * little wrapping off and lets the note with the countdown out of the box;
 * clicking again that day only shows the note, because the paper for that
 * day has already been torn.
 *
 * How much wrapping is off is decided by the server from the calendar, so a
 * reload, another device and the other person's timeline all agree, and a
 * few days away skip ahead instead of losing progress.
 */
export default function GiftBox({ config, countdown: realCountdown }: GiftBoxProps) {
  // The preview may show the last day, so the box reads one countdown.
  const countdown = previewCountdown(realCountdown)
  const [state, setState] = useState<GiftState | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'tear' | 'peek'>('idle')
  const [burst, setBurst] = useState(0)
  const [busy, setBusy] = useState(false)
  /** True while today's tear is being made. */
  const [tearing, setTearing] = useState(() => previewTearing())

  const reducedMotion = usePrefersReducedMotion()
  const boxRef = useRef<HTMLButtonElement>(null)
  const previewState = useMemo(() => previewArtState(), [])
  const previewTearCount = useMemo(() => previewTears(), [])
  const giftDayPreview = useMemo(() => previewGiftDay(), [])

  // A poll that was already on its way when the paper was torn can come back
  // with the older state, so a local change is stamped and stale answers are
  // dropped instead of undoing it.
  const localUpdateAt = useRef(0)
  /** How much paper was off before today's tear, so the new one opens out of it. */
  const tearsBeforeRef = useRef<number | undefined>(undefined)
  const tearTimer = useRef<number | undefined>(undefined)

  /** The day the gift is due: the box stands wide open. */
  const isGiftDay = countdown.isToday

  // On the day the box stands open, and stays open for the rest of the day.
  const celebrating = isGiftDay && (noteOpen || state?.openedToday === true)

  // The picture of the box: the lid comes off on the day itself, and the
  // preview switch can hold it on one of the two.
  const artState = previewState ?? artStateFor(isGiftDay)

  // How much paper is off the box, in tears.
  const tears = previewTearCount ?? tearCount(state, giftDayPreview)

  const applyState = useCallback((next: GiftState, local = false) => {
    if (!local && Date.now() - localUpdateAt.current < 5000) return
    setState(prev => {
      if (!prev) return next
      // An answer from an earlier day, or one that has not seen today's tear
      // yet, must not undo a tear that has already been made.
      if (next.today < prev.today) return prev
      if (next.today === prev.today && !next.openedToday && prev.openedToday) return prev
      return next
    })
  }, [])

  const refresh = useCallback(async () => {
    try {
      applyState(await getGiftState())
    } catch {
      /* The box still works without the shared state; it just stays local. */
    }
  }, [applyState])

  useEffect(() => {
    void refresh()

    const timer = window.setInterval(() => {
      if (document.hidden) return
      void refresh()
    }, POLL_INTERVAL)

    function handleVisibility() {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
    // The day rolled over (the parent re-resolves the countdown at Shanghai
    // midnight), so "already opened today" has to be read again.
  }, [countdown.days, refresh])

  useEffect(() => {
    if (!noteOpen) return

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null
      // The box keeps the note open; a click anywhere else folds it away.
      if (target && boxRef.current?.contains(target)) return
      setNoteOpen(false)
      setPhase('idle')
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [noteOpen])

  // The tear is only being made for a moment; when it is over the paper is
  // simply torn.
  useEffect(() => () => {
    if (tearTimer.current !== undefined) window.clearTimeout(tearTimer.current)
  }, [])

  async function handleClick() {
    if (busy) return

    setBusy(true)
    try {
      tearsBeforeRef.current = tears
      const result = await openGift()
      localUpdateAt.current = Date.now()
      applyState(result.state, true)
      if (result.justOpened) {
        // The paper comes off, then the note slides out of the box.
        setPhase('tear')
        setTearing(true)
        if (tearTimer.current !== undefined) window.clearTimeout(tearTimer.current)
        tearTimer.current = window.setTimeout(() => {
          setTearing(false)
          tearsBeforeRef.current = undefined
        }, 1100)
      } else {
        // Already torn today: the click only reads the countdown again.
        setPhase('peek')
        tearsBeforeRef.current = undefined
      }
      setNoteOpen(true)
      if (isGiftDay) setBurst(value => value + 1)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '打开礼物失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  const message = buildMessage(countdown)

  return (
    <section
      className="gift-panel"
      data-theme={config.theme}
      data-state={artState}
      data-phase={phase}
      data-celebrate={celebrating ? 'true' : 'false'}
      aria-label={config.name + ' 的礼物倒计时'}
    >
      <div className="gift-stage">
        <div className="gift-note" data-open={noteOpen ? 'true' : 'false'}>
          <p className="gift-note-text" role="status">
            {noteOpen ? message : ''}
          </p>
          {noteOpen && isGiftDay && <p className="gift-note-blessing">{GIFT_DAY_BLESSING}</p>}
        </div>

        <button
          type="button"
          ref={boxRef}
          className="gift-box"
          onClick={() => void handleClick()}
          aria-expanded={noteOpen}
          aria-label={'打开礼物盒，查看距离 ' + config.name + ' 收到礼物还有多少天'}
        >
          <GiftBoxArt tears={tears} tearing={tearing} tearsBefore={tearsBeforeRef.current} />
          <GiftConfetti burst={celebrating ? burst : 0} still={reducedMotion} />
        </button>
      </div>
    </section>
  )
}
