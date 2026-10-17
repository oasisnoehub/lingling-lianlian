import { useState, useRef, useCallback, useEffect } from 'react'
import { uploadAvatar, type AvatarUploadResponse } from '../api/client'
import { showToast } from './Toaster'

interface AvatarUploaderProps {
  personId: string
  personName: string
  currentAvatarUrl?: string
  currentAvatarUpdatedAt?: number
  onAvatarUpdated: (avatarUrl: string, updatedAt: number) => void
  onClose: () => void
}

const MAX_AVATAR_SIZE = 2 * 1024 * 1024 // 2MB

export default function AvatarUploader({
  personId,
  personName,
  currentAvatarUrl,
  currentAvatarUpdatedAt,
  onAvatarUpdated,
  onClose,
}: AvatarUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback((file: File) => {
    // Check file size
    if (file.size > MAX_AVATAR_SIZE) {
      showToast('头像文件太大，不能超过 2MB', 'error')
      return
    }

    // Check file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      // Check for common iPhone HEIC format
      if (file.type === 'image/heic' || file.type === 'image/heif') {
        showToast('iPhone 的 HEIC 格式不受支持，请使用 JPEG、PNG 或 WebP 格式', 'error')
      } else {
        showToast('不支持的文件格式，请使用 JPEG、PNG 或 WebP 格式', 'error')
      }
      return
    }

    setSelectedFile(file)

    // Create preview URL
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
  }, [])

  const onFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }, [handleFileSelect])

  const handleButtonClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleCancel = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    setSelectedFile(null)
    setPreviewUrl(null)
    onClose()
  }, [previewUrl, onClose])

  const handleConfirm = useCallback(() => {
    if (!selectedFile || uploading) return

    setUploading(true)
    setUploadProgress(0)

    const uploadTask = uploadAvatar(selectedFile, (percent) => {
      setUploadProgress(percent)
    })

    uploadTask.promise
      .then((response: AvatarUploadResponse) => {
        // Response contains { avatar_url, avatar_updated_at }
        // We need to refresh person data from server to get the complete avatar info
        showToast('头像已更新', 'success')
        // Signal parent to refresh person data
        onAvatarUpdated(response.avatar_url || '', response.avatar_updated_at || Date.now())
      })
      .catch((err) => {
        // 0 = abort error code from xhr.onabort
        if (err instanceof Error && err.message !== '上传已取消') {
          showToast(err.message, 'error')
        }
      })
      .finally(() => {
        setUploading(false)
        setUploadProgress(0)
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl)
        }
        setSelectedFile(null)
        setPreviewUrl(null)
      })
  }, [selectedFile, uploading, previewUrl, onAvatarUpdated])

  // Clean up preview URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  return (
    <div className="avatar-uploader-overlay" onClick={handleCancel}>
      <div className="avatar-uploader-modal" onClick={e => e.stopPropagation()}>
        <h3 className="avatar-uploader-title">更新{personName}的头像</h3>

        <div className="avatar-uploader-preview">
          {previewUrl ? (
            <div className="avatar-preview-image">
              <img src={previewUrl} alt="预览头像" />
            </div>
          ) : currentAvatarUrl ? (
            <div className="avatar-preview-image">
              <img
                src={`${currentAvatarUrl}?v=${currentAvatarUpdatedAt || Date.now()}`}
                alt="当前头像"
              />
            </div>
          ) : (
            <div className="avatar-preview-placeholder">
              <span>{personName.charAt(0)}</span>
            </div>
          )}
        </div>

        <div className="avatar-uploader-actions">
          {!uploading ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onFileInputChange}
                className="avatar-uploader-input"
              />
              <button
                className="avatar-uploader-btn avatar-uploader-btn-select"
                onClick={handleButtonClick}
              >
                选择图片
              </button>
              {selectedFile && (
                <button
                  className="avatar-uploader-btn avatar-uploader-btn-confirm"
                  onClick={handleConfirm}
                >
                  确认更新
                </button>
              )}
              <button
                className="avatar-uploader-btn avatar-uploader-btn-cancel"
                onClick={handleCancel}
              >
                取消
              </button>
            </>
          ) : (
            <div className="avatar-uploader-uploading">
              <div className="avatar-uploader-progress">
                <div
                  className="avatar-uploader-progress-bar"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <span className="avatar-uploader-progress-text">{uploadProgress}%</span>
              <span className="avatar-uploader-progress-label">正在更新头像...</span>
            </div>
          )}
        </div>

        <div className="avatar-uploader-hint">
          支持 JPEG、PNG、WebP 格式，最大 2MB<br />
          建议使用 512×512 正方形图片
        </div>
      </div>
    </div>
  )
}
