import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin-auth';
import { getReport } from '@/lib/funnel/load';
import type { Preset } from '@/lib/funnel/range';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PRESETS: Preset[] = ['today', 'yesterday', 'last_7d', 'custom'];
const id = (v: string | null) => (v && /^[\w-]{1,40}$/.test(v) ? v : null);

// Funnel Health data for /admin/funnel. Admin cookie required; tokens never leave the server.
export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Log in again.' }, { status: 401 });
  const p = new URL(req.url).searchParams;
  const preset = (PRESETS.includes(p.get('range') as Preset) ? p.get('range') : 'today') as Preset;
  try {
    const report = await getReport({
      preset,
      from: p.get('from'),
      to: p.get('to'),
      filters: { campaign: id(p.get('campaign')), adset: id(p.get('adset')), ad: id(p.get('ad')), all: p.get('all') === '1' },
      demo: p.get('demo') === '1',
    });
    return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('funnel report failed', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Report failed' }, { status: 500 });
  }
}
