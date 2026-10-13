import { useState } from 'react'
import { PostWithAuthor, MediaItem } from '../types'
import { deletePost } from '../api/client'
import MediaPreview from './MediaPreview'

interface TimelineProps {
  posts: PostWithAuthor[]
  onEditPost: (post: PostWithAuthor) => void
  onPostsChange: () => void
}

const emotionMap: Record<string, { emoji: string; label: string }> = {
  happy: { emoji: '😊', label: '开心' },
  calm: { emoji: '🌿', label: '平静' },
  busy: { emoji: '💻', label: '忙碌' },
  love: { emoji: '💖', label: '想你' },
  tired: { emoji: '🌙', label: '疲惫' },
  excited: { emoji: '🎉', label: '兴奋' },
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

function Timeline({ posts, onEditPost, onPostsChange }: TimelineProps) {
  const [previewMedia, setPreviewMedia] = useState<MediaItem | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  async function handleDelete(postId: string) {
    try {
      await deletePost(postId)
      setShowDeleteConfirm(null)
      onPostsChange()
    } catch (err) {
      console.error('Failed to delete post:', err)
    }
  }

  if (posts.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">💭</div>
        <div className="empty-state-title">还没有任何动态</div>
        <div className="empty-state-desc">开始记录你们的第一个此刻吧</div>
      </div>
    )
  }

  return (
    <>
      <div className="timeline">
        {posts.map((post) => {
          const mediaClass = post.media.length === 1
            ? 'single'
            : 'double'

          return (
            <div key={post.id} className="timeline-item">
              <div
                className="timeline-avatar"
                style={{ background: `linear-gradient(135deg, ${post.author.avatar_color} 0%, ${post.author.avatar_color}99 100%)` }}
              >
                {post.author.name.charAt(0)}
              </div>
              <div className="timeline-content">
                <div className="timeline-header">
                  <span className="timeline-author">{post.author.name}</span>
                  <span className="timeline-time">{formatTime(post.created_at)}</span>
                </div>
                <div className="timeline-card">
                  <div className="post-actions">
                    <button
                      className="post-action-btn"
                      onClick={() => onEditPost(post)}
                      title="编辑"
                    >
                      ✎
                    </button>
                    <button
                      className="post-action-btn delete"
                      onClick={() => setShowDeleteConfirm(post.id)}
                      title="删除"
                    >
                      🗑
                    </button>
                  </div>

                  {post.content && (
                    <div className="timeline-text">{post.content}</div>
                  )}

                  {post.media.length > 0 && (
                    <div className={`timeline-media-grid ${mediaClass}`}>
                      {post.media.map((item) => (
                        <div
                          key={item.id}
                          className="timeline-media-item"
                          onClick={() => setPreviewMedia(item)}
                        >
                          {item.type === 'image' ? (
                            <img src={item.url} alt="" />
                          ) : (
                            <>
                              <video src={item.url} />
                              <div className="timeline-media-overlay">
                                <div className="play-icon">▶</div>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {post.emotion && emotionMap[post.emotion] && (
                    <div className="timeline-emotion">
                      {emotionMap[post.emotion].emoji} {emotionMap[post.emotion].label}
                    </div>
                  )}
                </div>
              </div>

              {showDeleteConfirm === post.id && (
                <div className="delete-confirm-overlay" onClick={() => setShowDeleteConfirm(null)}>
                  <div className="delete-confirm-dialog" onClick={e => e.stopPropagation()}>
                    <p>确定要删除这条动态吗？</p>
                    <div className="delete-confirm-actions">
                      <button
                        className="delete-cancel-btn"
                        onClick={() => setShowDeleteConfirm(null)}
                      >
                        取消
                      </button>
                      <button
                        className="delete-confirm-btn"
                        onClick={() => handleDelete(post.id)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {previewMedia && (
        <MediaPreview item={previewMedia} onClose={() => setPreviewMedia(null)} />
      )}
    </>
  )
}

export default Timeline
