// Date ranges in the business time zone. Meta reports by calendar day in the ad account's
// time zone, so ranges are whole days except "today", which runs to now.

export type Preset = 'today' | 'yesterday' | 'last_7d' | 'custom';
export type Range = { since: string; until: string; start: number; end: number; label: string };

const DAY = 86_400_000;

export function ymdInTz(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
}

// Offset of the time zone from UTC at a given instant, in ms.
function tzOffset(ms: number, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(ms)
      .map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

// UTC instant of local midnight for a YYYY-MM-DD date in the time zone.
export function midnight(ymd: string, tz: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - tzOffset(guess, tz);
  t = guess - tzOffset(t, tz);
  return t;
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY).toISOString().slice(0, 10);
}

const isYmd = (s?: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function resolveRange(preset: Preset, tz: string, now: number, from?: string | null, to?: string | null): Range {
  const today = ymdInTz(now, tz);
  if (preset === 'yesterday') {
    const y = addDays(today, -1);
    return { since: y, until: y, start: midnight(y, tz), end: midnight(today, tz), label: 'Yesterday' };
  }
  if (preset === 'last_7d') {
    const s = addDays(today, -6);
    return { since: s, until: today, start: midnight(s, tz), end: now, label: 'Last 7 days' };
  }
  if (preset === 'custom' && isYmd(from) && isYmd(to)) {
    const [a, b] = from! <= to! ? [from!, to!] : [to!, from!];
    const end = b >= today ? now : midnight(addDays(b, 1), tz);
    return { since: a, until: b > today ? today : b, start: midnight(a, tz), end, label: `${a} to ${b}` };
  }
  return { since: today, until: today, start: midnight(today, tz), end: now, label: 'Today' };
}

// The equal length period right before the range. For "today so far" that is yesterday up to
// the same time of day; Meta numbers for it are the whole of yesterday.
export function previousRange(r: Range, tz: string): Range {
  const days = Math.round((midnight(addDays(r.until, 1), tz) - midnight(r.since, tz)) / DAY);
  const since = addDays(r.since, -days);
  const until = addDays(r.since, -1);
  const length = r.end - r.start;
  return { since, until, start: r.start - days * DAY, end: r.start - days * DAY + length, label: 'Previous period' };
}

export function hourInTz(ms: number, tz: string): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(ms)) % 24;
}
