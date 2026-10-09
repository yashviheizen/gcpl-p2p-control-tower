// Simulated demo sign-in. Prototype only – no backend, no real authentication.
// The credentials below are fictional and intentionally public; they unlock nothing but this demo UI.
import { ROUTE_PERMS } from '@/app/nav'
import { store } from './store'

export const DEMO_CREDENTIALS = { username: 'planner@example.com', password: 'DemoP2P2026!' } as const

// A session cookie (no expiry) lasts until the browser is closed and is shared across tabs.
const COOKIE = 'gcpl-p2p-demo-session'

export function isSignedIn(): boolean {
  try {
    return document.cookie.split('; ').includes(`${COOKIE}=1`)
  } catch {
    return false
  }
}

function writeCookie(value: string, extra = '') {
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${COOKIE}=${value}; Path=${import.meta.env.BASE_URL}; SameSite=Lax${secure}${extra}`
}

export function checkDemoCredentials(username: string, password: string): boolean {
  return username.trim().toLowerCase() === DEMO_CREDENTIALS.username && password === DEMO_CREDENTIALS.password
}

/** Starts the demo session as the Supply Planner persona (switchable afterwards under Demo controls). */
export function signIn() {
  store.set((s) => ({ ...s, persona: 'planner' }))
  writeCookie('1')
}

export function signOut() {
  writeCookie('', '; Max-Age=0')
}

/** Only internal app paths the current persona may open; anything else falls back to Overview. */
export function safeReturnPath(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/login')) return '/'
  const pathname = next.split(/[?#]/)[0]
  const s = store.get()
  const group = s.groups.find((g) => g.id === s.personaGroup[s.persona]) ?? s.groups[0]
  const rule = ROUTE_PERMS.find((r) => pathname.startsWith(r.prefix))
  if (rule && !group.permissions.includes(rule.perm)) return '/'
  return next
}
