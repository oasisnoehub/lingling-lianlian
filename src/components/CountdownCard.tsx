import { memo, useId } from 'react'
import type { PersonDateConfig } from '../config/personDates'
import type { Countdown } from '../utils/countdown'

interface CountdownCardProps {
  config: PersonDateConfig
  countdown: Countdown
}

/** Wording for the countdown line. Gift cards never mention an age. */
function buildMessage(config: PersonDateConfig, countdown: Countdown): string {
  const { name, kind } = config

  if (kind === 'gift') {
    return countdown.isToday
      ? `今天 ${name} 收到礼物啦`
      : `距离 ${name} 收到礼物还有 ${countdown.days} 天`
  }

  return countdown.isToday
    ? `今天是 ${name} 的生日`
    : `距离 ${name} ${countdown.age} 岁生日还有 ${countdown.days} 天`
}

/**
 * A single person's countdown card. Presentational only -- all date maths is
 * passed in already resolved, so the same card serves either theme or occasion.
 */
const CountdownCard = memo(function CountdownCard({ config, countdown }: CountdownCardProps) {
  const headingId = useId()

  const state = countdown.isToday ? 'today' : countdown.isImminent ? 'imminent' : 'normal'
  const message = buildMessage(config, countdown)

  return (
    <article
      className="countdown-card"
      data-theme={config.theme}
      data-state={state}
      aria-labelledby={headingId}
    >
      <div className="countdown-card-header">
        <span className="countdown-emoji" aria-hidden="true">
          {config.emoji}
        </span>
        <h2 id={headingId} className="countdown-name">
          {config.name}
        </h2>
        <span className="countdown-date">{config.dateLabel}</span>
      </div>

      {/* Announced once a day, when the midnight rollover changes the count. */}
      <p className="countdown-message" aria-live="polite">
        {message}
      </p>

      {countdown.age !== null && (
        <p className="countdown-age">
          即将 {countdown.age} 岁
        </p>
      )}

      {countdown.isToday && (
        <span className="countdown-badge">就是今天</span>
      )}
    </article>
  )
})

export default CountdownCard
