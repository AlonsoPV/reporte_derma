import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function nowTime() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

export function shiftDate(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function startOfMonthISO(iso = todayISO()) {
  return `${iso.slice(0, 7)}-01`;
}

export function formatDisplayDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dt);
}

export type DatePreset = 'today' | 'yesterday' | 'week' | 'month';

export function resolveDatePreset(preset: DatePreset): { from: string; to: string } {
  const today = todayISO();
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'yesterday') {
    const y = shiftDate(today, -1);
    return { from: y, to: y };
  }
  if (preset === 'week') return { from: shiftDate(today, -6), to: today };
  return { from: startOfMonthISO(today), to: today };
}

export function detectDatePreset(from: string, to: string): DatePreset | null {
  const today = todayISO();
  if (from === today && to === today) return 'today';
  const yesterday = shiftDate(today, -1);
  if (from === yesterday && to === yesterday) return 'yesterday';
  if (from === shiftDate(today, -6) && to === today) return 'week';
  if (from === startOfMonthISO(today) && to === today) return 'month';
  return null;
}
