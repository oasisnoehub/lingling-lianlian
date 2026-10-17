import { memo } from 'react'
import { Reaction } from '../api/client'

interface ReactionBubbleProps {
  reaction: Reaction
  /** Person name for the tooltip; may be empty if the name is not known yet. */
  personName: string
}

/** Matches the theme each person's timeline is drawn in. */
function themeForPerson(personId: string): 'lingling' | 'lianlian' {
  return personId === 'person-b' ? 'lianlian' : 'lingling'
}

/**
 * Single reaction bubble - iMessage style
 * Shows emoji with person-specific colored border
 */
const ReactionBubble = memo(function ReactionBubble({
  reaction,
  personName,
}: ReactionBubbleProps) {
  const theme = themeForPerson(reaction.person_id)

  return (
    <div
      className={`reaction-bubble reaction-bubble-${theme}`}
      title={personName ? `${personName}: ${reaction.emoji}` : reaction.emoji}
    >
      <span className="reaction-emoji">{reaction.emoji}</span>
    </div>
  )
})

export default ReactionBubble
