import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './env';

// Stable, unguessable link to a private file: /a/<base64url(path)>.<sig>
export function signPath(path: string): string {
  const p = Buffer.from(path).toString('base64url');
  const sig = createHmac('sha256', env.linkSecret()).update(p).digest('base64url').slice(0, 32);
  return `${p}.${sig}`;
}

export function verifyToken(token: string): string | null {
  const [p, sig] = token.split('.');
  if (!p || !sig) return null;
  const expected = createHmac('sha256', env.linkSecret()).update(p).digest('base64url').slice(0, 32);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return Buffer.from(p, 'base64url').toString();
}

export function fileLink(path: string): string {
  return `${env.siteUrl()}/a/${signPath(path)}`;
}
