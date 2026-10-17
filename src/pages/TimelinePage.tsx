import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Person, PostWithAuthor, MediaItem, PostLocation } from '../types'
import {
  ApiError,
  UploadTask,
  createPost,
  getMe,
  getTimeline,
  getToken,
  logout,
  updatePost,
  uploadImage,
  uploadVideo,
  getReactions,
  type Reaction,
} from '../api/client'
import PostInput from '../components/PostInput'
import Timeline from '../components/Timeline'
import Footer from '../components/Footer'
import { showToast } from '../components/Toaster'
import PersonAvatar from '../components/PersonAvatar'
import AvatarUploader from '../components/AvatarUploader'
import CountdownSection from '../components/CountdownSection'

/** How often the shared timeline re-fetches, in ms. */
const REFRESH_INTERVAL = 15000

/** Reactions are fetched per post id in the query string, so the batch is capped. */
const MAX_REACTION_POSTS = 200

interface Emotion {
  emoji: string
  label: string
  id: string
}

const emotions: Emotion[] = [
  { emoji: '😊', label: '开心', id: 'happy' },
  { emoji: '🌿', label: '平静', id: 'calm' },
  { emoji: '💻', label: '忙碌', id: 'busy' },
  { emoji: '💖', label: '想你', id: 'love' },
  { emoji: '🌙', label: '疲惫', id: 'tired' },
  { emoji: '🎉', label: '兴奋', id: 'excited' },
  { emoji: '🥰', label: '幸福', id: 'blessed' },
  { emoji: '✨', label: '期待', id: 'hopeful' },
  { emoji: '😢', label: '难过', id: 'sad' },
  { emoji: '🥺', label: '委屈', id: 'wronged' },
  { emoji: '😠', label: '生气', id: 'angry' },
  { emoji: '😴', label: '困倦', id: 'sleepy' },
]

