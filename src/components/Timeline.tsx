import { PostWithAuthor } from '../types'
import PostCard from './PostCard'

interface TimelineProps {
  posts: PostWithAuthor[]
}

function Timeline({ posts }: TimelineProps) {
  if (posts.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">💬</div>
        <h3>还没有任何动态</h3>
        <p>开始发布第一条消息吧！</p>
      </div>
    )
  }

  return (
    <div className="timeline">
      {posts.map((post) => (
        <div key={post.id} className="timeline-item">
          <div className="timeline-line" style={{ background: post.author.avatar_color }} />
          <div className="timeline-dot" style={{ background: post.author.avatar_color }} />
          <div className="timeline-content">
            <PostCard post={post} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default Timeline
