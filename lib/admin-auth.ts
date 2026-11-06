import 'server-only';
// Logins for the Madvert Labs Patches CRM.
// Two kinds of people sign in: team members with their own email and password, and the Madvert Labs
// admin with the master password (ADMIN_PASSWORD), who sees every client account.
// The session cookie is signed and carries who is logged in and which client account they opened.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from './env';

const COOKIE = 'cpl_admin';
const DAYS = 30;

export type Session = { exp: number; user: string; account: string };
export const OWNER = 'owner';

const sign = (payload: string) => createHmac('sha256', env.linkSecret()).update(`crm:${payload}`).digest('base64url');

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function passwordMatches(given: string): boolean {
  const real = env.adminPassword();
  if (!real || real.length < 10) return false; // refuse weak or missing passwords
  const a = createHmac('sha256', 'cmp').update(given).digest();
  const b = createHmac('sha256', 'cmp').update(real).digest();
  return timingSafeEqual(a, b);
}

// scrypt with a random salt, stored as scrypt$salt$hash.
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('base64url');
  const hash = scryptSync(password, salt, 32).toString('base64url');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  const [kind, salt, hash] = (stored || '').split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  return safeEqual(scryptSync(password, salt, 32).toString('base64url'), hash);
}

export async function startSession(user: string, account = ''): Promise<void> {
  const s: Session = { exp: Date.now() + DAYS * 86400000, user, account };
  const payload = Buffer.from(JSON.stringify(s)).toString('base64url');
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
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

export async function readSession(): Promise<Session | null> {
  const v = (await cookies()).get(COOKIE)?.value || '';
  const [payload, sig] = v.split('.');
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Session;
    if (!s.exp || s.exp < Date.now() || !s.user) return null;
    return s;
  } catch {
    return null;
  }
}
