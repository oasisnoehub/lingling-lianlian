import { useState, useRef } from 'react'
import { Person, MediaItem } from '../types'

interface Emotion {
  emoji: string
  label: string
  id: string
}

interface PostInputProps {
  currentPerson: Person
  emotions: Emotion[]
  selectedEmotion: string
  onSelectEmotion: (id: string) => void
  onSubmit: (content: string, media: MediaItem[]) => void
  onImageUpload: (file: File) => Promise<MediaItem>
  onVideoUpload: (file: File) => Promise<MediaItem>
}

function PostInput({
  currentPerson,
  emotions,
  selectedEmotion,
  onSelectEmotion,
  onSubmit,
  onImageUpload,
  onVideoUpload,
}: PostInputProps) {
  const [content, setContent] = useState('')
  const [media, setMedia] = useState<MediaItem[]>([])
  const [uploading, setUploading] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadMedia(file, 'image')
    e.target.value = ''
  }

  async function handleVideoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadMedia(file, 'video')
    e.target.value = ''
  }

  async function uploadMedia(file: File, type: 'image' | 'video') {
    setUploading(true)
    try {
      const uploadFn = type === 'image' ? onImageUpload : onVideoUpload
      const item = await uploadFn(file)
      setMedia(prev => [...prev, item])
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
    }
  }

  function removeMedia(id: string) {
    setMedia(prev => prev.filter(m => m.id !== id))
  }

  function handleSubmit() {
    if (!content.trim() && media.length === 0) return
    onSubmit(content, media)
    setContent('')
    setMedia([])
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit()
    }
  }

  return (
    <div>
      {/* Input */}
      <div className="input-wrapper">
        <textarea
          className="input-field"
          placeholder="此刻在想什么……"
          value={content}
          onChange={e => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
        />
      </div>

      {/* Emotion Selector */}
      <div className="emotion-section">
        <span className="emotion-label">此刻心情</span>
        <div className="emotion-list">
          {emotions.map(emotion => (
            <button
              key={emotion.id}
              className={`emotion-pill ${selectedEmotion === emotion.id ? 'active' : ''}`}
              onClick={() => onSelectEmotion(selectedEmotion === emotion.id ? '' : emotion.id)}
            >
              <span className="emoji">{emotion.emoji}</span>
              <span>{emotion.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Media Preview */}
      {media.length > 0 && (
        <div className="media-preview-list">
          {media.map(item => (
            <div key={item.id} className="media-preview-item">
              {item.type === 'image' ? (
                <img src={item.url} alt="" />
              ) : (
                <video src={item.url} />
              )}
              <button
                className="media-preview-remove"
                onClick={() => removeMedia(item.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Attachments */}
      <div className="attachment-row">
        <label className="attachment-btn">
          <span>⊕</span>
          <span>照片</span>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleImageSelect}
          />
        </label>
        <label className="attachment-btn">
          <span>⌂</span>
          <span>添加位置</span>
        </label>
      </div>

      {/* Submit Button */}
      <button
        className="submit-btn"
        onClick={handleSubmit}
        disabled={uploading || (!content.trim() && media.length === 0)}
      >
        <span>✈️</span>
        <span>发布此刻</span>
      </button>
    </div>
  )
}

export default PostInput
