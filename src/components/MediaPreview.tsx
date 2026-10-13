import { useEffect } from 'react'
import { MediaItem } from '../types'

interface MediaPreviewProps {
  item: MediaItem
  onClose: () => void
}

function MediaPreview({ item, onClose }: MediaPreviewProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="media-modal" onClick={onClose}>
      <button className="media-modal-close" onClick={onClose}>
        ×
      </button>
      {item.type === 'image' ? (
        <img src={item.url} alt="" onClick={e => e.stopPropagation()} />
      ) : (
        <video
          src={item.url}
          controls
          autoPlay
          onClick={e => e.stopPropagation()}
        />
      )}
    </div>
  )
}

export default MediaPreview
