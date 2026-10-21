
import { useEffect, useState, type FormEvent } from 'react'
import App from './App'
import { checkAuth, login, logout, type AuthUser } from './api'
import './AuthGate.css'

export default function AuthGate() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true

    checkAuth()
      .then((currentUser) => {
        if (active) {
          setUser(currentUser)
        }
      })
      .catch(() => {
        if (active) {
          setError('Could not connect to the server. Please check that the backend is running.')
        }
      })
      .finally(() => {
        if (active) {
          setCheckingSession(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const loggedInUser = await login(username.trim(), password)
      setUser(loggedInUser)
      setPassword('')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Login failed. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLogout() {
    setError('')

    try {
      await logout()
      setUser(null)
      setPassword('')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not log out. Please try again.',
      )
    }
  }

  if (checkingSession) {
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <h1>SitePilot AI</h1>
          <p>Checking your administrator session...</p>
        </section>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <div className="auth-brand">
            <span className="auth-brand-icon">S</span>
            <div>
              <h1>SitePilot AI</h1>
              <p>Construction Operations Platform</p>
            </div>
          </div>

          <div className="auth-heading">
            <h2>Administrator sign in</h2>
            <p>Sign in to access your project workspace.</p>
          </div>

          <form onSubmit={handleLogin} className="auth-form">
            <label htmlFor="auth-username">Username</label>
            <input
              id="auth-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              maxLength={100}
              placeholder="Enter administrator username"
            />

            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              maxLength={256}
              placeholder="Enter your password"
            />

            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="auth-submit"
              disabled={submitting}
            >
              {submitting ? 'Signing in...' : 'Sign in securely'}
            </button>
          </form>

          <p className="auth-footer">
            Authorized administrator access only
          </p>
        </section>
      </main>
    )
  }

  return (
    <>
      <div className="auth-session-bar">
        <span>
          Signed in as <strong>{user.username}</strong>
        </span>
        <button type="button" onClick={handleLogout}>
          Sign out
        </button>
      </div>
      {error && (
        <p className="auth-session-error" role="alert">
          {error}
        </p>
      )}
      <App />
    </>
  )
}
