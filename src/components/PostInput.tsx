import { useState, useRef, useEffect, useCallback } from 'react'
import { Person, MediaItem, PostLocation } from '../types'
import imageCompression from 'browser-image-compression'
// The library compresses inside a worker that downloads its own source at
// runtime. That source comes from a CDN by default, which is slow or
// unreachable from mainland China -- and when the download fails the whole
// compression fails, so the original picture is uploaded instead. Serving the
// worker from our own origin removes that dependency.
import compressionWorkerUrl from 'browser-image-compression/dist/browser-image-compression.js?url'
import { reverseLocation, type UploadTask } from '../api/client'
import { showToast } from './Toaster'

interface Emotion {
  emoji: string
  label: string
  id: string
}

/** Where an upload currently is: the picture is being prepared, or is on its way. */
type UploadPhase = 'compressing' | 'uploading'

interface UploadingItem {
  id: string
  localUrl: string
  type: 'image' | 'video'
  phase: UploadPhase
  /** 0..100 -- how far the compression or the upload has got. */
  progress: number
}

/**
 * When the picture cannot be compressed, only one this size is uploaded as it
 * is. Anything bigger would crawl up the line and time out.
 */
const MAX_FALLBACK_BYTES = 8 * 1024 * 1024

/**
 * Formats only Safari can decode. Compressing them to JPEG is what makes the
 * picture show up on the other person's phone.
 */
const HEIC_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
])

/** The formats the compressor is allowed to write. */
const COMPRESSIBLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

/**
 * The format the picture is compressed into. A HEIC picture becomes JPEG,
 * because only Safari can show HEIC.
 */
function compressionFileType(file: File): 'image/jpeg' | 'image/png' | 'image/webp' | undefined {
  if (HEIC_TYPES.has(file.type)) return 'image/jpeg'
  if (COMPRESSIBLE_TYPES.has(file.type)) return file.type as 'image/jpeg' | 'image/png' | 'image/webp'
  return undefined
}

