import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Person, PostWithAuthor, MediaItem } from '../types'
import { getPersons, getTimeline, createPost, updatePost, uploadImage, uploadVideo } from '../api/client'
import PostInput from '../components/PostInput'
import Timeline from '../components/Timeline'

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
]

function TimelinePage() {
  const navigate = useNavigate()
  const { personId } = useParams<{ personId: string }>()
  const [persons, setPersons] = useState<Person[]>([])
  const [posts, setPosts] = useState<PostWithAuthor[]>([])
  const [selectedEmotion, setSelectedEmotion] = useState<string>('')
  const [loading, setLoading] = useState(true)

  // Edit state
  const [editingPost, setEditingPost] = useState<PostWithAuthor | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editMedia, setEditMedia] = useState<MediaItem[]>([])
  const [editEmotion, setEditEmotion] = useState<string>('')

  const currentPerson = persons.find(p => p.id === personId)

  useEffect(() => {
    loadData()
  }, [personId])

  async function loadData() {
    try {
      const [personsData, timelineData] = await Promise.all([
        getPersons(),
        getTimeline(),
      ])
      setPersons(personsData)
      setPosts(timelineData)
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }

  function handleEditPost(post: PostWithAuthor) {
    setEditingPost(post)
    setEditContent(post.content)
    setEditMedia([...post.media])
    setEditEmotion(post.emotion || '')
    setSelectedEmotion(post.emotion || '')
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCancelEdit() {
    setEditingPost(null)
    setEditContent('')
    setEditMedia([])
    setEditEmotion('')
    setSelectedEmotion('')
  }

  async function handleSubmit(content: string, media: MediaItem[], emotion?: string) {
    if (!personId || (!content.trim() && media.length === 0)) return

    try {
      if (editingPost) {
        // Update existing post
        await updatePost(editingPost.id, content.trim(), emotion, media)
        setEditingPost(null)
      } else {
        // Create new post
        await createPost({
          author_id: personId,
          content: content.trim(),
          emotion,
          media,
        })
      }
      setEditContent('')
      setEditMedia([])
      setEditEmotion('')
      setSelectedEmotion('')
      loadData()
    } catch (err) {
      console.error('Failed to save post:', err)
    }
  }

  async function handleImageUpload(file: File): Promise<MediaItem> {
    return uploadImage(file)
  }

  async function handleVideoUpload(file: File): Promise<MediaItem> {
    return uploadVideo(file)
  }

  async function handlePostsChange() {
    loadData()
  }

  if (loading) {
    return (
      <div className="app-container">
        <div className="loading-container">
          <div className="loading-spinner" />
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      <header className="timeline-page-header">
        <button className="back-btn" onClick={() => navigate('/')}>
          ←
        </button>
        <h1 className="timeline-page-title">
          {currentPerson ? `${currentPerson.name} 的时间线` : '共享时间线'}
        </h1>
      </header>

      {currentPerson && (
        <div className="main-card">
          <div className="card-header">
            <div
              className="card-avatar"
              style={{
                background: `linear-gradient(135deg, ${currentPerson.avatar_color} 0%, ${currentPerson.avatar_color}aa 100%)`
              }}
            >
              {currentPerson.name.charAt(0)}
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
            onContentChange={setEditContent}
            onMediaChange={setEditMedia}
            isEditing={!!editingPost}
            onCancelEdit={handleCancelEdit}
          />
        </div>
      )}

      <Timeline
        posts={posts}
        onEditPost={handleEditPost}
        onPostsChange={handlePostsChange}
      />
    </div>
  )
}

export default TimelinePage
