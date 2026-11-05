import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ARTWORK_EXTENSIONS, extOf } from '@/lib/options';
import { clientIp, db, rateLimit } from '@/lib/supabase';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

const body = z.object({ name: z.string().min(1).max(200), size: z.number().int().positive(), folder: z.string().uuid().optional() });

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!(await rateLimit(`upload:${ip}`, 40, 600))) {
    return NextResponse.json({ error: 'Too many uploads. Wait a few minutes and try again.' }, { status: 429 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid upload request.' }, { status: 400 });
  const { name, size } = parsed.data;
  const ext = extOf(name);
  if (!(ARTWORK_EXTENSIONS as readonly string[]).includes(ext)) {
    return NextResponse.json({ error: `${name} is not a supported file type. Use PNG, JPG, PDF, AI, EPS or SVG.` }, { status: 400 });
  }
  const max = env.maxMb();
  if (size > max * 1024 * 1024) {
    return NextResponse.json({ error: `${name} is over ${max} MB. Upload a smaller version.` }, { status: 400 });
  }
  const folder = parsed.data.folder || randomUUID();
  const path = `rfq/${folder}/${randomUUID()}.${ext}`;
  try {
    const { data, error } = await db().storage.from(env.artworkBucket()).createSignedUploadUrl(path);
    if (error || !data) throw new Error(error?.message || 'no signed url');
    return NextResponse.json({ path, folder, ext, signedUrl: data.signedUrl });
  } catch (e) {
    // Storage missing or not configured: say so in JSON, so the form can offer "send it later".
    console.error('signed upload failed', e);
    return NextResponse.json({ error: 'Upload is not available right now. Tick "send it later" and email or WhatsApp your file after.' }, { status: 503 });
  }
}