interface PostInputProps {
  currentPerson: Person
  emotions: Emotion[]
  selectedEmotion: string
  onSelectEmotion: (id: string) => void
  /** Resolves true when the post was actually saved, so we know whether to clear. */
  onSubmit: (
    content: string,
    media: MediaItem[],
    emotion?: string,
    location?: PostLocation | null,
  ) => Promise<boolean>
  onImageUpload: (file: File, onProgress?: (p: number) => void) => UploadTask
  onVideoUpload: (file: File, onProgress?: (p: number) => void) => UploadTask
  initialContent?: string
  initialMedia?: MediaItem[]
  initialEmotion?: string
  initialLocation?: PostLocation | null
  onContentChange?: (content: string) => void
  onMediaChange?: (media: MediaItem[] | ((prev: MediaItem[]) => MediaItem[])) => void
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
  initialLocation = null,
  onContentChange,
  onMediaChange,
  isEditing = false,
  onCancelEdit,
}: PostInputProps) {
  const [content, setContent] = useState(initialContent)
  const [media, setMedia] = useState<MediaItem[]>(initialMedia)
  const [uploadingItems, setUploadingItems] = useState<UploadingItem[]>([])
  const [location, setLocation] = useState<PostLocation | null>(initialLocation)
  const [isLocating, setIsLocating] = useState(false)
  const [locationError, setLocationError] = useState('')
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  /** How to stop each upload: the compression's abort while it runs, the request's abort after that. */
  const cancelsRef = useRef(new Map<string, () => void>())
  /** The uploads the user called off, so a late answer knows to drop itself. */
  const cancelledRef = useRef(new Set<string>())
  const localUrlsRef = useRef(new Set<string>())

  // Derived from the list itself so removing an in-flight item can never leave
  // the form permanently disabled.
  const isUploading = uploadingItems.length > 0

  useEffect(() => {
    setContent(initialContent)
    setMedia(initialMedia)
    setLocation(initialLocation)
    setLocationError('')
  }, [initialContent, initialMedia, initialLocation])

  useEffect(() => {
    return () => {
      for (const cancel of cancelsRef.current.values()) cancel()
      for (const url of localUrlsRef.current) URL.revokeObjectURL(url)
      localUrlsRef.current.clear()
    }
  }, [])

  function handleContentChange(value: string) {
    setContent(value)
    onContentChange?.(value)
  }

  /**
   * The media list can be changed from an upload that finished while another
   * one was still running, so the new list is worked out from the latest one
   * rather than from the list this render happened to see.
   */
  function handleMediaChange(update: MediaItem[] | ((prev: MediaItem[]) => MediaItem[])) {
    setMedia(prev => (typeof update === 'function' ? update(prev) : update))
    onMediaChange?.(update)
  }

  const createLocalPreview = useCallback((file: File): string => {
    const url = URL.createObjectURL(file)
    localUrlsRef.current.add(url)
    return url
  }, [])

  function releasePreview(id: string) {
    setUploadingItems(prev => {
      const item = prev.find(i => i.id === id)
      if (item) {
        URL.revokeObjectURL(item.localUrl)
        localUrlsRef.current.delete(item.localUrl)
      }
      return prev.filter(i => i.id !== id)
    })
  }

  function updateItem(id: string, patch: Partial<UploadingItem>) {
    setUploadingItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)))
  }

  function isCancelled(id: string) {
    return cancelledRef.current.has(id)
  }

  /** Shows the picture straight away, before it is even compressed. */
  function beginItem(file: File, type: 'image' | 'video', phase: UploadPhase) {
    const localUrl = createLocalPreview(file)
    const id = `uploading-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setUploadingItems(prev => [...prev, { id, localUrl, type, phase, progress: 0 }])
    return id
  }

  function removeItem(id: string) {
    cancelsRef.current.delete(id)
    releasePreview(id)
  }

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target
    const file = input.files?.[0]
    // Clear the input at once, so the same picture can be picked again.
    input.value = ''
    if (!file) return

    const id = beginItem(file, 'image', 'compressing')
    const controller = new AbortController()
    cancelsRef.current.set(id, () => controller.abort())

    let prepared: File
    try {
      prepared = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        // The worker would otherwise download its own source from a CDN,
        // which is slow or blocked here; this serves it from our own origin.
        libURL: compressionWorkerUrl,
        fileType: compressionFileType(file),
        signal: controller.signal,
        onProgress: progress => updateItem(id, { progress }),
      })
    } catch (err) {
      if (isCancelled(id)) {
        cancelledRef.current.delete(id)
        return
      }
      console.error('Image compression failed:', err)
      // A picture that cannot be compressed is uploaded as it is, but only
      // if it is small enough to get through the line in one piece.
      if (file.size > MAX_FALLBACK_BYTES) {
        cancelledRef.current.delete(id)
        removeItem(id)
        showToast('图片太大且无法压缩，请换一张小一点的照片')
        return
      }
      prepared = file
    }

    if (isCancelled(id)) {
      cancelledRef.current.delete(id)
      return
    }
    await uploadMedia(id, prepared, 'image')
  }

  async function handleVideoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    const id = beginItem(file, 'video', 'uploading')
    await uploadMedia(id, file, 'video')
  }

  async function uploadMedia(id: string, file: File, type: 'image' | 'video') {
    updateItem(id, { phase: 'uploading', progress: 0 })

    try {
      const uploadFn = type === 'image' ? onImageUpload : onVideoUpload
      const { promise, abort } = uploadFn(file, (progress) => {
        updateItem(id, { progress })
      })
      cancelsRef.current.set(id, abort)

      const item = await promise
      if (isCancelled(id)) {
        cancelledRef.current.delete(id)
        return
      }
      cancelledRef.current.delete(id)
      removeItem(id)
      handleMediaChange(prev => [...prev, item])
    } catch (err) {
      const wasCancelled = isCancelled(id)
      cancelledRef.current.delete(id)
      removeItem(id)
      if (wasCancelled) return
      const message = err instanceof Error ? err.message : '上传失败，请重试'
      // A user-initiated cancel is not a failure worth reporting.
      if (message !== '上传已取消') showToast(message)
    }
  }

  function removeMedia(id: string) {
    handleMediaChange(media.filter(m => m.id !== id))
  }

  function removeUploadingItem(id: string) {
    // Mark it first: a compression or upload that answers late must drop
    // its result instead of adding the picture to the post.
    cancelledRef.current.add(id)
    cancelsRef.current.get(id)?.()
    removeItem(id)
  }

  function handleLocate() {
    setLocationError('')
    if (!navigator.geolocation) {
      setLocationError('当前浏览器不支持定位，请检查浏览器设置')
      return
    }

    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      async position => {
        try {
          const result = await reverseLocation(position.coords.latitude, position.coords.longitude)
          setLocation({
            address: result.formatted_address,
            name: result.nearest_poi,
            latitude: result.latitude,
            longitude: result.longitude,
          })
        } catch (err) {
          setLocationError(err instanceof Error ? err.message : '获取地址失败，请稍后重试')
        } finally {
          setIsLocating(false)
        }
      },
      error => {
        const message = error.code === error.PERMISSION_DENIED
          ? '定位权限被拒绝，请在浏览器设置中允许访问位置'
          : error.code === error.TIMEOUT
            ? '定位超时，请检查网络和定位设置后重试'
            : '定位失败，请检查设备定位设置后重试'
        setLocationError(message)
        setIsLocating(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  function removeLocation() {
    setLocation(null)
    setLocationError('')
  }

  async function handleSubmit() {
    if (isUploading || (!content.trim() && media.length === 0)) return
    const saved = await onSubmit(content, media, selectedEmotion, location)
    // Only wipe the draft once the server has actually accepted it.
    if (saved && !isEditing) {
      setContent('')
      handleMediaChange([])
      setLocation(null)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      void handleSubmit()
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
                  <span className="progress-text">
                    {item.phase === 'compressing' ? '压缩中' : `${item.progress}%`}
                  </span>
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
        <label className={`attachment-btn ${isUploading ? 'disabled' : ''}`}>
          <span>⊕</span>
          <span>照片</span>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            disabled={isUploading}
            style={{ display: 'none' }}
            onChange={handleImageSelect}
          />
        </label>
        <label className={`attachment-btn ${isUploading ? 'disabled' : ''}`}>
          <span>▶</span>
          <span>视频</span>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            disabled={isUploading}
            style={{ display: 'none' }}
            onChange={handleVideoSelect}
          />
        </label>
        <button
          type="button"
          className="attachment-btn location-button"
          onClick={handleLocate}
          disabled={isLocating}
        >
          <span>⌂</span>
          <span>{isLocating ? '定位中...' : '位置'}</span>
        </button>
      </div>

      {location && (
        <div className="selected-location">
          <span className="selected-location-icon">📍</span>
          <span className="selected-location-text">
            {location.name ? `${location.name} · ` : ''}{location.address}
          </span>
          <button
            type="button"
            className="remove-location-btn"
            onClick={removeLocation}
            aria-label="删除已选位置"
            title="删除位置"
          >
            ×
          </button>
        </div>
      )}
      {locationError && (
        <div className="location-error" role="alert">{locationError}</div>
      )}

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
          disabled={isUploading || (!content.trim() && media.length === 0)}
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
