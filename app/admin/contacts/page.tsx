import type { Metadata } from 'next';
import { requireCtx } from '@/lib/crm-auth';
import { db } from '@/lib/supabase';
import { withBase } from '@/lib/base';
import { ago, leadValue, loadTeam, stageOf, type Lead } from '@/lib/crm';
import { sourceLabel, usd } from '@/lib/crm-metrics';
import Avatar from '../Avatar';
import Shell from '../Shell';
import css from '../crm.module.css';

export const metadata: Metadata = { title: 'Contacts | Madvert Labs Patches CRM', robots: { index: false } };
export const dynamic = 'force-dynamic';

type Contact = { key: string; latest: Lead; requests: number; value: number; first: string };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string; source?: string }> }) {
  const ctx = await requireCtx();
  const { q = '', source = '' } = await searchParams;
  const term = q.replace(/[,()%*]/g, ' ').trim().slice(0, 60);
  let query = db().from('quote_requests').select('*').eq('account_id', ctx.account.id).order('created_at', { ascending: false }).limit(5000);
  if (source === 'manual') query = query.eq('source', 'manual');
  if (source === 'funnel') query = query.neq('source', 'manual');
  if (term) query = query.or(['first_name', 'last_name', 'business', 'email', 'phone_e164', 'verify_code'].map((c) => `${c}.ilike.%${term}%`).join(','));
  const [{ data }, team] = await Promise.all([query, loadTeam(ctx.account.id)]);
  const byId = new Map(team.map((t) => [t.id, t]));

  // One row per person: requests from the same email or phone are grouped, newest first, like a CRM contact.
  const contacts = new Map<string, Contact>();
  for (const l of (data || []) as Lead[]) {
    const key = (l.email || '').toLowerCase() || l.phone_e164 || l.id;
    const c = contacts.get(key);
    if (c) {
      c.requests++;
      c.value += leadValue(l);
      c.first = l.created_at;
    } else contacts.set(key, { key, latest: l, requests: 1, value: leadValue(l), first: l.created_at });
  }
  const list = [...contacts.values()];

  return (
    <Shell tab="contacts" ctx={ctx}>
      <main className={css.page}>
        <div className={css.pageHead}>
          <div>
            <h1 className={css.h}>All <span className={css.gt}>Contacts</span></h1>
            <p>{list.length} contact{list.length === 1 ? '' : 's'}, from the funnel and added by hand, newest first.</p>
          </div>
          <div className={css.filters}>
            <form className={css.filters} action={withBase('/admin/contacts')} role="search">
              <input className={css.input} type="search" name="q" defaultValue={q} placeholder="Search name, email, phone" aria-label="Search contacts" />
              <select className={css.select} name="source" defaultValue={source} aria-label="Source">
                <option value="">All sources</option>
                <option value="funnel">From the funnel</option>
                <option value="manual">Added by hand</option>
              </select>
              <button type="submit" className={css.btnGhost}>Filter</button>
            </form>
            <a className={css.btn} href={withBase('/admin/contacts/new')}>+ Add contact</a>
          </div>
        </div>

        <section className={css.panel}>
          <div className={css.tableWrap}>
            <table className={css.table}>
              <thead>
                <tr><th>Name</th><th>Phone</th><th>Email</th><th>Source</th><th>Stage</th><th>Owner</th><th>Value</th><th>Added</th></tr>
              </thead>
              <tbody>
                {list.map(({ key, latest: l, requests, value, first }) => {
                  const st = stageOf(l.lead_status);
                  return (
                    <tr key={key}>
                      <td>
                        <a className={css.nameCell} href={withBase(`/admin/lead/${l.id}`)}>
                          <b>{l.first_name} {l.last_name}</b>
                          <small>{l.business || l.verify_code}{requests > 1 ? `, ${requests} requests` : ''}</small>
                        </a>
                      </td>
                      <td>{l.phone_e164 ? <a href={`tel:${l.phone_e164}`}>{l.phone_e164}</a> : 'n/a'}</td>
                      <td>{l.email ? <a href={`mailto:${l.email}`}>{l.email}</a> : 'n/a'}</td>
                      <td><span className={`${css.chip} ${l.source === 'manual' ? css.chipWarn : ''}`}>{sourceLabel({ source: l.source ?? null, tracking: (l.tracking || {}) as Record<string, string> })}</span></td>
                      <td><span className={css.stagePill} style={{ '--stage': st.color } as React.CSSProperties}>{st.label}</span></td>
                      <td><span className={css.ownerCell}><Avatar member={l.assignee_id ? byId.get(l.assignee_id) : undefined} />{l.assignee_id ? byId.get(l.assignee_id)?.name : ''}</span></td>
                      <td>{value ? usd(value) : 'n/a'}</td>
                      <td title={first}>{ago(l.created_at)}</td>
                    </tr>
                  );
                })}
                {list.length === 0 && <tr><td colSpan={8}>No contacts match. <a href={withBase('/admin/contacts/new')}>Add one by hand</a>.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </Shell>
  );
}
