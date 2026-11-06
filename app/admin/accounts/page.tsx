import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/admin-auth';
import { accountsFor, getUser } from '@/lib/crm-auth';
import { db } from '@/lib/supabase';
import { withBase } from '@/lib/base';
import { createAccount, logout, selectAccount } from '../actions';
import { montserrat } from '../font';
import ChangePassword from './ChangePassword';
import AppTools from '../AppTools';
import css from '../crm.module.css';

export const metadata: Metadata = { title: 'Choose an account | Madvert Labs Patches CRM', robots: { index: false } };
export const dynamic = 'force-dynamic';

// After sign in: pick which client account to open. The Madvert Labs admin sees every client and can add new ones.
export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const u = await getUser();
  const s = await readSession();
  if (!u || !s) redirect('/admin/login');
  const { error } = await searchParams;
  const accounts = await accountsFor(s.user);
  const stats = await Promise.all(
    accounts.map(async (a) => {
      const [fresh, open] = await Promise.all([
        db().from('quote_requests').select('id', { count: 'exact', head: true }).eq('account_id', a.id).eq('lead_status', 'new'),
        db().from('quote_requests').select('id', { count: 'exact', head: true }).eq('account_id', a.id).in('lead_status', ['new', 'contacted', 'quoted']),
      ]);
      return { fresh: fresh.count || 0, open: open.count || 0 };
    }),
  );
  const name = u.isOwner ? 'Madvert Labs admin' : u.member!.name.split(' ')[0];

  return (
    <div className={`${css.shell} ${montserrat.variable}`}>
      <main className={css.page} style={{ maxWidth: 880 }}>
        <div className={css.pickHead}>
          <img src={withBase('/assets/madvert/logo-light.webp')} alt="Madvert Labs" width={480} height={140} />
          <form action={logout}><button type="submit" className={css.logout}>Log out</button></form>
        </div>
        <p className={css.kickerLight}>Madvert Labs Patches CRM</p>
        <h1 className={css.h} style={{ fontSize: 'clamp(26px, 4vw, 36px)', margin: '6px 0 4px' }}>Hi {name}, <span className={css.gt}>which account?</span></h1>
        <p className={css.muted} style={{ marginBottom: 18 }}>{accounts.length ? 'Choose the client account to open. You can switch any time from the top bar.' : 'You are not part of any client account yet. Ask your manager or Madvert Labs to add you.'}</p>

        <ul className={css.accountList}>
          {accounts.map((a, i) => (
            <li key={a.id}>
              <form action={selectAccount}>
                <input type="hidden" name="account_id" value={a.id} />
                <button type="submit" className={css.accountCard} style={{ '--acc': a.color } as React.CSSProperties}>
                  <i aria-hidden="true">{a.name.slice(0, 1).toUpperCase()}</i>
                  <span>
                    <b>{a.name}</b>
                    <small>{stats[i].fresh} new RFQ{stats[i].fresh === 1 ? '' : 's'}, {stats[i].open} open lead{stats[i].open === 1 ? '' : 's'}</small>
                  </span>
                  <em aria-hidden="true">→</em>
                </button>
              </form>
            </li>
          ))}
        </ul>

        {u.isOwner && (
          <section className={css.panel} style={{ marginTop: 18 }} aria-label="Add a client account">
            <h2 className={css.h2}>Add a client account</h2>
            {error && <p className={css.alert} role="alert">The account could not be created. Check the name and try again.</p>}
            <form action={createAccount} className={css.row}>
              <input className={css.input} style={{ flex: '1 1 240px' }} name="name" required maxLength={80} placeholder="Client name, e.g. EPCF Custom Patches" />
              <button type="submit" className={css.btn}>Create account</button>
            </form>
            <p className={css.muted} style={{ marginTop: 8 }}>Then open it and add the client&apos;s team on its Team page. Leads from that client&apos;s funnel need the funnel connected to this CRM.</p>
          </section>
        )}

        <section className={css.panel} style={{ marginTop: 18 }} aria-label="This device">
          <h2 className={css.h2}>App and notifications</h2>
          <AppTools variant="panel" />
        </section>

        {!u.isOwner && (
          <section className={css.panel} style={{ marginTop: 18 }} aria-label="Change my password">
            <h2 className={css.h2}>Change my password</h2>
            <ChangePassword />
          </section>
        )}
        <p className={css.foot}>Madvert Labs Patches CRM, built and run by Madvert Labs.</p>
      </main>
    </div>
  );
}
