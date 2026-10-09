import { AlertCircle, Eye, EyeOff, FlaskConical } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { cx } from '@/components/ui'
import { DEMO_CREDENTIALS, checkDemoCredentials, isSignedIn, safeReturnPath, signIn } from '@/lib/session'

const inputCls = 'h-9 w-full rounded-[var(--radius-control)] border bg-surface px-3 text-body text-ink placeholder:text-ink-subtle focus-visible:border-accent'

export default function Login() {
  const [params] = useSearchParams()
  const next = params.get('next')
  const navigate = useNavigate()
  const [username, setUsername] = useState<string>(DEMO_CREDENTIALS.username)
  const [password, setPassword] = useState<string>(DEMO_CREDENTIALS.password)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(false)
  const passRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const errorId = `${id}-error`

  useEffect(() => {
    document.title = 'Sign in · GCPL P2P Control Tower · Demo'
    return () => {
      document.title = 'GCPL P2P Control Tower · Demo'
    }
  }, [])

  if (isSignedIn()) return <Navigate to={safeReturnPath(next)} replace />

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!checkDemoCredentials(username, password)) {
      setError(true)
      passRef.current?.select()
      return
    }
    signIn()
    navigate(safeReturnPath(next), { replace: true })
  }
  const edit = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    set(e.target.value)
    if (error) setError(false)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="rounded-[var(--radius-card)] border border-line bg-surface px-8 pt-9 pb-8 shadow-[var(--shadow-card)]">
          <div className="flex flex-col items-center text-center">
            <div aria-hidden className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-dense font-bold text-white">
              P2P
            </div>
            <h1 className="mt-4 text-heading font-semibold tracking-tight text-ink">GCPL P2P Control Tower</h1>
            <p className="mt-1 text-body text-ink-muted">Sign in to explore the demo</p>
          </div>

          <div className="mt-6 rounded-[var(--radius-control)] border border-warn-line bg-warn-soft px-3 py-2.5 text-dense text-ink">
            <div className="flex items-center gap-1.5 font-semibold text-warn">
              <FlaskConical size={14} aria-hidden /> Demo access only
            </div>
            <p className="mt-1 text-ink-muted">
              Public demo credentials are prefilled: <span className="font-medium text-ink">{DEMO_CREDENTIALS.username}</span> / <span className="num font-medium text-ink">{DEMO_CREDENTIALS.password}</span>
            </p>
          </div>

          <form onSubmit={submit} noValidate className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-user`} className="text-dense font-medium text-ink">
                Username
              </label>
              <input
                id={`${id}-user`}
                name="username"
                type="text"
                autoComplete="username"
                spellCheck={false}
                value={username}
                onChange={edit(setUsername)}
                aria-invalid={error || undefined}
                aria-describedby={error ? errorId : undefined}
                className={cx(inputCls, error ? 'border-bad-line' : 'border-line-strong')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-pass`} className="text-dense font-medium text-ink">
                Password
              </label>
              <div className="relative">
                <input
                  ref={passRef}
                  id={`${id}-pass`}
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={edit(setPassword)}
                  aria-invalid={error || undefined}
                  aria-describedby={error ? errorId : undefined}
                  className={cx(inputCls, 'pr-10', error ? 'border-bad-line' : 'border-line-strong')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  aria-controls={`${id}-pass`}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute top-1/2 right-1 inline-flex h-7 w-8 -translate-y-1/2 items-center justify-center rounded text-ink-muted hover:bg-black/5 hover:text-ink"
                >
                  {showPassword ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                </button>
              </div>
            </div>
            {error && (
              <p id={errorId} role="alert" className="flex items-start gap-1.5 text-dense text-bad">
                <AlertCircle size={14} className="mt-[2px] shrink-0" aria-hidden />
                Incorrect demo credentials. Use the public demo username and password shown above.
              </p>
            )}
            <button type="submit" className="mt-1 inline-flex h-9 w-full items-center justify-center rounded-[var(--radius-control)] bg-accent text-body font-medium text-white transition-colors hover:bg-accent-hover active:bg-accent-ink">
              Sign in
            </button>
          </form>
        </div>
        <p className="mt-4 px-2 text-center text-label text-ink-subtle">Simulated sign-in for a prototype with synthetic data. No backend authentication or single sign-on is connected, and nothing is sent anywhere.</p>
      </div>
    </main>
  )
}
