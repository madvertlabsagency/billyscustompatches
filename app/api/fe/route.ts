import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clientIp, rateLimit } from '@/lib/supabase';
import { FUNNEL_EVENTS, SERVER_ONLY_EVENTS } from '@/lib/funnel/events';
import { insertEvents, isBot, type EventRow } from '@/lib/funnel/server';

export const runtime = 'nodejs';

const str = (n: number) => z.string().max(n).optional();
const browserEvents = FUNNEL_EVENTS.filter((e) => !SERVER_ONLY_EVENTS.includes(e)) as [string, ...string[]];

const body = z.object({
  sid: z.string().min(8).max(64),
  vid: z.string().min(8).max(64),
  sentAt: z.number(),
  ctx: z.object({
    utm_source: str(300), utm_medium: str(300), utm_campaign: str(300), utm_content: str(300), fbclid: str(300),
    campaign_id: str(40), adset_id: str(40), ad_id: str(40),
    device: z.enum(['mobile', 'tablet', 'desktop']),
    referrer: str(200),
  }),
  events: z
    .array(
      z.object({
        e: z.enum(browserEvents),
        step: z.number().int().min(1).max(7).optional(),
        meta: z.record(z.unknown()).optional(),
        t: z.number(),
      }),
    )
    .min(1)
    .max(50),
});

// Receives batched funnel events from the landing page. Always answers fast and never
// makes the visitor wait; bad or abusive input is dropped.
export async function POST(req: Request) {
  if (isBot(req.headers.get('user-agent'))) return new NextResponse(null, { status: 204 });
  const ip = clientIp(req);
  if (!(await rateLimit(`fe:${ip}`, 300, 600))) return new NextResponse(null, { status: 429 });
  const text = await req.text().catch(() => '');
  if (text.length > 64_000) return new NextResponse(null, { status: 413 });
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const { sid, vid, sentAt, ctx, events } = parsed.data;
  const now = Date.now();
  const rows: EventRow[] = events.map((ev) => {
    // Keep the browser's event order but trust the server clock: shift by how long ago the event happened.
    const ago = Math.min(Math.max(sentAt - ev.t, 0), 3_600_000);
    const meta = ev.meta && JSON.stringify(ev.meta).length <= 2000 ? ev.meta : {};
    return {
      session_id: sid,
      visitor_id: vid,
      event: ev.e,
      step: ev.step ?? null,
      meta,
      utm_source: ctx.utm_source || null,
      utm_medium: ctx.utm_medium || null,
      utm_campaign: ctx.utm_campaign || null,
      utm_content: ctx.utm_content || null,
      fbclid: ctx.fbclid || null,
      campaign_id: ctx.campaign_id || null,
      adset_id: ctx.adset_id || null,
      ad_id: ctx.ad_id || null,
      device: ctx.device,
      referrer: ctx.referrer || null,
      created_at: new Date(now - ago).toISOString(),
    };
  });
  await insertEvents(rows);
  return new NextResponse(null, { status: 204 });
}
