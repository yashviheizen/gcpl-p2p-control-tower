import { ChevronDown, ChevronsLeft, ChevronsRight, Lock, LogOut, RotateCcw, UserCircle2 } from 'lucide-react'
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ASSISTANT_WIDTH, AskP2PButton, AssistantDrawer } from '@/components/AssistantPanel'
import { FilterBar } from '@/components/FilterBar'
import { Button, DemoBadge, EmptyState, Loading, Modal, cx, useDismiss } from '@/components/ui'
import { SCENARIO, SCENARIO_KEY, scaleVendors, type DemoScenario } from '@/data/master'
import type { PersonaId } from '@/data/types'
import { DEMO_TODAY, fmtDateDow } from '@/lib/dates'
import { useFilters } from '@/lib/filters'
import { isSignedIn, signOut } from '@/lib/session'
import { logActivity, PERSONAS, store, useAppState, useExceptions, usePermissions } from '@/lib/store'
import { NAV, ROUTE_PERMS } from './nav'

/** Shows the full label as a tooltip only when the visible label is truncated. */
function fullLabelIfClipped(e: { currentTarget: HTMLElement }) {
  const el = e.currentTarget
  const text = el.querySelector<HTMLElement>('[data-nav-label]')
  if (!text) return
  if (text.scrollWidth > text.clientWidth) el.title = text.textContent ?? ''
  else el.removeAttribute('title')
}

