import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl(), env.supabaseServiceKey(), { auth: { persistSession: false } });
  }
  return client;
}

export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const { data, error } = await db().rpc('hit_rate_limit', { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
    if (error) throw new Error(error.message);
    return data === true;
  } catch (e) {
    console.error('rate limit check failed', e);
    return true; // fail open so a database hiccup never blocks a real lead
  }
}

export function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
}
