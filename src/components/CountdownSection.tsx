import { useEffect, useState } from 'react'
import { PERSON_DATES } from '../config/personDates'
import { msUntilNextShanghaiMidnight, resolveCountdown } from '../utils/countdown'
import CountdownCard from './CountdownCard'

/**
 * The birthday and gift countdown strip.
 *
 * The rollover is scheduled against Asia/Shanghai midnight rather than the
 * browser's local midnight, so both cards update on their own no matter where
 * the device is or which timezone it reports.
 */
export default function CountdownSection() {
  const [now, setNow] = useState(() => new Date())

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
    <section className="countdown-section" aria-label="生日与礼物倒计时">
      {PERSON_DATES.map(config => (
        <CountdownCard
          key={config.personId}
          config={config}
          countdown={resolveCountdown(config, now)}
        />
      ))}
    </section>
  )
}
