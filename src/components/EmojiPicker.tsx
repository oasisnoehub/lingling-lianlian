import { useEffect, useRef, useState } from 'react'
import type { Picker } from 'emoji-picker-element'

interface EmojiPickerProps {
  /** Viewport rectangle of the button this popup is anchored to. */
  anchorRect: DOMRect | null
  onEmojiSelect: (emoji: string) => void
  onClose: () => void
  /** When provided, the popup offers a button to withdraw the current reaction. */
  onRemove?: () => void
}

/** The reactions people actually reach for, available without loading the picker. */
const QUICK_EMOJIS = ['❤️', '💞', '😂', '🥰', '👍', '😭']

const PICKER_WIDTH = 320
const PICKER_HEIGHT = 400
const QUICK_BAR_HEIGHT = 52
const GAP = 8
const VIEWPORT_MARGIN = 8

/**
 * Emoji picker popup. The common reactions sit in a bar that renders instantly;
 * the full `emoji-picker-element` grid is only imported if the user asks for it.
 */
export default function EmojiPicker({
  anchorRect,
  onEmojiSelect,
  onClose,
  onRemove,
}: EmojiPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const pickerRef = useRef<Picker | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  // Kept in a ref so re-renders don't tear down and re-create the loaded picker.
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

  // Load the full picker on first expand. It is a sizeable custom element, so
  // paying for it up front would slow down the quick reactions.
  useEffect(() => {
    if (!expanded || loadFailed) return
    let cancelled = false

    async function loadPicker() {
      try {
        const { Picker: EmojiPickerElement } = await import('emoji-picker-element')
        if (cancelled) return

        const picker = new EmojiPickerElement({ locale: 'zh-CN' })
        picker.addEventListener('emoji-click', event => {
          // `name` is the emoji's English shortname rather than a character, so
          // only `unicode` is usable as the stored reaction.
          const unicode = event.detail.unicode
          if (unicode) onEmojiSelectRef.current(unicode)
        })

        const host = containerRef.current?.querySelector('.emoji-picker-content')
        if (!host) {
          cancelled = true
          return
        }

        host.appendChild(picker)
        pickerRef.current = picker
      } catch (err) {
        console.error('Failed to load the emoji picker', err)
        setLoadFailed(true)
      }
    }

    void loadPicker()

    return () => {
      cancelled = true
      pickerRef.current?.remove()
      pickerRef.current = null
    }
  }, [expanded, loadFailed])

  // Anchor above the button when there is not enough room below it.
  const height = expanded && !loadFailed ? QUICK_BAR_HEIGHT + PICKER_HEIGHT : QUICK_BAR_HEIGHT
  let top = (anchorRect?.bottom ?? 0) + GAP
  let left = (anchorRect?.left ?? 0) + (anchorRect?.width ?? 0) / 2 - PICKER_WIDTH / 2

  left = Math.min(
    Math.max(left, VIEWPORT_MARGIN),
    Math.max(VIEWPORT_MARGIN, window.innerWidth - PICKER_WIDTH - VIEWPORT_MARGIN),
  )
  if (top + height > window.innerHeight - VIEWPORT_MARGIN) {
    top = Math.max(VIEWPORT_MARGIN, (anchorRect?.top ?? 0) - height - GAP)
  }

  return (
    <div
      ref={containerRef}
      className="emoji-picker-overlay"
      style={{ top: `${top}px`, left: `${left}px`, width: `${PICKER_WIDTH}px` }}
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
          {loadFailed && <p className="emoji-picker-error">表情库加载失败，请刷新页面重试</p>}
        </div>
      )}
    </div>
  )
}
