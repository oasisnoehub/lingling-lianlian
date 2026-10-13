import { useNavigate } from 'react-router-dom'

function HomePage() {
  const navigate = useNavigate()

  return (
    <div className="app-container">
      {/* Star Background */}
      <div className="stars-bg">
        {Array.from({ length: 50 }).map((_, i) => (
          <div
            key={i}
            className="star"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
            }}
          />
        ))}
      </div>

      {/* Header */}
      <header className="app-header">
        <div className="header-brand">
          <div className="app-icon">L✦L</div>
          <span className="app-name">linglinglianlian</span>
        </div>
        <div className="header-spacer" />
      </header>

      {/* Main Content */}
      <main className="main-content">
        <div className="hero-card">
          <div className="hero-brand">L✦L</div>
          <h1 className="hero-title">linglinglianlian</h1>
          <p className="hero-subtitle">把各自的时刻，放进同一条时间线。</p>

          <div className="person-cards">
            <div
              className="person-card"
              onClick={() => navigate('/timeline/person-a')}
            >
              <div className="person-avatar blue">L</div>
              <span className="person-name">Lingling</span>
            </div>
            <div
              className="person-card"
              onClick={() => navigate('/timeline/person-b')}
            >
              <div className="person-avatar green">L</div>
              <span className="person-name">Lianlian</span>
            </div>
          </div>

          <p className="hint-text">无需密码，选择身份即可进入</p>
        </div>
      </main>
    </div>
  )
}

export default HomePage
