import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, Reaction, deleteReaction, upsertReaction } from '../api/client'
import { showToast } from './Toaster'
import EmojiPicker from './EmojiPicker'
import ReactionBubble from './ReactionBubble'

interface ReactionSelectorProps {
  postId: string
  currentPersonId: string
  /** Display names by person id, used for the reaction tooltips. */
  personNames: Record<string, string>
  reactions: Reaction[]
  onReactionChange: (postId: string, next: Reaction[]) => void
  /** Called just before each write, so a polling refresh can stand down. */
  onReactionWrite?: () => void
}

/**
 * iMessage-style reactions for one post: one reaction per person, shown as a
 * bubble, toggled through a quick-pick popup. Every change is applied locally
 * first and rolled back if the request fails.
 */
export default function ReactionSelector({
  postId,
  currentPersonId,
  personNames,
  reactions,
  onReactionChange,
  onReactionWrite,
}: ReactionSelectorProps) {
  const [showPicker, setShowPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const myReaction = reactions.find(r => r.person_id === currentPersonId)
  const otherReaction = reactions.find(r => r.person_id !== currentPersonId)

  /** The other person's reactions, with mine stripped out. */
  const othersReactions = useCallback(
    () => reactions.filter(r => r.person_id !== currentPersonId),
    [reactions, currentPersonId]
  )

  const removeReaction = useCallback(async () => {
    if (!myReaction) return
    setShowPicker(false)

    const previous = reactions
    onReactionChange(postId, othersReactions())
    setSaving(true)
    onReactionWrite?.()
    try {
      await deleteReaction(postId)
    } catch (err) {
      console.error('Failed to delete reaction:', err)
      showToast(err instanceof ApiError ? err.message : '取消失败，请重试', 'error')
      onReactionChange(postId, previous)
    } finally {
      setSaving(false)
    }
  }, [postId, myReaction, reactions, onReactionChange, onReactionWrite, othersReactions])

  const handleEmojiSelect = useCallback(async (emoji: string) => {
    // Re-picking the emoji that is already there withdraws it, as in iMessage.
    if (myReaction?.emoji === emoji) {
      await removeReaction()
      return
    }

    setShowPicker(false)

    const previous = reactions
    const optimistic: Reaction = {
      id: myReaction?.id ?? `temp-${Date.now()}`,
      post_id: postId,
      person_id: currentPersonId,
      emoji,
      created_at: myReaction?.created_at ?? Date.now(),
      updated_at: Date.now(),
    }
    onReactionChange(postId, [...othersReactions(), optimistic])

    setSaving(true)
    onReactionWrite?.()
    try {
      await upsertReaction(postId, emoji)
    } catch (err) {
      console.error('Failed to save reaction:', err)
      showToast(err instanceof ApiError ? err.message : '保存失败，请重试', 'error')
      onReactionChange(postId, previous)
    } finally {
      setSaving(false)
    }
  }, [
    postId,
    currentPersonId,
    myReaction,
    reactions,
    onReactionChange,
    onReactionWrite,
    othersReactions,
    removeReaction,
  ])

  // The popup is positioned in viewport coordinates, so it has to close rather
  // than drift away from the button when the page scrolls.
  useEffect(() => {
    if (!showPicker) return

    const handleScroll = () => setShowPicker(false)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [showPicker])

  return (
    <div className="reaction-selector">
      {/* Other person's reaction - shown as bubble */}
      {otherReaction && (
        <ReactionBubble
          reaction={otherReaction}
          personName={personNames[otherReaction.person_id] ?? ''}
        />
      )}

      {/* Trigger button - shows my reaction emoji, or placeholder if none */}
      <button
        ref={buttonRef}
        type="button"
        className={`reaction-trigger-btn${myReaction ? ' has-reaction' : ''}${saving ? ' is-saving' : ''}`}
        onClick={() => setShowPicker(prev => !prev)}
        onContextMenu={event => {
          if (!myReaction) return
          event.preventDefault()
          void removeReaction()
        }}
        aria-label={myReaction ? `你的回应 ${myReaction.emoji}，点击更换` : '添加表情回应'}
        aria-expanded={showPicker}
        title={myReaction ? '点击更换表情' : '添加表情回应'}
      >
        {myReaction ? myReaction.emoji : <span className="reaction-trigger-placeholder">☺</span>}
      </button>

      {showPicker && buttonRef.current && (
        <EmojiPicker
          anchorRect={buttonRef.current.getBoundingClientRect()}
          onEmojiSelect={emoji => void handleEmojiSelect(emoji)}
          onRemove={myReaction ? () => void removeReaction() : undefined}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
