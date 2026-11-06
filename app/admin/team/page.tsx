import type { Metadata } from 'next';
import { requireCtx } from '@/lib/crm-auth';
import { db } from '@/lib/supabase';
import { withBase } from '@/lib/base';
import { ago, loadTeam } from '@/lib/crm';
import { addTeamMember, removeTeamMember, setMemberPassword } from '../actions';
import Avatar from '../Avatar';
import ConfirmButton from '../ConfirmButton';
import Shell from '../Shell';
import css from '../crm.module.css';

export const metadata: Metadata = { title: 'Team | Madvert Labs Patches CRM', robots: { index: false } };
export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  rights: 'Only a manager or the Madvert Labs admin can change the team.',
  form: 'Check the form: a name is needed, the email must be valid and a password needs at least 8 characters.',
  email: 'A login needs an email address. Add the email, then set the password.',
  password: 'The password needs at least 8 characters.',
  save: 'The team member could not be saved. Try again.',
};

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ error?: string; added?: string; password?: string }> }) {
  const ctx = await requireCtx();
  const { error, added, password } = await searchParams;
  const manage = ctx.isOwner || ctx.accountRole === 'manager';
  const team = await loadTeam(ctx.account.id);
  const { data } = await db().from('quote_requests').select('assignee_id, follower_ids, lead_status').eq('account_id', ctx.account.id).limit(5000);
  const rows = (data || []) as { assignee_id: string | null; follower_ids: string[] | null; lead_status: string }[];
  const open = (s: string) => s !== 'won' && s !== 'lost';
  const unassigned = rows.filter((r) => !r.assignee_id && open(r.lead_status)).length;

  return (
    <Shell tab="team" ctx={ctx}>
      <main className={css.page}>
        <div className={css.pageHead}>
          <div>
            <h1 className={css.h}>{ctx.account.name} <span className={css.gt}>Team</span></h1>
            <p>Everyone here can sign in to the app with their email and password and sees only {ctx.account.name}. Make one the owner of a lead and add others as followers.</p>
          </div>
          {unassigned > 0 && <a className={css.btnGhost} href={withBase('/admin?owner=none')}>{unassigned} open lead{unassigned === 1 ? '' : 's'} with no owner →</a>}
        </div>
        {error && <p className={css.alert} role="alert" style={{ margin: '0 0 12px' }}>{ERRORS[error] || 'Something went wrong. Try again.'}</p>}
        {added && <p className={css.hint} style={{ margin: '0 0 12px', background: 'var(--good-bg)', color: 'var(--good)' }}>Team member saved. Share the app link, their email and password with them.</p>}
        {password && <p className={css.hint} style={{ margin: '0 0 12px', background: 'var(--good-bg)', color: 'var(--good)' }}>Password updated.</p>}

        <div className={css.teamGrid}>
          <section className={css.panel} aria-label="Team members">
            {team.length === 0 ? (
              <p className={css.muted}>No team members yet.{manage ? ' Add the first one with the form.' : ''}</p>
            ) : (
              <ul className={css.members}>
                {team.map((m) => {
                  const owned = rows.filter((r) => r.assignee_id === m.id);
                  const following = rows.filter((r) => (r.follower_ids || []).includes(m.id)).length;
                  return (
                    <li key={m.id} className={css.member}>
                      <Avatar member={m} />
                      <div>
                        <b>{m.name} {m.account_role === 'manager' && <span className={`${css.chip} ${css.chipBlue}`}>Manager</span>}</b>
                        <small>{[m.role, m.email].filter(Boolean).join(', ') || 'Team member'}</small>
                        <small style={{ display: 'block' }}>
                          {m.has_login ? (m.last_login_at ? `App login, last signed in ${ago(m.last_login_at)}` : 'App login set, not signed in yet') : 'No app login yet'}
                        </small>
                      </div>
                      <div className={css.counts}>
                        <a className={css.chip} href={withBase(`/admin?owner=${m.id}`)} style={{ textDecoration: 'none' }}>{owned.filter((r) => open(r.lead_status)).length} open</a>
                        <span className={`${css.chip} ${css.chipGood}`}>{owned.filter((r) => r.lead_status === 'won').length} won</span>
                        <span className={css.chip}>{following} following</span>
                      </div>
                      {manage && (
                        <div className={css.memberTools}>
                          {m.email && (
                            <form action={setMemberPassword} className={css.row}>
                              <input type="hidden" name="member_id" value={m.id} />
                              <input className={css.input} name="password" type="password" minLength={8} required placeholder={m.has_login ? 'New password' : 'Set a password'} aria-label={`Password for ${m.name}`} autoComplete="new-password" />
                              <button type="submit" className={css.btnGhost}>{m.has_login ? 'Reset' : 'Set'}</button>
                            </form>
                          )}
                          <form action={removeTeamMember}>
                            <input type="hidden" name="member_id" value={m.id} />
                            <ConfirmButton message={`Remove ${m.name} from ${ctx.account.name}? Their leads here stay, with no owner, and they lose access to this account.`} className={css.btnDanger}>Remove</ConfirmButton>
                          </form>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {manage ? (
            <section className={css.panel} aria-label="Add a team member">
              <h2 className={css.h2}>Add a team member</h2>
              <form action={addTeamMember} className={css.form}>
                <label>Name<input className={css.input} name="name" required maxLength={80} placeholder="Sohaib Razzaq" /></label>
                <label>Email (their app login)<input className={css.input} name="email" type="email" maxLength={160} placeholder="name@company.com" autoComplete="off" /></label>
                <label>Password (at least 8 characters)<input className={css.input} name="password" type="password" minLength={8} maxLength={200} placeholder="Leave empty to add without a login" autoComplete="new-password" /></label>
                <label>Job title (optional)<input className={css.input} name="role" maxLength={60} placeholder="Sales, Designer" /></label>
                <label>Access
                  <select className={css.select} name="account_role" defaultValue="member">
                    <option value="member">Member: works the leads</option>
                    <option value="manager">Manager: also manages the team</option>
                  </select>
                </label>
                <button type="submit" className={css.btn}>Add to team</button>
                <p className={css.muted}>If this email already has a login in another client account, they keep the same login and get access here too.</p>
              </form>
            </section>
          ) : (
            <section className={css.panel}>
              <p className={css.muted}>Only a manager or the Madvert Labs admin can add or remove people.</p>
            </section>
          )}
        </div>
      </main>
    </Shell>
  );
}