function TimelinePage() {
  const navigate = useNavigate()
  const { personId } = useParams<{ personId: string }>()
  const [currentPerson, setCurrentPerson] = useState<Person | null>(null)
  const [posts, setPosts] = useState<PostWithAuthor[]>([])
  const [selectedEmotion, setSelectedEmotion] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [showAvatarUploader, setShowAvatarUploader] = useState(false)
  const [reactionsByPost, setReactionsByPost] = useState<Record<string, Reaction[]>>({})

  // The poller is registered once, so it reads the latest posts through a ref
  // instead of closing over the empty list it was created with.
  const postsRef = useRef<PostWithAuthor[]>([])
  useEffect(() => {
    postsRef.current = posts
  }, [posts])

  // Bumped whenever a reaction write starts. The poller samples it around its
  // own fetch, so a reaction that is mid-save is never overwritten by a payload
  // that was read before the save landed.
  const reactionWrites = useRef(0)

  function handleReactionWrite() {
    reactionWrites.current += 1
  }

  // Edit state
  const [editingPost, setEditingPost] = useState<PostWithAuthor | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editMedia, setEditMedia] = useState<MediaItem[]>([])
  const [editEmotion, setEditEmotion] = useState<string>('')
  const [editLocation, setEditLocation] = useState<PostLocation | null>(null)

  useEffect(() => {
    if (!getToken()) {
      navigate('/', { replace: true })
      return
    }
    void loadData()

    // Pick up the other person's posts without a manual refresh.
    const timer = setInterval(() => void refreshTimeline(), REFRESH_INTERVAL)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshTimeline()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [personId, navigate])

  async function loadData() {
    try {
      const [me, timelineData] = await Promise.all([getMe(), getTimeline()])
      setCurrentPerson(me)
      // null means the server said nothing changed since our last fetch.
      if (timelineData) {
        setPosts(timelineData)
        const reactions = await fetchReactions(timelineData)
        if (reactions) setReactionsByPost(reactions)
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
        navigate('/', { replace: true })
        return
      }
      showToast(err instanceof Error ? err.message : '加载失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Reactions are decorative, so a failure here resolves to null instead of
   * throwing: it must never stop the timeline itself from rendering.
   */
  async function fetchReactions(postList: PostWithAuthor[]): Promise<Record<string, Reaction[]> | null> {
    const ids = postList.slice(0, MAX_REACTION_POSTS).map(post => post.id)
    if (ids.length === 0) return {}
    try {
      return await getReactions(ids)
    } catch (err) {
      console.error('Failed to load reactions', err)
      return null
    }
  }

  /** Silent refresh used by the poller: failures here must not spam toasts. */
  async function refreshTimeline() {
    if (document.hidden) return
    try {
      const updated = await getTimeline()
      if (updated) setPosts(updated)
      // Reactions change without the post list changing, so they are polled
      // on every cycle rather than only when a post arrives.
      const writesBefore = reactionWrites.current
      const reactions = await fetchReactions(updated ?? postsRef.current)
      if (reactions && reactionWrites.current === writesBefore) {
        setReactionsByPost(reactions)
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
        navigate('/', { replace: true })
      }
    }
  }

  async function handleAvatarUpdated(avatarUrl: string, updatedAt: number) {
    // Refresh person data to get the new avatar
    try {
      const me = await getMe()
      setCurrentPerson(me)
      setShowAvatarUploader(false)
      // Also update the avatar URL locally for immediate refresh
      if (avatarUrl && currentPerson) {
        setCurrentPerson(prev => prev ? {
          ...prev,
          avatar_url: avatarUrl,
          avatar_updated_at: updatedAt,
        } : null)
      }
    } catch (err) {
      console.error('Failed to refresh person data after avatar update:', err)
    }
  }

  function handleEditPost(post: PostWithAuthor) {
    setEditingPost(post)
    setEditContent(post.content)
    setEditMedia([...post.media])
    setEditEmotion(post.emotion || '')
    setEditLocation(post.location || null)
    setSelectedEmotion(post.emotion || '')
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCancelEdit() {
    setEditingPost(null)
    setEditContent('')
    setEditMedia([])
    setEditEmotion('')
    setEditLocation(null)
    setSelectedEmotion('')
  }

  async function handleSubmit(
    content: string,
    media: MediaItem[],
    emotion?: string,
    location?: PostLocation | null
  ): Promise<boolean> {
    if (!personId || (!content.trim() && media.length === 0)) return false

    try {
      if (editingPost) {
        await updatePost(editingPost.id, content.trim(), emotion, media, location)
        setEditingPost(null)
        setEditLocation(null)
      } else {
        // The server derives the author from the token, so it cannot be spoofed.
        await createPost({ content: content.trim(), emotion, media, location })
      }
      setEditContent('')
      setEditMedia([])
      setEditEmotion('')
      setEditLocation(null)
      setSelectedEmotion('')
      showToast(editingPost ? '修改已保存' : '发布成功', 'success')
      await loadData()
      return true
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存失败，请重试')
      return false
    }
  }

  function handleImageUpload(file: File, onProgress?: (p: number) => void): UploadTask {
    return uploadImage(file, onProgress)
  }

  function handleVideoUpload(file: File, onProgress?: (p: number) => void): UploadTask {
    return uploadVideo(file, onProgress)
  }

  function handlePostsChange() {
    void loadData()
  }

  function handleReactionsChange(postId: string, next: Reaction[]) {
    setReactionsByPost(prev => ({ ...prev, [postId]: next }))
  }

  function handleLogout() {
    logout()
    navigate('/', { replace: true })
  }

  if (loading || !personId) {
    return (
      <div className="app-container" data-theme={personId === 'person-b' ? 'lianlian' : 'lingling'}>
        <div className="loading-container">
          <div className="loading-spinner" />
        </div>
      </div>
    )
  }

  return (
    <div className="app-container" data-theme={personId === 'person-b' ? 'lianlian' : 'lingling'}>
      <header className="timeline-page-header">
        <button className="back-btn" onClick={() => navigate('/')}>
          ←
        </button>
        <h1 className="timeline-page-title">
          {currentPerson ? `${currentPerson.name} 的时间线` : '共享时间线'}
        </h1>
        <button className="logout-btn" onClick={handleLogout} title="退出登录">
          退出
        </button>
      </header>

      {currentPerson && (
        <div className="main-card">
          <div className="card-header">
            <div
              className="card-avatar"
              onClick={() => setShowAvatarUploader(true)}
              style={{ cursor: 'pointer' }}
              title="点击更新头像"
            >
              <PersonAvatar
                personId={currentPerson.id}
                size={52}
                avatarUrl={currentPerson.avatar_url}
                avatarUpdatedAt={currentPerson.avatar_updated_at}
              />
            </div>
            <div className="card-header-text">
              <div className="card-header-title">
                {editingPost ? '编辑此刻' : '记录这一刻'}
              </div>
              <div className="card-header-subtitle">
                {editingPost ? '修改内容后保存' : `以 ${currentPerson.name} 的身份`}
              </div>
            </div>
          </div>

              <CountdownSection />

          <PostInput
            currentPerson={currentPerson}
            emotions={emotions}
            selectedEmotion={selectedEmotion}
            onSelectEmotion={setSelectedEmotion}
            onSubmit={handleSubmit}
            onImageUpload={handleImageUpload}
            onVideoUpload={handleVideoUpload}
            initialContent={editContent}
            initialMedia={editMedia}
            initialEmotion={editEmotion}
            initialLocation={editLocation}
            onContentChange={setEditContent}
            onMediaChange={setEditMedia}
            isEditing={!!editingPost}
            onCancelEdit={handleCancelEdit}
          />
        </div>
      )}

      <Timeline
        posts={posts}
        currentPersonId={personId}
        onEditPost={handleEditPost}
        onPostsChange={handlePostsChange}
        reactionsByPost={reactionsByPost}
        onReactionsChange={handleReactionsChange}
        onReactionWrite={handleReactionWrite}
        currentPersonName={currentPerson?.name}
      />

      <Footer />

      {showAvatarUploader && currentPerson && (
        <AvatarUploader
          personId={currentPerson.id}
          personName={currentPerson.name}
          currentAvatarUrl={currentPerson.avatar_url}
          currentAvatarUpdatedAt={currentPerson.avatar_updated_at}
          onAvatarUpdated={handleAvatarUpdated}
          onClose={() => setShowAvatarUploader(false)}
        />
      )}
    </div>
  )
}

export default TimelinePage
