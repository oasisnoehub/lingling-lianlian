import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Footer from '../components/Footer'

const PASSWORD = 'lingling'
const PERSON_PASSWORD = 'lianlian'

function HomePage() {
  const navigate = useNavigate()
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null)
  const [passwordInput, setPasswordInput] = useState('')
  const [error, setError] = useState(false)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showPasswordModal && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [showPasswordModal])

  function handlePersonClick(personId: string) {
    setSelectedPerson(personId)
    setPasswordInput('')
    setError(false)
    setShowPasswordModal(true)
  }

  function handlePasswordSubmit() {
    const correctPassword = selectedPerson === 'person-a' ? PASSWORD : PERSON_PASSWORD
    if (passwordInput === correctPassword) {
      setShowPasswordModal(false)
      navigate(`/timeline/${selectedPerson}`)
    } else {
      setError(true)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      handlePasswordSubmit()
    }
  }

  const personColor = selectedPerson === 'person-a' ? '#4f8ef7' : '#2ACFEE'

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
              onClick={() => handlePersonClick('person-a')}
            >
              <div className="person-avatar blue">L</div>
              <span className="person-name">Lingling</span>
            </div>
            <div
              className="person-card"
              onClick={() => handlePersonClick('person-b')}
            >
              <div className="person-avatar green">L</div>
              <span className="person-name">Lianlian</span>
            </div>
          </div>

          <p className="hint-text">输入密码进入各自的时间线</p>
        </div>
      </main>

      {/* Footer */}
      <Footer />

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="unlock-modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="unlock-modal" onClick={e => e.stopPropagation()}>
            {/* Avatar Circle */}
            <div
              className="unlock-avatar"
              style={{
                background: `linear-gradient(135deg, ${personColor} 0%, ${personColor}88 100%)`,
                boxShadow: `0 0 40px ${personColor}40`,
              }}
            >
              {selectedPerson === 'person-a' ? 'L' : 'l'}
            </div>

            {/* Name */}
            <h3 className="unlock-name">
              {selectedPerson === 'person-a' ? 'Lingling' : 'Lianlian'}
            </h3>
            <p className="unlock-desc">输入密码以解锁时间线</p>

            {/* Password Input */}
            <div className={`unlock-input-wrapper ${focused ? 'focused' : ''} ${error ? 'error' : ''}`}>
              <input
                ref={inputRef}
                type="password"
                className="unlock-input"
                placeholder="· · · · · ·"
                value={passwordInput}
                onChange={e => {
                  setPasswordInput(e.target.value)
                  setError(false)
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
              />
            </div>

            {/* Error Message */}
            {error && (
              <p className="unlock-error">
                <span>�</span> 密码错误，请重试
              </p>
            )}

            {/* Buttons */}
            <div className="unlock-actions">
              <button
                className="unlock-btn cancel"
                onClick={() => setShowPasswordModal(false)}
              >
                取消
              </button>
              <button
                className="unlock-btn confirm"
                style={{
                  background: `linear-gradient(135deg, ${personColor} 0%, ${personColor}cc 100%)`,
                }}
                onClick={handlePasswordSubmit}
              >
                解锁
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default HomePage
