import type { CalendarException, ISODate, OperatingCalendar, Vendor } from '@/data/types'
import { dayOfWeek, isSecondSaturday } from './dates'

export interface CalendarContext {
  calendars: OperatingCalendar[]
  calendarExceptions: CalendarException[]
}

export interface DayInfo {
  operating: boolean
  reason: string | null
}

export function operatingDayInfo(ctx: CalendarContext, vendor: Vendor, date: ISODate): DayInfo {
  const cal = ctx.calendars.find((c) => c.id === vendor.calendarId)
  const ex = ctx.calendarExceptions.find((e) => e.date === date && (e.calendarId === 'ALL' || e.calendarId === vendor.calendarId))
  if (ex) {
    if (ex.type === 'Extra working day') return { operating: true, reason: ex.reason }
    return { operating: false, reason: `${ex.type}: ${ex.reason}` }
  }
  if (!cal) return { operating: true, reason: null }
  if (cal.weeklyOff.includes(dayOfWeek(date))) return { operating: false, reason: 'Weekly off' }
  if (cal.offSecondSaturday && isSecondSaturday(date)) return { operating: false, reason: 'Second Saturday off' }
  return { operating: true, reason: null }
}

export function isOperating(ctx: CalendarContext, vendor: Vendor, date: ISODate): boolean {
  return operatingDayInfo(ctx, vendor, date).operating
}
