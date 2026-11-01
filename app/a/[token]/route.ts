import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/token';
import { signedUrl } from '@/lib/service';

export const runtime = 'nodejs';

// Stable link stored in GHL. Each click gets a fresh 10 minute signed URL to the private file.
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const path = verifyToken(token);
  if (!path) return new NextResponse('Link not valid', { status: 404 });
  const url = await signedUrl(path, 600);
  if (!url) return new NextResponse('File not found', { status: 404 });
  return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'no-store' } });
}
