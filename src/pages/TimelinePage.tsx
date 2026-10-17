import { useState, useEffect } from 'react'
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
} from '../api/client'
import PostInput from '../components/PostInput'
import Timeline from '../components/Timeline'
import Footer from '../components/Footer'
import { showToast } from '../components/Toaster'
import PersonAvatar from '../components/PersonAvatar'

/** How often the shared timeline re-fetches, in ms. */
const REFRESH_INTERVAL = 15000

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
      if (timelineData) setPosts(timelineData)
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

  /** Silent refresh used by the poller: failures here must not spam toasts. */
  async function refreshTimeline() {
    if (document.hidden) return
    try {
      const updated = await getTimeline()
      if (updated) setPosts(updated)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
        navigate('/', { replace: true })
      }
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
            >
              <PersonAvatar personId={currentPerson.id} size={52} />
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
      />

      <Footer />
    </div>
  )
}

export default TimelinePage
