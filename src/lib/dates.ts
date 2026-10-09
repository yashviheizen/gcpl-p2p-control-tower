import type { ISODate } from '@/data/types'

/** Fixed demo "today". Every relative calculation in the prototype uses this, never the system clock. */
export const DEMO_TODAY: ISODate = '2026-10-09'
/** Latest business date for which daily vendor reports are due (reports for D arrive on D+1). */
export const LATEST_DUE_DATE: ISODate = '2026-10-08'
export const DEMO_NOW = '2026-10-09T09:30:00+05:30'

export function parseISO(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day))
}
export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10)
}
export function addDays(d: ISODate, n: number): ISODate {
  const x = parseISO(d)
  x.setUTCDate(x.getUTCDate() + n)
  return toISO(x)
}
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86400000)
}
export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}
export function dayOfWeek(d: ISODate): number {
  return parseISO(d).getUTCDay()
}
export function monthOf(d: ISODate): string {
  return d.slice(0, 7)
}
export function monthStart(month: string): ISODate {
  return `${month}-01`
}
export function monthEnd(month: string): ISODate {
  const [y, m] = month.split('-').map(Number)
  return toISO(new Date(Date.UTC(y, m, 0)))
}
/** ISO week start (Monday) */
export function weekStart(d: ISODate): ISODate {
  const dow = dayOfWeek(d)
  return addDays(d, dow === 0 ? -6 : 1 - dow)
}
export function isSecondSaturday(d: ISODate): boolean {
  const x = parseISO(d)
  return x.getUTCDay() === 6 && x.getUTCDate() >= 8 && x.getUTCDate() <= 14
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function fmtDate(d: ISODate | null | undefined, withYear = false): string {
  if (!d) return '—'
  const x = parseISO(d)
  return `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}${withYear ? ` ${x.getUTCFullYear()}` : ''}`
}
export function fmtDateDow(d: ISODate): string {
  return `${DOW[dayOfWeek(d)]} ${fmtDate(d)}`
}
export function fmtDow(d: ISODate): string {
  return DOW[dayOfWeek(d)]
}
export function fmtMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}
/** Month-to-date label tied to the report cutoff, e.g. "Oct 2026 MTD"; earlier months are complete. */
export function fmtMonthToDate(month: string): string {
  const current = monthOf(LATEST_DUE_DATE)
  return month === current ? `${fmtMonth(month)} MTD` : month < current ? `${fmtMonth(month)} (full month)` : `${fmtMonth(month)} (not started)`
}
export function fmtDateTime(iso: string): string {
  const d = iso.slice(0, 10)
  const t = iso.slice(11, 16)
  return `${fmtDate(d, true)}, ${t}`
}
export function fmtRange(from: ISODate, to: ISODate): string {
  if (from === to) return fmtDate(from, true)
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  return `${fmtDate(from, !sameYear)} – ${fmtDate(to, true)}`
}
export function relativeAge(d: ISODate, ref: ISODate = DEMO_TODAY): string {
  const n = diffDays(ref, d)
  if (n === 0) return 'today'
  if (n === 1) return '1 day ago'
  return `${n} days ago`
}
