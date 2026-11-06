import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin-auth';
import { db } from '@/lib/supabase';
import { fileLink } from '@/lib/token';
import { ownerWhatsAppLink } from '@/lib/service';
import { summaryRows } from '@/lib/sync';
import { BUSINESS } from '@/lib/options';
import { withBase } from '@/lib/base';
import { parseNotes, MAX_NOTE_LENGTH } from '@/lib/notes';
import { ago, fmtTime, initials, loadActivity, loadTeam, STAGES, stageIndex, stageOf, type Lead } from '@/lib/crm';
import { addLeadNote, assignLead, deleteLead, deleteLeadNote, moveLead, toggleFollower } from '../../actions';
import Avatar from '../../Avatar';
import ConfirmButton from '../../ConfirmButton';
import Shell from '../../Shell';
import css from '../../crm.module.css';

export const metadata: Metadata = { title: 'Lead | Billys Custom Patches portal', robots: { index: false } };
export const dynamic = 'force-dynamic';

const TABS = [
  ['details', 'Details'],
  ['notes', 'Notes'],
  ['activity', 'Activity'],
] as const;

const KIND_COLOR: Record<string, string> = { stage: '#7c5cff', note: '#0084ff', owner: '#00a884', follower: '#0ea5b7', created: '#0b172a', verified: '#0e8a4f' };

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  if (!(await isAdmin())) redirect('/admin/login');
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await db().from('quote_requests').select('*').eq('id', id).maybeSingle();
  if (!data) notFound();
  const l = data as Lead;
  const [team, stored] = await Promise.all([loadTeam(), loadActivity(id)]);
  const byId = new Map(team.map((m) => [m.id, m]));
  const owner = l.assignee_id ? byId.get(l.assignee_id) : undefined;
  const followers = l.follower_ids || [];
  const notes = parseNotes(l.owner_notes);
  const tab = TABS.some(([k]) => k === rawTab) ? rawTab! : 'details';
  const cur = stageIndex(l.lead_status);

  const activity = [
    ...stored,
    ...(l.whatsapp_verified_at ? [{ id: 'verified', created_at: l.whatsapp_verified_at, kind: 'verified', text: 'Customer verified their WhatsApp number' }] : []),
    { id: 'created', created_at: l.created_at, kind: 'created', text: `Quote request ${l.verify_code} submitted on the funnel` },
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const t = (l.tracking || {}) as Record<string, string>;
  const details: [string, string][] = [
    ['Quote code', l.verify_code],
    ['Submitted', `${fmtTime(l.created_at)} (${ago(l.created_at)})`],
    ['Stage', stageOf(l.lead_status).label],
    ['Lead score', l.lead_grade ? `${l.lead_grade} (${l.lead_score ?? 'n/a'})` : 'n/a'],
    ['WhatsApp', l.whatsapp_verified_at ? `Verified ${ago(l.whatsapp_verified_at)}` : 'Not verified'],
    ...summaryRows(l).map((r) => [r.k, r.v] as [string, string]),
    ['Business', l.business || 'n/a'],
    ['Customer note', l.notes || 'none'],
    ['Source', [t.utm_source, t.utm_campaign, t.utm_content].filter(Boolean).join(' / ') || 'direct'],
  ];

  return (
    <Shell tab="pipeline">
      <main className={css.page}>
        <a className={css.back} href={withBase('/admin')}>← Back to pipeline</a>
        <div className={css.leadGrid}>
          <aside className={css.panel} aria-label="Contact">
            <div className={css.contact}>
              <span className={`${css.avatar} ${css.avatarLg}`} style={{ '--c': '#0b172a' } as React.CSSProperties} aria-hidden="true">{initials(`${l.first_name} ${l.last_name}`)}</span>
              <div>
                <h1 className={css.h}>{l.first_name} {l.last_name}</h1>
                <p>{l.email}</p>
                <p>{l.phone_e164}</p>
              </div>
            </div>
            <div className={css.quick}>
              <a href={`tel:${l.phone_e164}`}><i style={{ background: '#0b172a' }} aria-hidden="true">☎</i>Call</a>
              <a href={ownerWhatsAppLink(l)} target="_blank" rel="noopener"><i style={{ background: '#25d366' }} aria-hidden="true">✆</i>WhatsApp</a>
              <a href={`mailto:${l.email}?subject=${encodeURIComponent(`Your ${BUSINESS.name} quote ${l.verify_code}`)}`}><i style={{ background: '#0084ff' }} aria-hidden="true">✉</i>Email</a>
            </div>

            <div className={css.field}>
              <span>Owner</span>
              <form action={assignLead} className={css.row}>
                <input type="hidden" name="id" value={l.id} />
                <Avatar member={owner} />
                <select className={css.select} name="assignee_id" defaultValue={l.assignee_id || ''} aria-label="Lead owner">
                  <option value="">No owner</option>
                  {team.map((m) => <option key={m.id} value={m.id}>{m.name}{m.role ? `, ${m.role}` : ''}</option>)}
                </select>
                <button type="submit" className={css.btnGhost}>Save</button>
              </form>
            </div>

            <div className={css.field}>
              <span>Followers ({followers.length})</span>
              {team.length === 0 ? (
                <p className={css.muted}>Add your team on the <a href={withBase('/admin/team')}>Team page</a> to set owners and followers.</p>
              ) : (
                <div className={css.followers}>
                  {team.map((m) => {
                    const on = followers.includes(m.id);
                    return (
                      <form key={m.id} action={toggleFollower}>
                        <input type="hidden" name="id" value={l.id} />
                        <input type="hidden" name="member_id" value={m.id} />
                        <button type="submit" className={`${css.follow} ${on ? css.followOn : ''}`} aria-pressed={on} title={on ? `${m.name} follows this lead. Tap to remove.` : `Tap to make ${m.name} follow this lead`}>
                          <Avatar member={m} />
                          {on ? '✓ ' : '+ '}{m.name}
                        </button>
                      </form>
                    );
                  })}
                </div>
              )}
            </div>

            <form action={deleteLead} style={{ marginTop: 20 }}>
              <input type="hidden" name="id" value={l.id} />
              <input type="hidden" name="back" value="pipeline" />
              <ConfirmButton message={`Delete the lead ${l.first_name} ${l.last_name} (${l.verify_code}) for good? Their artwork, quote PDF, notes and activity are deleted too. This cannot be undone.`} className={css.btnDanger} style={{ width: '100%' }}>
                Delete lead
              </ConfirmButton>
            </form>
          </aside>

          <section className={css.panel} aria-label="Lead">
            <div className={css.field} style={{ marginTop: 0, marginBottom: 18 }}>
              <span>Pipeline stage</span>
              <form action={moveLead} className={css.stagebar}>
                <input type="hidden" name="id" value={l.id} />
                {STAGES.map((st, i) => {
                  const on = i === cur;
                  const done = i < cur && l.lead_status !== 'lost';
                  return (
                    <button key={st.key} type="submit" name="lead_status" value={st.key} disabled={on} aria-pressed={on} className={on ? css.stageOn : done ? css.stageDone : ''} style={{ '--stage': st.color } as React.CSSProperties}>
                      {on ? '● ' : ''}{st.label}
                    </button>
                  );
                })}
              </form>
            </div>

            <nav className={css.tabs} aria-label="Lead sections">
              {TABS.map(([k, label]) => (
                <a key={k} href={withBase(`/admin/lead/${l.id}?tab=${k}`)} className={`${css.tab} ${tab === k ? css.tabOn : ''}`} aria-current={tab === k ? 'page' : undefined}>
                  {label}
                  {k === 'notes' && notes.length > 0 && <b>{notes.length}</b>}
                  {k === 'activity' && <b>{activity.length}</b>}
                </a>
              ))}
            </nav>

            {tab === 'details' && (
              <>
                <dl className={css.dl}>
                  {details.map(([k, v]) => (
                    <div key={k} style={{ display: 'contents' }}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className={css.files}>
                  {l.files.map((f) => (
                    <a key={f.path} className={css.btnGhost} href={fileLink(f.path)} target="_blank" rel="noopener">Artwork: {f.name}</a>
                  ))}
                  {l.pdf_path && <a className={css.btnGhost} href={fileLink(l.pdf_path)} target="_blank" rel="noopener">Quote PDF</a>}
                </div>
              </>
            )}

            {tab === 'notes' && (
              <>
                {notes.length ? (
                  <ul className={css.notes}>
                    {[...notes].map((n, i) => ({ n, i })).reverse().map(({ n, i }) => (
                      <li key={i} className={css.note}>
                        <div>
                          <small>{n.at ? `${fmtTime(n.at)} (${ago(n.at)})` : 'Earlier note'}</small>
                          <p>{n.text}</p>
                        </div>
                        <form action={deleteLeadNote}>
                          <input type="hidden" name="id" value={l.id} />
                          <input type="hidden" name="index" value={i} />
                          <ConfirmButton message="Delete this note?" ariaLabel="Delete note" className={css.x}>×</ConfirmButton>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={css.muted} style={{ marginBottom: 14 }}>No notes yet. Add the first one below.</p>
                )}
                <form action={addLeadNote} className={css.compose}>
                  <input type="hidden" name="id" value={l.id} />
                  <textarea className={css.textarea} name="text" required maxLength={MAX_NOTE_LENGTH} placeholder="Price sent on WhatsApp, waiting on approval..." aria-label="New note" />
                  <div><button type="submit" className={css.btn}>Add note</button></div>
                </form>
              </>
            )}

            {tab === 'activity' && (
              <ul className={css.timeline}>
                {activity.map((a) => (
                  <li key={a.id} style={{ '--k': KIND_COLOR[a.kind] || '#0084ff' } as React.CSSProperties}>
                    <small>{fmtTime(a.created_at)} ({ago(a.created_at)})</small>
                    <p>{a.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </Shell>
  );
}
