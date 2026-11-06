import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin-auth';
import { db } from '@/lib/supabase';
import { fileLink } from '@/lib/token';
import { ownerWhatsAppLink } from '@/lib/service';
import { summaryRows, type QuoteRow } from '@/lib/sync';
import { addLeadNote, deleteLead, deleteLeadNote, logout, moveLead } from './actions';
import ConfirmButton from './ConfirmButton';
import { parseNotes, MAX_NOTE_LENGTH } from '@/lib/notes';
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
            <form action={moveLead} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '4px 0 14px' }} aria-label="Move this lead">
              <input type="hidden" name="id" value={l.id} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginRight: 4 }}>Stage</span>
              {STATUSES.map(([k, label]) => {
                const on = (l.lead_status || 'new') === k;
                return (
                  <button key={k} type="submit" name="lead_status" value={k} aria-pressed={on} disabled={on} style={{ minHeight: 40, padding: '0 14px', borderRadius: 999, border: '2px solid var(--navy)', background: on ? 'var(--navy)' : '#fff', color: on ? '#fff' : 'var(--navy)', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: on ? 'default' : 'pointer' }}>
                    {on ? '✓ ' : ''}{label}
                  </button>
                );
              })}
            </form>

            <section aria-label="Notes" style={{ background: '#F6F7F9', borderRadius: 16, padding: 14 }}>
              <strong style={{ fontSize: 14 }}>Notes</strong>
              {(() => {
                const notes = parseNotes(l.owner_notes);
                return notes.length ? (
                  <ul style={{ listStyle: 'none', margin: '8px 0 10px', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {notes.map((n, i) => (
                      <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '8px 10px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{n.at ? `${fmtTime(n.at)} (${ago(n.at)})` : 'Earlier note'}</div>
                          <div style={{ fontSize: 15, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{n.text}</div>
                        </div>
                        <form action={deleteLeadNote}>
                          <input type="hidden" name="id" value={l.id} />
                          <input type="hidden" name="index" value={i} />
                          <ConfirmButton message="Delete this note?" ariaLabel="Delete note" style={{ minHeight: 32, minWidth: 32, border: 'none', borderRadius: 8, background: '#EEF0F3', color: 'var(--muted)', fontSize: 18, cursor: 'pointer' }}>×</ConfirmButton>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: '6px 0 10px', fontSize: 14, color: 'var(--muted)' }}>No notes yet.</p>
                );
              })()}
              <form action={addLeadNote} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <input type="hidden" name="id" value={l.id} />
                <textarea className="inp" name="text" rows={2} required maxLength={MAX_NOTE_LENGTH} placeholder="Price sent on WhatsApp, waiting on approval..." aria-label="New note" style={{ flex: '1 1 260px', minHeight: 52 }} />
                <button type="submit" className="next" style={{ marginLeft: 0, minHeight: 52 }}>Add note</button>
              </form>
            </section>

            <form action={deleteLead} style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <input type="hidden" name="id" value={l.id} />
              <ConfirmButton message={`Delete the lead ${l.first_name} ${l.last_name} (${l.verify_code}) for good? Their artwork and quote PDF are deleted too. This cannot be undone.`} style={{ minHeight: 40, padding: '0 16px', borderRadius: 999, border: '2px solid var(--red)', background: '#fff', color: 'var(--red)', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>
                Delete lead
              </ConfirmButton>
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
