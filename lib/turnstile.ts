import 'server-only';
import { env } from './env';

export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = env.turnstileSecret();
  if (!secret) return true; // not configured yet (local development)
  if (!token) return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  });
  const data = (await res.json().catch(() => ({}))) as { success?: boolean };
  return data.success === true;
}
