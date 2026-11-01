import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { env } from '@/lib/env';
import { nudgeUnverified, processRequest } from '@/lib/service';
import type { QuoteRow } from '@/lib/sync';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Vercel Cron: retries failed GHL syncs on their backoff schedule and picks up any
// request whose first attempt never finished.
export async function GET(req: Request) {
  const secret = env.cronSecret();
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const now = new Date().toISOString();
  const stale = new Date(Date.now() - 3 * 60000).toISOString();
  const [due, stuck] = await Promise.all([
    db().from('quote_requests').select('id').in('status', ['failed', 'needs_setup']).lte('next_attempt_at', now).limit(25),
    db().from('quote_requests').select('id').eq('status', 'pending').lte('created_at', stale).limit(25),
  ]);
  const since = new Date(Date.now() - 48 * 3600000).toISOString();
  const { data: unsent } = await db()
    .from('quote_requests')
    .select('id')
    .in('status', ['synced', 'done'])
    .eq('email_sent', false)
    .gte('created_at', since)
    .lte('created_at', stale)
    .limit(25);
  const ids = [...new Set([...(due.data || []), ...(stuck.data || []), ...(unsent || [])].map((r) => r.id as string))];
  const results: Record<string, string> = {};
  for (const id of ids) {
    results[id] = await processRequest(id).catch((e) => `error: ${e instanceof Error ? e.message : e}`);
  }
  // Customers who have not verified on WhatsApp 10 minutes after submitting get one nudge.
  // With GHL the nudge is a GHL workflow instead (docs/GHL-WORKFLOWS.md).
  if (env.crmProvider() === 'ghl') return NextResponse.json({ processed: ids.length, results });
  const nudgeFrom = new Date(Date.now() - 24 * 3600000).toISOString();
  const nudgeTo = new Date(Date.now() - 10 * 60000).toISOString();
  const { data: unverified } = await db()
    .from('quote_requests')
    .select('*')
    .is('whatsapp_verified_at', null)
    .is('nudge_sent_at', null)
    .gte('created_at', nudgeFrom)
    .lte('created_at', nudgeTo)
    .limit(25);
  for (const row of unverified || []) await nudgeUnverified(row as QuoteRow).catch((e) => console.error('nudge failed', e));

  return NextResponse.json({ processed: ids.length, results, nudged: (unverified || []).length });
}
