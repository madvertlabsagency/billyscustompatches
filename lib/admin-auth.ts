import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from './env';

const COOKIE = 'cpl_admin';
const DAYS = 14;

function sign(exp: number): string {
  return createHmac('sha256', env.linkSecret()).update(`admin:${exp}`).digest('base64url');
}

export function passwordMatches(given: string): boolean {
  const real = env.adminPassword();
  if (!real || real.length < 10) return false; // refuse weak or missing passwords
  const a = createHmac('sha256', 'cmp').update(given).digest();
  const b = createHmac('sha256', 'cmp').update(real).digest();
  return timingSafeEqual(a, b);
}

export async function startSession(): Promise<void> {
  const exp = Date.now() + DAYS * 86400000;
  (await cookies()).set(COOKIE, `${exp}.${sign(exp)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DAYS * 86400,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const v = (await cookies()).get(COOKIE)?.value || '';
  const [expStr, sig] = v.split('.');
  const exp = Number(expStr);
  if (!exp || !sig || exp < Date.now()) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(exp));
  return a.length === b.length && timingSafeEqual(a, b);
}
