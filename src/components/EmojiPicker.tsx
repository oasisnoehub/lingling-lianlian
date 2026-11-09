import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { RefObject } from 'react'
import EmojiPickerReact, { type EmojiClickData, Theme } from 'emoji-picker-react'
import { extractEmoji } from '../utils/emoji'
import { showToast } from './Toaster'

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
  const [typed, setTyped] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  // While the typed field has focus the popup must survive the scroll the
  // phone keyboard causes, otherwise the field is taken away mid-word.
  const [typing, setTyping] = useState(false)

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
    const handleScroll = () => {
      if (typing) return
      onClose()
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [onClose, typing])

  const handleEmojiClick = useCallback((emojiData: EmojiClickData) => {
    onEmojiSelectRef.current(emojiData.emoji)
  }, [])

  /**
   * The phone keyboard can type any emoji, so the typed value is scanned for
   * the first emoji in it. Anything that holds no emoji is rejected here
   * rather than being sent to the server.
   */
  const handleTypedSubmit = useCallback(() => {
    const emoji = extractEmoji(typed)
    if (!emoji) {
      setTyped('')
      showToast('请输入一个表情符号', 'error')
      return
    }
    setTyped('')
    onEmojiSelectRef.current(emoji)
  }, [typed])

  /**
   * Places the popup next to the trigger and keeps it fully on screen.
   *
   * The height is measured rather than guessed, because the popup grows when
   * the full emoji library is opened and shrinks again when it is closed.
   */
  const place = useCallback(() => {
    const trigger = triggerRef.current
    const popup = containerRef.current
    if (!trigger || !popup) return

    const rect = trigger.getBoundingClientRect()
    const height = popup.offsetHeight
    let left = rect.left + rect.width / 2 - PICKER_WIDTH / 2

    // Ensure left stays within viewport
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN
    if (left + PICKER_WIDTH > window.innerWidth - VIEWPORT_MARGIN) {
      left = window.innerWidth - PICKER_WIDTH - VIEWPORT_MARGIN
    }

    // On a phone the keyboard shrinks the visible area, so the popup is kept
    // inside what the user can actually see.
    const viewport = window.visualViewport
    const visibleTop = viewport ? viewport.offsetTop : 0
    const visibleBottom = viewport
      ? viewport.offsetTop + viewport.height
      : window.innerHeight

    let top = rect.bottom + GAP
    if (top + height > visibleBottom) {
      // Not enough room below: try above the button instead.
      const above = rect.top - GAP - height
      top = above >= visibleTop ? above : Math.max(visibleTop, visibleBottom - height)
    }
    if (top < visibleTop) top = visibleTop

    setPosition({ top, left })
  }, [triggerRef])

  // The popup has to be rendered before it can be measured, so it is placed
  // once it has a size, and again whenever its content changes.
  useLayoutEffect(() => {
    place()
  }, [place, expanded, typed])

  // The keyboard opening changes the visible area, so the popup follows it.
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const handleChange = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const visibleBottom = viewport.offsetTop + viewport.height
        if (rect.bottom > visibleBottom) {
          setPosition(prev => (prev ? { ...prev, top: Math.max(viewport.offsetTop, visibleBottom - rect.height) } : prev))
        }
      }
    }
    viewport.addEventListener('resize', handleChange)
    viewport.addEventListener('scroll', handleChange)
    return () => {
      viewport.removeEventListener('resize', handleChange)
      viewport.removeEventListener('scroll', handleChange)
    }
  }, [])

  const picker = (
    <div
      ref={containerRef}
      className="emoji-picker-overlay"
      style={{
        top: `${position?.top ?? 0}px`,
        left: `${position?.left ?? 0}px`,
        width: `${PICKER_WIDTH}px`,
        // Hidden until it has been measured and placed, so it never flashes
        // at the wrong spot on the first frame.
        visibility: position ? 'visible' : 'hidden',
      }}
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

      <div className="emoji-picker-input-row">
        <input
          ref={inputRef}
          className="emoji-picker-input"
          type="text"
          inputMode="text"
          autoComplete="off"
          placeholder="输入任意表情…"
          value={typed}
          onChange={e => setTyped(e.target.value)}
          onFocus={() => setTyping(true)}
          onBlur={() => setTyping(false)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleTypedSubmit()
            }
          }}
        />
        <button
          type="button"
          className="emoji-picker-send"
          onClick={handleTypedSubmit}
          disabled={!typed.trim()}
          title="发送这个表情"
        >
          发送
        </button>
      </div>

      {expanded && (
        <div className="emoji-picker-content">
          <EmojiPickerReact
            onEmojiClick={handleEmojiClick}
            theme={Theme.LIGHT}
            width={PICKER_WIDTH - 16}
            height={320}
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
  )

  // Use portal to render at body level, avoiding parent stacking contexts
  return createPortal(picker, document.body)
}