function Sidebar() {
  const collapsed = useAppState((s) => s.sidebarCollapsed)
  const { can } = usePermissions()
  const exceptions = useExceptions()
  const openCount = exceptions.filter((e) => e.status === 'Open' || e.status === 'Investigating' || e.status === 'Waiting on vendor').length
  const loc = useLocation()
  const isActiveItem = (i: { to: string; end?: boolean }) => (i.end ? loc.pathname === i.to : loc.pathname.startsWith(i.to))
  const activeGroup = NAV.find((g) => g.items.some(isActiveItem))?.id ?? null
  // Manual expand/collapse per section (several can stay open). Entering a section re-opens it so the current page is visible.
  const [open, setOpen] = useState<Record<string, boolean>>(() => (activeGroup ? { [activeGroup]: true } : {}))
  const [seenGroup, setSeenGroup] = useState(activeGroup)
  if (seenGroup !== activeGroup) {
    setSeenGroup(activeGroup)
    if (activeGroup && !open[activeGroup]) setOpen({ ...open, [activeGroup]: true })
  }
  const toggleGroup = (id: string, current: boolean) => setOpen({ ...open, [id]: !current })

  return (
    <nav aria-label="Main navigation" className={cx('flex h-full shrink-0 flex-col border-r border-line bg-nav text-nav-ink transition-[width] duration-150', collapsed ? 'w-[60px]' : 'w-[236px]')}>
      <div className={cx('flex h-12 items-center gap-2.5 border-b border-line', collapsed ? 'justify-center px-2' : 'px-4')}>
        <div aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-label font-bold text-white">
          P2P
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="truncate text-body font-semibold text-nav-ink-strong">GCPL P2P</div>
            <div className="text-label text-nav-muted">Control Tower</div>
          </div>
        )}
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto py-2">
        {NAV.map((g, gi) => {
          const items = g.items.filter((i) => can(i.perm))
          if (!items.length) return null
          const isOpen = g.label == null || collapsed || !!open[g.id]
          const nested = g.label != null && !collapsed
          const listId = `nav-${g.id}`
          return (
            // 14px between groups (expanded); the collapsed rail keeps its divider rhythm.
            <div key={g.id} className={cx('px-2', gi > 0 && !collapsed && 'mt-[14px]')}>
              {nested && (
                <button
                  type="button"
                  onClick={() => toggleGroup(g.id, isOpen)}
                  aria-expanded={isOpen}
                  aria-controls={listId}
                  className="flex h-7 w-full items-center justify-between rounded-md px-2.5 text-label font-semibold text-ink-muted transition-colors hover:bg-nav-hover hover:text-nav-ink-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                  <span className="truncate">{g.label}</span>
                  <ChevronDown size={14} aria-hidden className={cx('shrink-0 text-nav-muted transition-transform', !isOpen && '-rotate-90')} />
                </button>
              )}
              {g.label && collapsed && <div className="mx-2 my-1 border-t border-line" aria-hidden />}
              {isOpen && (
                // Child links sit ~16px right of the section label, beside a thin guide line.
                <ul id={listId} aria-label={nested ? (g.label ?? undefined) : undefined} className={cx(nested && 'mt-0.5 ml-[9px] space-y-px border-l border-line pl-1.5')}>
                  {items.map((i) => (
                    <li key={i.to}>
                      <NavLink
                        to={i.to}
                        end={i.end}
                        title={collapsed ? i.label : undefined}
                        onPointerEnter={collapsed ? undefined : fullLabelIfClipped}
                        onFocus={collapsed ? undefined : fullLabelIfClipped}
                        className={({ isActive }) =>
                          cx(
                            'relative flex h-8 items-center gap-2.5 rounded-md text-body transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
                            collapsed ? 'justify-center' : 'px-2.5',
                            isActive ? 'bg-nav-active font-medium text-nav-active-ink' : 'text-nav-ink hover:bg-nav-hover hover:text-nav-ink-strong',
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && <span aria-hidden className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r bg-accent" />}
                            <i.icon size={16} aria-hidden className="shrink-0" />
                            {!collapsed && (
                              <span data-nav-label className="min-w-0 flex-1 truncate">
                                {i.label}
                              </span>
                            )}
                            {!collapsed && i.to === '/exceptions' && openCount > 0 && (
                              <span className="num rounded-full bg-black/[0.06] px-1.5 text-label text-nav-ink-strong" aria-label={`${openCount} active exceptions`}>
                                {openCount}
                              </span>
                            )}
                          </>
                        )}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
      <div className="border-t border-line p-2">
        <button
          type="button"
          onClick={() => store.set((s) => ({ ...s, sidebarCollapsed: !s.sidebarCollapsed }))}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cx('flex h-8 w-full items-center gap-2 rounded-md text-dense text-nav-muted hover:bg-nav-hover hover:text-nav-ink-strong', collapsed ? 'justify-center' : 'px-2.5')}
        >
          {collapsed ? <ChevronsRight size={16} aria-hidden /> : <ChevronsLeft size={16} aria-hidden />}
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </nav>
  )
}

/** Demo date, persona switching and reset grouped in one accessible menu. */
/** Switching scenario rebuilds the deterministic dataset, so it reloads the app. */
function switchScenario(id: DemoScenario) {
  try {
    localStorage.setItem(SCENARIO_KEY, id)
  } catch {
    /* storage unavailable */
  }
  const u = new URL(window.location.href)
  u.searchParams.delete('scenario')
  window.location.replace(u.toString())
}

function DemoControls({ onReset }: { onReset: () => void }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useDismiss<HTMLDivElement>(open, close)
  const persona = useAppState((s) => s.persona)
  const { group, user } = usePermissions()
  const current = PERSONAS.find((p) => p.id === persona)!
  const navigate = useNavigate()
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="demo-controls"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-dense text-ink shadow-[var(--shadow-card)] hover:bg-surface-muted"
      >
        <UserCircle2 size={16} aria-hidden className="text-ink-muted" />
        <span className="hidden sm:inline">Demo controls</span>
        <span className="hidden text-ink-muted md:inline">· {current.label}</span>
        <ChevronDown size={14} aria-hidden className="text-ink-subtle" />
      </button>
      {open && (
        <div id="demo-controls" role="dialog" aria-label="Demo controls" className="absolute top-10 right-0 z-50 w-[300px] rounded-[var(--radius-card)] border border-line bg-surface p-1 shadow-[var(--shadow-pop)]">
          <div className="px-3 pt-2 pb-2.5">
            <div className="text-label text-ink-muted">Demo date (fixed for all calculations)</div>
            <div className="text-body font-medium text-ink">{fmtDateDow(DEMO_TODAY)} 2026</div>
          </div>
          <fieldset className="border-t border-line px-1 pt-2 pb-1">
            <legend className="px-2 pt-2 text-label text-ink-muted">Persona (simulated permissions)</legend>
            {PERSONAS.map((p) => (
              <label key={p.id} className={cx('flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface-muted', p.id === persona && 'bg-accent-soft')}>
                <input
                  type="radio"
                  name="demo-persona"
                  value={p.id}
                  checked={p.id === persona}
                  onChange={() => {
                    store.set((s) => ({ ...s, persona: p.id as PersonaId }))
                    logActivity('Administration', 'Switched demo persona', p.label)
                  }}
                  className="accent-[var(--color-accent)]"
                />
                <span className="min-w-0">
                  <span className="block text-body text-ink">{p.label}</span>
                  <span className="block text-label text-ink-muted">{p.user}</span>
                </span>
              </label>
            ))}
            <p className="px-2 pt-1 text-label text-ink-subtle">
              Signed in as {user} · {group.name}. Prototype simulation, not production security.
            </p>
          </fieldset>
          <fieldset className="border-t border-line px-1 pt-2 pb-1">
            <legend className="px-2 pt-2 text-label text-ink-muted">Dataset scenario</legend>
            {(
              [
                ['core', 'Core demo · 10 vendors', 'Five original and five generated demo vendors; not verified GCPL master data'],
                ['scale', `Scale test · ${5 + scaleVendors.length} vendors`, 'Adds generated vendors to test density – not GCPL master data'],
              ] as const
            ).map(([id, label, hint]) => (
              <label key={id} className={cx('flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface-muted', id === SCENARIO && 'bg-accent-soft')}>
                <input type="radio" name="demo-scenario" value={id} checked={id === SCENARIO} onChange={() => switchScenario(id)} className="accent-[var(--color-accent)]" />
                <span className="min-w-0">
                  <span className="block text-body text-ink">{label}</span>
                  <span className="block text-label text-ink-muted">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="border-t border-line p-1 pt-1.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onReset()
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-body text-ink hover:bg-surface-muted"
            >
              <RotateCcw size={15} aria-hidden className="text-ink-muted" /> Reset demo data…
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                signOut()
                navigate('/login', { replace: true })
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-body text-ink hover:bg-surface-muted"
            >
              <LogOut size={15} aria-hidden className="text-ink-muted" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function TopBar() {
  const [resetOpen, setResetOpen] = useState(false)
  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
      <DemoBadge title="Prototype with deterministic demo data – not connected to GCPL systems. Demo date and persona are under Demo controls.">Demo</DemoBadge>
      {SCENARIO === 'scale' && (
        <span title="Includes generated scale-test vendors (demo only, not GCPL master data). Switch under Demo controls." className="rounded-full border border-warn-line bg-warn-soft px-2 py-0.5 text-label text-warn">
          Scale test · generated vendors
        </span>
      )}
      <span className="sr-only">Prototype with deterministic demo data, not connected to GCPL systems.</span>
      <div className="ml-auto flex items-center gap-2">
        <AskP2PButton />
        <DemoControls onReset={() => setResetOpen(true)} />
      </div>
      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset demo data?"
        footer={
          <>
            <Button onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                store.reset()
                localStorage.removeItem('gcpl-p2p-filters-v1')
                location.assign(import.meta.env.BASE_URL)
              }}
            >
              Reset local demo state
            </Button>
          </>
        }
      >
        <p className="text-body text-ink-muted">This clears exception edits, uploaded demo batches, plan activations, master-data edits, permission changes and filters stored in this browser. The fixture dataset is unchanged.</p>
      </Modal>
    </div>
  )
}

function RouteGuard({ children }: { children: ReactNode }) {
  const loc = useLocation()
  const { can, group } = usePermissions()
  const rule = ROUTE_PERMS.find((r) => loc.pathname.startsWith(r.prefix))
  if (rule && !can(rule.perm))
    return (
      <EmptyState
        icon={Lock}
        title="Not available for this demo persona"
        action={
          <Link className="text-body font-medium text-accent-ink underline" to="/">
            Go to overview
          </Link>
        }
      >
        The “{group.name}” permission group does not include access to this section. Switch persona or adjust the group under Administration → Permission groups. (Prototype simulation – not production security.)
      </EmptyState>
    )
  if (loc.pathname === '/' && !can('view.overview')) return <EmptyState icon={Lock} title="Overview not available for this persona" />
  return <>{children}</>
}

/** Simulated demo session: signed-out visitors go to the login screen and come back to the requested route afterwards. */
export function SignedInShell() {
  const loc = useLocation()
  if (!isSignedIn()) {
    const back = loc.pathname + loc.search
    return <Navigate to={back === '/' ? '/login' : `/login?next=${encodeURIComponent(back)}`} replace />
  }
  return <AppShell />
}

const MIN_DASHBOARD_WIDTH = 900

export function AppShell() {
  const { applicable } = useFilters()
  const { pathname } = useLocation()
  // Dock the assistant (reserve space) only when the dashboard keeps a usable width; otherwise it overlays.
  const rowRef = useRef<HTMLDivElement>(null)
  const [rowWidth, setRowWidth] = useState(0)
  useLayoutEffect(() => {
    const el = rowRef.current
    if (!el) return
    setRowWidth(el.clientWidth)
    const ro = new ResizeObserver(([e]) => setRowWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const docked = rowWidth - ASSISTANT_WIDTH >= MIN_DASHBOARD_WIDTH
  // The main pane scrolls, not the window – start each new page at the top.
  useEffect(() => {
    document.getElementById('main')?.scrollTo(0, 0)
  }, [pathname])
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <a href="#main" className="sr-only z-50 rounded bg-surface px-3 py-2 focus:not-sr-only focus:absolute focus:top-2 focus:left-2">
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {applicable.length > 0 && <FilterBar />}
        <div ref={rowRef} className="relative flex min-h-0 flex-1">
          <main id="main" className="scroll-thin min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-4" tabIndex={-1}>
            <div className="mx-auto max-w-[1600px]">
              <RouteGuard>
                <Suspense fallback={<Loading />}>
                  <Outlet />
                </Suspense>
              </RouteGuard>
            </div>
          </main>
          <AssistantDrawer docked={docked} />
        </div>
      </div>
    </div>
  )
}
