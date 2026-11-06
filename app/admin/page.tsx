import type { Metadata } from 'next';
import { requireCtx } from '@/lib/crm-auth';
import { db } from '@/lib/supabase';
import { withBase } from '@/lib/base';
import { ago, leadValue, loadTasks, loadTeam, STAGES, stageIndex, type Lead, type TeamMember } from '@/lib/crm';
import { usd } from '@/lib/crm-metrics';
import Avatar from './Avatar';
import MoveButton from './MoveButton';
import Shell from './Shell';
import css from './crm.module.css';

export const metadata: Metadata = { title: 'Pipeline | Madvert Labs Patches CRM', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ owner?: string; q?: string }> }) {
  const ctx = await requireCtx();
  const { owner = '', q = '' } = await searchParams;
  const [team, openTasks] = await Promise.all([loadTeam(ctx.account.id), loadTasks({ accountId: ctx.account.id, open: true })]);
  const taskCount = new Map<string, number>();
  for (const t of openTasks) taskCount.set(t.lead_id, (taskCount.get(t.lead_id) || 0) + 1);
  const byId = new Map(team.map((m) => [m.id, m]));

  const term = q.replace(/[,()%*]/g, ' ').trim().slice(0, 60);
  let query = db().from('quote_requests').select('*').eq('account_id', ctx.account.id).order('created_at', { ascending: false }).limit(400);
  if (owner === 'none') query = query.is('assignee_id', null);
  else if (byId.has(owner)) query = query.eq('assignee_id', owner);
  if (term) query = query.or(['first_name', 'last_name', 'business', 'email', 'phone_e164', 'verify_code'].map((c) => `${c}.ilike.%${term}%`).join(','));
  const { data } = await query;
  const leads = (data || []) as Lead[];

  return (
    <Shell tab="pipeline" ctx={ctx}>
      <main className={css.page}>
        <div className={css.pageHead}>
          <div>
            <h1 className={css.h}>Sales <span className={css.gt}>Pipeline</span></h1>
            <p>{leads.length} lead{leads.length === 1 ? '' : 's'}{owner || term ? ' match your filters' : ''}. Tap a lead to open it, use the arrows to move it between stages.</p>
          </div>
          <form className={css.filters} action={withBase('/admin')} role="search">
            <input className={css.input} type="search" name="q" defaultValue={q} placeholder="Search name, email, phone, code" aria-label="Search leads" />
            <select className={css.select} name="owner" defaultValue={owner} aria-label="Filter by owner">
              <option value="">All owners</option>
              <option value="none">No owner</option>
              {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <button type="submit" className={css.btnGhost}>Filter</button>
            <a className={css.btn} href={withBase('/admin/contacts/new')}>+ Add contact</a>
          </form>
        </div>

        <div className={css.board}>
          {STAGES.map((st, si) => {
            const list = leads.filter((l) => (l.lead_status || 'new') === st.key);
            return (
              <section key={st.key} className={css.col} style={{ '--stage': st.color } as React.CSSProperties} aria-label={`${st.label}, ${list.length} leads`}>
                <header className={css.colHead}>
                  <i className={css.dot} aria-hidden="true" />
                  <b>{st.label}</b>
                  <span>{list.length}</span>
                </header>
                <p className={css.colValue}>{usd(list.reduce((sum, l) => sum + leadValue(l), 0))}</p>
                {list.length === 0 && <p className={css.empty}>No leads here</p>}
                {list.map((l) => {
                  const idx = stageIndex(l.lead_status);
                  const followers = (l.follower_ids || []).map((f) => byId.get(f)).filter(Boolean) as TeamMember[];
                  return (
                    <article key={l.id} className={css.card}>
                      <a className={css.cardTitle} href={withBase(`/admin/lead/${l.id}`)}>
                        {l.first_name} {l.last_name} | {l.quantity} {l.patch_type}
                      </a>
                      <div className={css.cardSub}>{l.business ? `${l.business}, ` : ''}{l.verify_code}, {ago(l.created_at)}</div>
                      <div className={css.cardValue}>{leadValue(l) ? usd(leadValue(l)) : <span>No value set</span>}</div>
                      <div className={css.chips}>
                        <span className={`${css.chip} ${l.whatsapp_verified_at ? css.chipGood : css.chipBad}`}>{l.whatsapp_verified_at ? 'WhatsApp verified' : 'Not verified'}</span>
                        <span className={css.chip}>{l.files.length ? 'Artwork' : 'Needs design'}</span>
                        {l.lead_grade && <span className={`${css.chip} ${l.lead_grade === 'High' || l.lead_grade === 'Very high' ? css.chipWarn : ''}`}>{l.lead_grade}</span>}
                        {l.tags.includes('RUSH ORDER') && <span className={`${css.chip} ${css.chipWarn}`}>Rush</span>}
                        {l.source === 'manual' && <span className={css.chip}>Added by hand</span>}
                        {taskCount.get(l.id) ? <span className={`${css.chip} ${css.chipBlue}`}>{taskCount.get(l.id)} task{taskCount.get(l.id) === 1 ? '' : 's'}</span> : null}
                      </div>
                      <div className={css.cardFoot}>
                        <Avatar member={l.assignee_id ? byId.get(l.assignee_id) : undefined} />
                        {followers.length > 0 && <small>+{followers.length} following</small>}
                        <div className={css.arrows}>
                          <MoveButton leadId={l.id} to={STAGES[idx - 1]?.key || ''} className={css.arrow} ariaLabel={si === 0 ? 'Already the first stage' : `Move back to ${STAGES[idx - 1]?.label}`} title={si === 0 ? undefined : `Move to ${STAGES[idx - 1]?.label}`}>←</MoveButton>
                          <MoveButton leadId={l.id} to={STAGES[idx + 1]?.key || ''} className={css.arrow} ariaLabel={si === STAGES.length - 1 ? 'Already the last stage' : `Move forward to ${STAGES[idx + 1]?.label}`} title={si === STAGES.length - 1 ? undefined : `Move to ${STAGES[idx + 1]?.label}`}>→</MoveButton>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      </main>
    </Shell>
  );
}
