import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Footer from '../components/Footer'
import { getMe, getToken, login } from '../api/client'
import { showToast } from '../components/Toaster'

const PERSON_COLORS: Record<string, { color: string; name: string }> = {
  'person-a': { color: '#4f8ef7', name: 'Lingling' },
  'person-b': { color: '#10B981', name: 'Lianlian' },
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function HomePage() {
  const navigate = useNavigate()
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null)
  const [passwordInput, setPasswordInput] = useState('')
  const [error, setError] = useState(false)
  const [focused, setFocused] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showPasswordModal && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [showPasswordModal])

  // An unexpired token means we can skip the password prompt entirely.
  useEffect(() => {
    if (!getToken()) return
    let cancelled = false
    getMe()
      .then(person => {
        if (!cancelled) navigate('/timeline/' + person.id, { replace: true })
      })
      .catch(() => {
        /* stale token; stay on the landing page */
      })
    return () => {
      cancelled = true
    }
  }, [navigate])

  function handlePersonClick(personId: string) {
    setSelectedPerson(personId)
    setPasswordInput('')
    setError(false)
    setShowPasswordModal(true)
  }

  async function handlePasswordSubmit() {
    if (!selectedPerson || submitting) return
    setSubmitting(true)
    try {
      const result = await login(selectedPerson, passwordInput)
      setShowPasswordModal(false)
      navigate('/timeline/' + result.person.id)
    } catch (err) {
      setError(true)
      showToast(err instanceof Error ? err.message : '登录失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      void handlePasswordSubmit()
    }
  }

  const personColor = selectedPerson === 'person-b'
    ? '#64D5FF'
    : (selectedPerson ? PERSON_COLORS[selectedPerson].color : '#4f8ef7')

  return (
    <div className="app-container" data-theme={selectedPerson === 'person-b' ? 'lianlian' : 'lingling'}>
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
              data-theme="lingling"
              onClick={() => handlePersonClick('person-a')}
            >
              <div
                className="person-avatar"
                style={{
                  background: `linear-gradient(135deg, ${PERSON_COLORS['person-a'].color} 0%, ${hexToRgba(PERSON_COLORS['person-a'].color, 0.6)} 100%)`,
                  boxShadow: `0 0 30px ${PERSON_COLORS['person-a'].color}40`,
                }}
              >
                L
              </div>
              <span className="person-name">{PERSON_COLORS['person-a'].name}</span>
            </div>
            <div
              className="person-card"
              data-theme="lianlian"
              onClick={() => handlePersonClick('person-b')}
            >
              <div
                className="person-avatar"
                style={{
                  background: PERSON_COLORS['person-b'].color,
                  opacity: 0.8,
                  boxShadow: `0 0 30px ${PERSON_COLORS['person-b'].color}40`,
                }}
              >
                L
              </div>
              <span className="person-name">{PERSON_COLORS['person-b'].name}</span>
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
                background: personColor,
                boxShadow: `0 0 40px ${personColor}40`,
              }}
            >
              {selectedPerson === 'person-a' ? 'L' : 'l'}
            </div>

            {/* Name */}
            <h3 className="unlock-name">
              {selectedPerson ? PERSON_COLORS[selectedPerson].name : ''}
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
                <span aria-hidden="true">⚠</span> 密码错误，请重试
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
                onClick={() => void handlePasswordSubmit()}
                disabled={submitting || passwordInput.length === 0}
              >
                {submitting ? '解锁中...' : '解锁'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default HomePage
