import { useMemo, useState } from 'react'
import { PostWithAuthor, MediaItem } from '../types'
import { deletePost } from '../api/client'
import MediaPreview from './MediaPreview'
import { showToast } from './Toaster'
import PersonAvatar from './PersonAvatar'
import ReactionSelector from './ReactionSelector'
import { Reaction } from '../api/client'

interface TimelineProps {
  posts: PostWithAuthor[]
  /** Whose timeline this is; only their posts can be edited or deleted here. */
  currentPersonId: string
  onEditPost: (post: PostWithAuthor) => void
  onPostsChange: () => void
  /** Reactions per post, keyed by post id. Held by the page so the poller can refresh them. */
  reactionsByPost: Record<string, Reaction[]>
  onReactionsChange: (postId: string, next: Reaction[]) => void
  /** Called when a reaction write starts, so the poller can avoid clobbering it. */
  onReactionWrite?: () => void
  /** Display name of the signed-in person, used in reaction tooltips. */
  currentPersonName?: string
}

/** Stable empty array, so posts without reactions don't re-render on every poll. */
const NO_REACTIONS: Reaction[] = []

const emotionMap: Record<string, { emoji: string; label: string }> = {
  happy: { emoji: '😊', label: '开心' },
  calm: { emoji: '🌿', label: '平静' },
  busy: { emoji: '💻', label: '忙碌' },
  love: { emoji: '💖', label: '想你' },
  tired: { emoji: '🌙', label: '疲惫' },
  excited: { emoji: '🎉', label: '兴奋' },
  blessed: { emoji: '🥰', label: '幸福' },
  hopeful: { emoji: '✨', label: '期待' },
  sad: { emoji: '😢', label: '难过' },
  wronged: { emoji: '🥺', label: '委屈' },
  angry: { emoji: '😠', label: '生气' },
  sleepy: { emoji: '😴', label: '困倦' },
}

// Hoist formatter to avoid creating new instance per call
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function formatTime(timestamp: number): string {
  return timeFormatter.format(new Date(timestamp)).replace(/\//g, '-')
}

function Timeline({
  posts,
  currentPersonId,
  onEditPost,
  onPostsChange,
  reactionsByPost,
  onReactionsChange,
  onReactionWrite,
  currentPersonName = '',
}: TimelineProps) {
  const [previewMedia, setPreviewMedia] = useState<MediaItem | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  // Everyone who can react is either the signed-in person or an author of a post
  // in this timeline, so the names can be collected without another request.
  const personNames = useMemo(() => {
    const names: Record<string, string> = {}
    if (currentPersonName) names[currentPersonId] = currentPersonName
    for (const post of posts) names[post.author_id] = post.author.name
    return names
  }, [currentPersonId, currentPersonName, posts])

  async function handleDelete(postId: string) {
    try {
      await deletePost(postId)
      setShowDeleteConfirm(null)
      onPostsChange()
      showToast('已删除', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : '删除失败，请重试')
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
            : post.media.length === 2
              ? 'double'
              : post.media.length === 3
                ? 'triple'
                : 'multiple'

          const isOwnPost = post.author_id === currentPersonId

          return (
            <div
              key={post.id}
              className="timeline-item"
              data-theme={post.author_id === 'person-b' ? 'lianlian' : 'lingling'}
            >
              <div
                className="timeline-avatar"
              >
                <PersonAvatar
                  personId={post.author_id}
                  size={40}
                  avatarUrl={(post.author as any).avatar_url}
                  avatarUpdatedAt={(post.author as any).avatar_updated_at}
                />
              </div>
              <div className="timeline-content">
                <div className="timeline-header">
                  <span className="timeline-author">{post.author.name}</span>
                  <span className="timeline-time">{formatTime(post.created_at)}</span>
                </div>
                <div className="timeline-card">
                  {isOwnPost && (
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
                  )}

                  {post.content && (
                    <div className="timeline-text">{post.content}</div>
                  )}

                  {post.location && (
                    <div className="timeline-location">
                      <span aria-hidden="true">📍</span>
                      <span>
                        {post.location.name ? `${post.location.name} · ` : ''}
                        {post.location.address}
                      </span>
                    </div>
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
                            <img
                              src={item.url}
                              alt=""
                              loading="lazy"
                              className="media-img-lazy"
                              onLoad={(e) => (e.target as HTMLImageElement).classList.add('media-img-lazy-loaded')}
                            />
                          ) : (
                            <>
                              <video src={item.url} preload="metadata" />
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

                  {/* Reaction selector */}
                  <ReactionSelector
                    postId={post.id}
                    currentPersonId={currentPersonId}
                    personNames={personNames}
                    reactions={reactionsByPost[post.id] ?? NO_REACTIONS}
                    onReactionChange={onReactionsChange}
                    onReactionWrite={onReactionWrite}
                  />
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
