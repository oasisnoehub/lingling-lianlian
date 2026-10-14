import { useState, useRef, useEffect, useCallback } from 'react'
import { Person, MediaItem } from '../types'
import imageCompression from 'browser-image-compression'

interface Emotion {
  emoji: string
  label: string
  id: string
}

interface UploadingItem {
  id: string
  localUrl: string
  type: 'image' | 'video'
  progress: number
}

interface PostInputProps {
  currentPerson: Person
  emotions: Emotion[]
  selectedEmotion: string
  onSelectEmotion: (id: string) => void
  onSubmit: (content: string, media: MediaItem[], emotion?: string) => void
  onImageUpload: (file: File, onProgress?: (p: number) => void) => Promise<MediaItem>
  onVideoUpload: (file: File, onProgress?: (p: number) => void) => Promise<MediaItem>
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
  const [uploadingItems, setUploadingItems] = useState<UploadingItem[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  const isUploadingOrHasItems = isUploading || uploadingItems.length > 0

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

  const createLocalPreview = useCallback((file: File): string => {
    return URL.createObjectURL(file)
  }, [])

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Compress image before upload (max 1MB, 1920px)
    try {
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      })
      await uploadMedia(compressedFile, 'image')
    } catch (err) {
      console.error('Image compression failed:', err)
      await uploadMedia(file, 'image')
    }
    e.target.value = ''
  }

  async function handleVideoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadMedia(file, 'video')
    e.target.value = ''
  }

  async function uploadMedia(file: File, type: 'image' | 'video') {
    const localUrl = createLocalPreview(file)
    const tempId = `uploading-${Date.now()}`

    setUploadingItems(prev => [...prev, {
      id: tempId,
      localUrl,
      type,
      progress: 0
    }])
    setIsUploading(true)

    try {
      const uploadFn = type === 'image' ? onImageUpload : onVideoUpload
      const item = await uploadFn(file, (progress) => {
        setUploadingItems(prev => prev.map(i =>
          i.id === tempId ? { ...i, progress } : i
        ))
      })

      setUploadingItems(prev => {
        const item = prev.find(i => i.id === tempId)
        if (item) URL.revokeObjectURL(item.localUrl)
        return prev.filter(i => i.id !== tempId)
      })
      handleMediaChange([...media, item])
    } catch (err) {
      console.error('Upload failed:', err)
      setUploadingItems(prev => prev.filter(i => i.id !== tempId))
    } finally {
      setIsUploading(uploadingItems.length > 1)
    }
  }

  function removeMedia(id: string) {
    const item = media.find(m => m.id === id)
    if (item?.url.startsWith('/uploads')) {
      // It's a server URL, revoke would be handled on unmount
    }
    handleMediaChange(media.filter(m => m.id !== id))
  }

  function removeUploadingItem(id: string) {
    setUploadingItems(prev => prev.filter(i => i.id !== id))
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
          placeholder="无论此刻在想什么......都要开心一点啦！"
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

      {/* Media Preview - Upload Progress */}
      {(media.length > 0 || uploadingItems.length > 0) && (
        <div className="media-preview-list">
          {uploadingItems.map(item => (
            <div key={item.id} className="media-preview-item uploading">
              {item.type === 'image' ? (
                <img src={item.localUrl} alt="" />
              ) : (
                <video src={item.localUrl} />
              )}
              <div className="media-preview-overlay">
                <div className="upload-progress">
                  <svg className="progress-ring" viewBox="0 0 36 36">
                    <circle
                      className="progress-ring-bg"
                      cx="18" cy="18" r="16"
                      fill="none"
                      strokeWidth="3"
                    />
                    <circle
                      className="progress-ring-fill"
                      cx="18" cy="18" r="16"
                      fill="none"
                      strokeWidth="3"
                      strokeDasharray={`${item.progress} 100`}
                      transform="rotate(-90 18 18)"
                    />
                  </svg>
                  <span className="progress-text">{item.progress}%</span>
                </div>
              </div>
              <button
                className="media-preview-remove"
                onClick={() => removeUploadingItem(item.id)}
              >
                ×
              </button>
            </div>
          ))}
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
        <label className={`attachment-btn ${isUploadingOrHasItems ? 'disabled' : ''}`}>
          <span>⊕</span>
          <span>照片</span>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            disabled={isUploadingOrHasItems}
            style={{ display: 'none' }}
            onChange={handleImageSelect}
          />
        </label>
        <label className={`attachment-btn ${isUploadingOrHasItems ? 'disabled' : ''}`}>
          <span>▶</span>
          <span>视频</span>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            disabled={isUploadingOrHasItems}
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
          disabled={isUploadingOrHasItems || (!content.trim() && media.length === 0)}
          style={{ flex: 1 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13"/>
            <path d="M22 2L15 22L11 13L2 9L22 2Z"/>
          </svg>
          <span>{isEditing ? '保存修改' : isUploading ? '上传中...' : '发布此刻'}</span>
        </button>
      </div>
    </div>
  )
}

export default PostInput
