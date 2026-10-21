const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;
const MS_PER_DAY = 86_400_000;

/** Whole days since the Unix epoch for a `YYYY-MM-DD…` string, or null when missing or not a real calendar date. */
export function dayNumber(value?: string | null): number | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(ISO_DATE);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return time / MS_PER_DAY;
}

/** `to - from` in calendar days (time of day is ignored); null if either date is missing or invalid. */
export function diffDays(from?: string | null, to?: string | null): number | null {
  const start = dayNumber(from);
  const end = dayNumber(to);
  return start === null || end === null ? null : end - start;
}

export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function addDays(value: string, days: number): string {
  const base = dayNumber(value);
  if (base === null) throw new Error(`Invalid date: ${value}`);
  return new Date((base + days) * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Display form such as "Oct 8, 2026"; unparsable text is shown as-is and empty values as an em dash. */
export function formatDate(value?: string | null): string {
  if (!value || !value.trim()) return '—';
  const days = dayNumber(value);
  if (days === null) return value;
  return new Date(days * MS_PER_DAY).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatTime(value?: string | null): string {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—';
}
