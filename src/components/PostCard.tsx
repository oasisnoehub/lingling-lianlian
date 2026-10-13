import { useState } from 'react'
import { PostWithAuthor, MediaItem } from '../types'
import MediaPreview from './MediaPreview'

interface PostCardProps {
  post: PostWithAuthor
}

function formatTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 30) return `${days}天前`

  return new Date(timestamp).toLocaleDateString('zh-CN')
}

function PostCard({ post }: PostCardProps) {
  const [previewMedia, setPreviewMedia] = useState<MediaItem | null>(null)
  const [previewIndex, setPreviewIndex] = useState(0)

  function openPreview(item: MediaItem, index: number) {
    setPreviewMedia(item)
    setPreviewIndex(index)
  }

  function closePreview() {
    setPreviewMedia(null)
  }

  const mediaClass = post.media.length === 1
    ? 'single'
    : post.media.length === 2
    ? 'double'
    : post.media.length === 3
    ? 'triple'
    : 'multiple'

  return (
    <>
      <div className="post-card">
        <div className="post-header">
          <span className="post-author">{post.author.name}</span>
          <span className="post-time">{formatTime(post.created_at)}</span>
        </div>

        {post.content && (
          <div className="post-content">{post.content}</div>
        )}

        {post.media.length > 0 && (
          <div className={`post-media-grid ${mediaClass}`}>
            {post.media.map((item, index) => (
              <div
                key={item.id}
                className="media-item"
                onClick={() => openPreview(item, index)}
              >
                {item.type === 'image' ? (
                  <img src={item.url} alt="" />
                ) : (
                  <>
                    <video src={item.url} />
                    <div className="media-item-overlay">
                      <div className="play-icon">▶</div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {previewMedia && (
        <MediaPreview
          item={previewMedia}
          onClose={closePreview}
        />
      )}
    </>
  )
}

export default PostCard
