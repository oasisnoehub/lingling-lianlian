import { useState, useRef } from 'react'
import { Person, MediaItem } from '../types'

interface PostInputProps {
  currentPerson: Person
  onSubmit: (content: string, media: MediaItem[]) => void
  onImageUpload: (file: File) => Promise<MediaItem>
  onVideoUpload: (file: File) => Promise<MediaItem>
}

function PostInput({
  currentPerson,
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

  return (
    <div className="post-input-section">
      <div className="post-input-row">
        <div
          className="post-avatar"
          style={{
            background: currentPerson.avatar_color,
            width: 40,
            height: 40,
            fontSize: 16,
          }}
        >
          {currentPerson.name.charAt(0)}
        </div>
        <div className="floating-group" style={{ flex: 1 }}>
          <textarea
            placeholder=" "
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={2}
          />
          <label>说点什么...</label>
        </div>
        <button
          className="btn-primary"
          onClick={handleSubmit}
          disabled={uploading || (!content.trim() && media.length === 0)}
        >
          发送
        </button>
      </div>

      <div className="media-upload-btns">
        <label className="upload-btn">
          <span>🖼️</span>
          <span>图片</span>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleImageSelect}
          />
        </label>
        <label className="upload-btn">
          <span>🎬</span>
          <span>视频</span>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            style={{ display: 'none' }}
            onChange={handleVideoSelect}
          />
        </label>
      </div>

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
    </div>
  )
}

export default PostInput
