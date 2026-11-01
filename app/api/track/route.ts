import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendCapi } from '@/lib/capi';
import { clientIp, rateLimit } from '@/lib/supabase';

export const runtime = 'nodejs';

const ALLOWED = ['PageView', 'ViewContent', 'StartRFQ', 'PatchTypeSelected', 'ArtworkUploaded'] as const;
const body = z.object({
  eventName: z.enum(ALLOWED),
  eventId: z.string().min(8).max(80),
  url: z.string().max(1000).optional(),
  fbp: z.string().max(200).optional(),
  fbc: z.string().max(500).optional(),
  customData: z.record(z.union([z.string(), z.number()])).optional(),
});

// Mirrors browser Pixel events to the Conversions API with the same event_id for deduplication.
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!(await rateLimit(`track:${ip}`, 120, 600))) return NextResponse.json({ ok: false }, { status: 429 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const e = parsed.data;
  await sendCapi({
    eventName: e.eventName,
    eventId: e.eventId,
    sourceUrl: e.url,
    fbp: e.fbp,
    fbc: e.fbc,
    ip,
    userAgent: req.headers.get('user-agent') || undefined,
    customData: e.customData,
  });
  return NextResponse.json({ ok: true });
}
