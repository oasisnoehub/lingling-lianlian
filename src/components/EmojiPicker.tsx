import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { RefObject } from 'react'
import EmojiPickerReact, { type EmojiClickData, Theme } from 'emoji-picker-react'

interface EmojiPickerProps {
  /** Reference to the button that triggers this picker */
  triggerRef: RefObject<HTMLElement>
  onEmojiSelect: (emoji: string) => void
  onClose: () => void
  /** When provided, the popup offers a button to withdraw the current reaction. */
  onRemove?: () => void
}

/** The reactions people actually reach for, available without loading the picker. */
const QUICK_EMOJIS = ['❤️', '💞', '😂', '🥰', '👍', '😭']

const PICKER_WIDTH = 280
const PICKER_HEIGHT = 260
const GAP = 6
const VIEWPORT_MARGIN = 12

/**
 * Emoji picker popup using emoji-picker-react (React-native, production-ready).
 * The common reactions sit in a bar that renders instantly;
 * the full picker is shown below for more options.
 */
export default function EmojiPicker({
  triggerRef,
  onEmojiSelect,
  onClose,
  onRemove,
}: EmojiPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const [expanded, setExpanded] = useState(false)

  // Kept in a ref so re-renders don't tear down and re-create the picker.
  const onEmojiSelectRef = useRef(onEmojiSelect)
  useEffect(() => {
    onEmojiSelectRef.current = onEmojiSelect
  }, [onEmojiSelect])

  // Click outside closes the popup.
  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [onClose])

  // Escape closes the popup.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Scroll closes the popup.
  useEffect(() => {
    const handleScroll = () => onClose()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [onClose])

  const handleEmojiClick = useCallback((emojiData: EmojiClickData) => {
    onEmojiSelectRef.current(emojiData.emoji)
  }, [])

  // Calculate position when container is mounted
  useEffect(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      let top: number
      let left = rect.left + rect.width / 2 - PICKER_WIDTH / 2

      // Ensure left stays within viewport
      if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN
      if (left + PICKER_WIDTH > window.innerWidth - VIEWPORT_MARGIN) {
        left = window.innerWidth - PICKER_WIDTH - VIEWPORT_MARGIN
      }

      // Default: show directly below the button
      top = rect.bottom + GAP

      setPosition({ top, left })
    }
  }, [triggerRef])

  const picker = position ? (
    <div
      ref={containerRef}
      className="emoji-picker-overlay"
      style={{ top: `${position.top}px`, left: `${position.left}px`, width: `${PICKER_WIDTH}px` }}
      role="dialog"
      aria-label="选择表情回应"
    >
      <div className="emoji-picker-quick-bar">
        {QUICK_EMOJIS.map(emoji => (
          <button
            key={emoji}
            type="button"
            className="emoji-quick-btn"
            onClick={() => onEmojiSelect(emoji)}
            title={emoji}
          >
            {emoji}
          </button>
        ))}

        <span className="emoji-picker-divider" />

        <button
          type="button"
          className="emoji-quick-btn emoji-quick-toggle"
          onClick={() => setExpanded(prev => !prev)}
          aria-expanded={expanded}
          title={expanded ? '收起更多表情' : '展开更多表情'}
        >
          {expanded ? '收起' : '更多'}
        </button>

        {onRemove && (
          <button
            type="button"
            className="emoji-quick-btn emoji-quick-remove"
            onClick={onRemove}
            title="取消我的回应"
          >
            🗑
          </button>
        )}
      </div>

      {expanded && (
        <div className="emoji-picker-content">
          <EmojiPickerReact
            onEmojiClick={handleEmojiClick}
            theme={Theme.LIGHT}
            width={PICKER_WIDTH - 16}
            height={200}
            emojiVersion="15"
            searchDisabled
            skinTonesDisabled
            previewConfig={{
              showPreview: false,
            }}
          />
        </div>
      )}
    </div>
  ) : null

  // Use portal to render at body level, avoiding parent stacking contexts
  return createPortal(picker, document.body)
}
