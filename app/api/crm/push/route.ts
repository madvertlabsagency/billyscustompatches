import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/crm-auth';
import { db } from '@/lib/supabase';
import { pushConfigured, sendTestPush } from '@/lib/push';

// Saves this phone or computer for CRM notifications, for the person signed in.
const sub = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(8).max(100) }) });

export async function POST(req: Request) {
  const u = await getUser();
  if (!u) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: 'Notifications are not set up on the server yet.' }, { status: 503 });
  const body = await req.json().catch(() => null);
  const parsed = sub.safeParse(body?.subscription);
  if (!parsed.success) return NextResponse.json({ error: 'That device subscription is not valid.' }, { status: 400 });
  const row = {
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
    member_id: u.isOwner ? null : u.member!.id,
    is_owner: u.isOwner,
    user_agent: (req.headers.get('user-agent') || '').slice(0, 300),
  };
  const { data, error } = await db().from('push_subscriptions').upsert(row, { onConflict: 'endpoint' }).select('id, endpoint, p256dh, auth').single();
  if (error || !data) return NextResponse.json({ error: 'Could not save this device. Try again.' }, { status: 500 });
  const sent = body?.test ? await sendTestPush([data as { id: string; endpoint: string; p256dh: string; auth: string }]) : 0;
  return NextResponse.json({ ok: true, sent });
}

export async function DELETE(req: Request) {
  const u = await getUser();
  if (!u) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
  if (endpoint) {
    let q = db().from('push_subscriptions').delete().eq('endpoint', endpoint);
    q = u.isOwner ? q.eq('is_owner', true) : q.eq('member_id', u.member!.id);
    await q;
  }
  return NextResponse.json({ ok: true });
}
