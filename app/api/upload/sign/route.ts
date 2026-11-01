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
  const { data, error } = await db().storage.from(env.artworkBucket()).createSignedUploadUrl(path);
  if (error || !data) {
    console.error('signed upload failed', error);
    return NextResponse.json({ error: 'Upload is not available right now. Try again in a moment.' }, { status: 500 });
  }
  return NextResponse.json({ path, folder, ext, signedUrl: data.signedUrl });
}
