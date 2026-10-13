import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Person, PostWithAuthor, MediaItem } from '../types'
import { getPersons, getTimeline, createPost, uploadImage, uploadVideo } from '../api/client'
import PostCard from '../components/PostCard'
import PostInput from '../components/PostInput'
import Timeline from '../components/Timeline'

function TimelinePage() {
  const navigate = useNavigate()
  const { personId } = useParams<{ personId: string }>()
  const [persons, setPersons] = useState<Person[]>([])
  const [posts, setPosts] = useState<PostWithAuthor[]>([])
  const [loading, setLoading] = useState(true)

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

  async function handleSubmit(content: string, media: MediaItem[]) {
    if (!personId || !content.trim()) return
    try {
      const newPost = await createPost({
        author_id: personId,
        content: content.trim(),
        media,
      })
      const author = persons.find(p => p.id === personId)
      if (author) {
        setPosts(prev => [{
          ...newPost,
          author,
          media: media,
        }, ...prev])
      }
    } catch (err) {
      console.error('Failed to create post:', err)
    }
  }

  async function handleImageUpload(file: File): Promise<MediaItem> {
    return uploadImage(file)
  }

  async function handleVideoUpload(file: File): Promise<MediaItem> {
    return uploadVideo(file)
  }

  if (loading) {
    return (
      <div className="app-container">
        <header className="app-header">
          <button className="back-btn" onClick={() => navigate('/')}>
            ←
          </button>
          <h1 className="timeline-title">我们的话题</h1>
        </header>
        <main className="main-content">
          <div className="loading-container">
            <div className="loading-spinner" />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <button className="back-btn" onClick={() => navigate('/')}>
          ←
        </button>
        <h1 className="timeline-title">
          {currentPerson ? `${currentPerson.name} 的时间线` : '我们的话题'}
        </h1>
      </header>

      <main className="main-content">
        {currentPerson && (
          <PostInput
            currentPerson={currentPerson}
            onSubmit={handleSubmit}
            onImageUpload={handleImageUpload}
            onVideoUpload={handleVideoUpload}
          />
        )}

        <Timeline posts={posts} />
      </main>
    </div>
  )
}

export default TimelinePage
