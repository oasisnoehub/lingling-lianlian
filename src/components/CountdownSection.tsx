import { useCallback, useEffect, useRef, useState } from 'react'
import { PERSON_DATES } from '../config/personDates'
import { msUntilNextShanghaiMidnight } from '../utils/countdown'
import GiftBox from './GiftBox'

/**
 * The gift countdown strip.
 *
 * The rollover is scheduled against Asia/Shanghai midnight rather than the
 * browser's local midnight, so the box updates on its own no matter where
 * the device is or which timezone it reports.
 *
 * On a narrow screen there is only room for one box, so the strip is a
 * carousel: the boxes are swiped sideways, and the dot underneath says which
 * one is showing. On a wide screen both boxes stand side by side and there is
 * nothing to switch.
 */
export default function CountdownSection({ currentPersonId }: { currentPersonId: string }) {
  const [now, setNow] = useState(() => new Date())
  const stripRef = useRef<HTMLElement>(null)
  const [active, setActive] = useState(0)

  // The box of the person who is logged in comes first; the other one follows.
  const boxes = [...PERSON_DATES].sort(
    (a, b) => Number(b.personId === currentPersonId) - Number(a.personId === currentPersonId)
  )

  // The box in the middle of the strip is the one being looked at.
  const handleScroll = useCallback(() => {
    const strip = stripRef.current
    if (!strip) return
    const width = strip.clientWidth
    if (width <= 0) return
    const index = Math.round(strip.scrollLeft / width)
    setActive(index)
  }, [])

  useEffect(() => {
    const strip = stripRef.current
    if (!strip) return
    strip.addEventListener('scroll', handleScroll, { passive: true })
    return () => strip.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  function showBox(index: number) {
    const strip = stripRef.current
    if (!strip) return
    strip.scrollTo({ left: index * strip.clientWidth, behavior: 'smooth' })
  }

  useEffect(() => {
    let timer: number | undefined

    function scheduleRollover() {
      const delay = msUntilNextShanghaiMidnight(new Date())
      // The small buffer lands just after the rollover rather than just before,
      // where a millisecond of clock skew would still show yesterday's count.
      timer = window.setTimeout(() => {
        setNow(new Date())
        scheduleRollover()
      }, delay + 50)
    }

    scheduleRollover()

    // Background tabs throttle timers, so re-read the clock on the way back.
    function handleVisibility() {
      if (document.visibilityState === 'visible') setNow(new Date())
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  return (
    <div className="countdown">
      <section className="countdown-section" ref={stripRef} aria-label="礼物倒计时">
        {boxes.map(config => (
          <GiftBox key={config.giftId} config={config} now={now} currentPersonId={currentPersonId} />
        ))}
      </section>

      {/* Which box the strip is showing. The dots are the way to switch on a
          screen that cannot be swiped. */}
      {boxes.length > 1 && (
        <div className="countdown-dots">
          {boxes.map((box, index) => (
            <button
              key={box.giftId}
              type="button"
              className="countdown-dot"
              data-active={index === active ? 'true' : 'false'}
              onClick={() => showBox(index)}
              aria-label={'查看 ' + box.name + ' 的礼物盒'}
            />
          ))}
        </div>
      )}
    </div>
  )
}
