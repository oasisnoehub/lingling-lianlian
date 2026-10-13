import { useState, useRef, useEffect } from 'react'
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
  onSubmit: (content: string, media: MediaItem[], emotion?: string) => void
  onImageUpload: (file: File) => Promise<MediaItem>
  onVideoUpload: (file: File) => Promise<MediaItem>
  initialContent?: string
  initialMedia?: MediaItem[]
  initialEmotion?: string
  onContentChange?: (content: string) => void
  onMediaChange?: (media: MediaItem[]) => void
  isEditing?: boolean
  onCancelEdit?: () => void
}

function PostInput({
  currentPerson,
  emotions,
  selectedEmotion,
  onSelectEmotion,
  onSubmit,
  onImageUpload,
  onVideoUpload,
  initialContent = '',
  initialMedia = [],
  initialEmotion = '',
  onContentChange,
  onMediaChange,
  isEditing = false,
  onCancelEdit,
}: PostInputProps) {
  const [content, setContent] = useState(initialContent)
  const [media, setMedia] = useState<MediaItem[]>(initialMedia)
  const [uploading, setUploading] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  // Sync with external changes (for edit mode)
  useEffect(() => {
    setContent(initialContent)
    setMedia(initialMedia)
  }, [initialContent, initialMedia])

  function handleContentChange(value: string) {
    setContent(value)
    onContentChange?.(value)
  }

  function handleMediaChange(newMedia: MediaItem[]) {
    setMedia(newMedia)
    onMediaChange?.(newMedia)
  }

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
      handleMediaChange([...media, item])
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
    }
  }

  function removeMedia(id: string) {
    handleMediaChange(media.filter(m => m.id !== id))
  }

  function handleSubmit() {
    if (!content.trim() && media.length === 0) return
    onSubmit(content, media, selectedEmotion)
    if (!isEditing) {
      setContent('')
      handleMediaChange([])
    }
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
          onChange={e => handleContentChange(e.target.value)}
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
          <span>▶</span>
          <span>视频</span>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            style={{ display: 'none' }}
            onChange={handleVideoSelect}
          />
        </label>
        <label className="attachment-btn">
          <span>⌂</span>
          <span>位置</span>
        </label>
      </div>

      {/* Submit Button */}
      <div className="submit-row">
        {isEditing && (
          <button
            className="cancel-edit-btn"
            onClick={onCancelEdit}
          >
            取消
          </button>
        )}
        <button
          className="submit-btn"
          onClick={handleSubmit}
          disabled={uploading || (!content.trim() && media.length === 0)}
          style={{ flex: 1 }}
        >
          <span>✈️</span>
          <span>{isEditing ? '保存修改' : '发布此刻'}</span>
        </button>
      </div>
    </div>
  )
}

export default PostInput
