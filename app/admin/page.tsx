import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin-auth';
import { db } from '@/lib/supabase';
import { fileLink } from '@/lib/token';
import { ownerWhatsAppLink } from '@/lib/service';
import { summaryRows, type QuoteRow } from '@/lib/sync';
import { logout, updateLead } from './actions';
import { BUSINESS } from '@/lib/options';
import { withBase } from '@/lib/base';

export const metadata: Metadata = { title: 'Leads | Billys Custom Patches', robots: { index: false } };
export const dynamic = 'force-dynamic';

const STATUSES = [
  ['new', 'New'],
  ['contacted', 'Contacted'],
  ['quoted', 'Quoted'],
  ['won', 'Won'],
  ['lost', 'Lost'],
] as const;

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function ago(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}

const chip = (bg: string, color = '#fff') => ({ background: bg, color, fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999 });

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  if (!(await isAdmin())) redirect('/admin/login');
  const { status } = await searchParams;
  const filter = STATUSES.some(([k]) => k === status) ? status! : '';

  let q = db().from('quote_requests').select('*').order('created_at', { ascending: false }).limit(100);
  if (filter) q = q.eq('lead_status', filter);
  const [{ data }, counts] = await Promise.all([
    q,
    Promise.all(STATUSES.map(([k]) => db().from('quote_requests').select('id', { count: 'exact', head: true }).eq('lead_status', k))),
  ]);
  const leads = (data || []) as QuoteRow[];

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 className="hd" style={{ margin: 0, fontSize: 28 }}>Quote requests</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <a href={withBase('/admin/funnel')} className="btn" style={{ minHeight: 44, padding: '0 16px', background: 'var(--navy)', color: '#fff' }}>Funnel Health</a>
          <form action={logout}><button className="back" type="submit">Log out</button></form>
        </div>
      </div>

      <nav aria-label="Filter by status" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '16px 0 20px' }}>
        <a href={withBase('/admin')} className="btn" style={{ minHeight: 44, padding: '0 16px', background: filter ? '#fff' : 'var(--navy)', color: filter ? 'var(--navy)' : '#fff', border: '2px solid var(--navy)' }}>All</a>
        {STATUSES.map(([k, label], i) => (
          <a key={k} href={withBase(`/admin?status=${k}`)} className="btn" style={{ minHeight: 44, padding: '0 16px', background: filter === k ? 'var(--navy)' : '#fff', color: filter === k ? '#fff' : 'var(--navy)', border: '2px solid var(--navy)' }}>
            {label} ({counts[i].count ?? 0})
          </a>
        ))}
      </nav>

      {leads.length === 0 && <p>No quote requests yet.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {leads.map((l) => (
          <article key={l.id} style={{ background: '#fff', border: `3px solid ${l.lead_status === 'new' ? 'var(--red)' : 'var(--line)'}`, borderRadius: 22, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <strong style={{ fontSize: 19 }}>
                {l.first_name} {l.last_name}
                {l.business ? <span style={{ fontWeight: 400, color: 'var(--muted)' }}>, {l.business}</span> : null}
              </strong>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{l.verify_code}, {fmtTime(l.created_at)} ({ago(l.created_at)})</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
              <span style={chip(l.lead_grade === 'Very high' || l.lead_grade === 'High' ? 'var(--red)' : '#60646A')}>{l.lead_grade} ({l.lead_score})</span>
              <span style={l.whatsapp_verified_at ? chip('#128C4A') : chip('#FDE3DF', '#A3161B')}>{l.whatsapp_verified_at ? 'WhatsApp verified' : 'WhatsApp not verified'}</span>
              {l.files.length ? <span style={chip('var(--teal)')}>Artwork</span> : <span style={chip('#E4E4DF', 'var(--navy)')}>Needs design</span>}
              {l.tags.includes('RUSH ORDER') && <span style={chip('var(--orange)', 'var(--navy)')}>Rush</span>}
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 15 }}>
              {summaryRows(l).map((r) => `${r.k}: ${r.v}`).join('  |  ')}
            </p>
            {l.notes && <p style={{ margin: '0 0 10px', fontSize: 15, color: 'var(--muted)' }}>&quot;{l.notes}&quot;</p>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <a className="btn" href={ownerWhatsAppLink(l)} target="_blank" rel="noopener" style={{ minHeight: 44, padding: '0 16px', background: 'var(--wa)', color: '#fff' }}>WhatsApp</a>
              <a className="btn" href={`tel:${l.phone_e164}`} style={{ minHeight: 44, padding: '0 16px', background: 'var(--navy)', color: '#fff' }}>Call {l.phone_e164}</a>
              <a className="btn" href={`mailto:${l.email}?subject=${encodeURIComponent(`Your ${BUSINESS.name} quote ` + l.verify_code)}`} style={{ minHeight: 44, padding: '0 16px', background: 'var(--teal)', color: '#fff' }}>Email</a>
              {l.files.map((f) => (
                <a key={f.path} className="btn" href={fileLink(f.path)} target="_blank" rel="noopener" style={{ minHeight: 44, padding: '0 16px', background: '#fff', color: 'var(--navy)', border: '2px solid var(--navy)' }}>{f.name}</a>
              ))}
              {l.pdf_path && (
                <a className="btn" href={fileLink(l.pdf_path)} target="_blank" rel="noopener" style={{ minHeight: 44, padding: '0 16px', background: '#fff', color: 'var(--navy)', border: '2px solid var(--navy)' }}>Quote PDF</a>
              )}
            </div>
            <form action={updateLead} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <input type="hidden" name="id" value={l.id} />
              <label className="fld" style={{ flex: '0 0 170px' }}>
                Status
                <select className="inp" name="lead_status" defaultValue={l.lead_status || 'new'}>
                  {STATUSES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </label>
              <label className="fld" style={{ flex: '1 1 240px' }}>
                Your notes
                <input className="inp" name="owner_notes" defaultValue={l.owner_notes || ''} placeholder="Price sent, waiting on approval..." />
              </label>
              <button type="submit" className="next" style={{ marginLeft: 0 }}>Save</button>
            </form>
            {(l.status === 'failed' || l.status === 'needs_setup') && (
              <p className="alert" style={{ fontSize: 13 }}>Background step pending retry: {l.last_error}</p>
            )}
          </article>
        ))}
      </div>
    </main>
  );
}
