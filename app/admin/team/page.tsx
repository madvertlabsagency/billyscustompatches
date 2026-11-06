import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin-auth';
import { db } from '@/lib/supabase';
import { withBase } from '@/lib/base';
import { loadTeam, STAGES } from '@/lib/crm';
import { addTeamMember, removeTeamMember } from '../actions';
import Avatar from '../Avatar';
import ConfirmButton from '../ConfirmButton';
import Shell from '../Shell';
import css from '../crm.module.css';

export const metadata: Metadata = { title: 'Team | Billys Custom Patches portal', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  const team = await loadTeam();
  const { data } = await db().from('quote_requests').select('assignee_id, follower_ids, lead_status').limit(5000);
  const rows = (data || []) as { assignee_id: string | null; follower_ids: string[] | null; lead_status: string }[];
  const open = (s: string) => s !== 'won' && s !== 'lost';
  const unassigned = rows.filter((r) => !r.assignee_id && open(r.lead_status)).length;

  return (
    <Shell tab="team">
      <main className={css.page}>
        <div className={css.pageHead}>
          <div>
            <h1 className={css.h}>Your <span className={css.gt}>Team</span></h1>
            <p>Add the people who work your leads. Make one the owner of a lead and add others as followers, so everyone sees who manages what.</p>
          </div>
          {unassigned > 0 && <a className={css.btnGhost} href={withBase('/admin?owner=none')}>{unassigned} open lead{unassigned === 1 ? '' : 's'} with no owner →</a>}
        </div>

        <div className={css.teamGrid}>
          <section className={css.panel} aria-label="Team members">
            {team.length === 0 ? (
              <p className={css.muted}>No team members yet. Add the first one with the form.</p>
            ) : (
              <ul className={css.members}>
                {team.map((m) => {
                  const owned = rows.filter((r) => r.assignee_id === m.id);
                  const following = rows.filter((r) => (r.follower_ids || []).includes(m.id)).length;
                  return (
                    <li key={m.id} className={css.member}>
                      <Avatar member={m} />
                      <div>
                        <b>{m.name}</b>
                        <small>{[m.role, m.email].filter(Boolean).join(', ') || 'Team member'}</small>
                      </div>
                      <div className={css.counts}>
                        <a className={css.chip} href={withBase(`/admin?owner=${m.id}`)} style={{ textDecoration: 'none' }}>{owned.filter((r) => open(r.lead_status)).length} open</a>
                        {STAGES.filter((s) => s.key === 'won').map((s) => (
                          <span key={s.key} className={`${css.chip} ${css.chipGood}`}>{owned.filter((r) => r.lead_status === s.key).length} won</span>
                        ))}
                        <span className={css.chip}>{following} following</span>
                      </div>
                      <form action={removeTeamMember}>
                        <input type="hidden" name="member_id" value={m.id} />
                        <ConfirmButton message={`Remove ${m.name} from the team? Their leads stay, with no owner.`} className={css.btnDanger}>Remove</ConfirmButton>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className={css.panel} aria-label="Add a team member">
            <h2 className={css.h} style={{ fontSize: 18, marginBottom: 12 }}>Add a team member</h2>
            <form action={addTeamMember} className={css.form}>
              <label>Name<input className={css.input} name="name" required maxLength={80} placeholder="Sohaib Razzaq" /></label>
              <label>Role (optional)<input className={css.input} name="role" maxLength={60} placeholder="Sales, Designer, Manager" /></label>
              <label>Email (optional)<input className={css.input} name="email" type="email" maxLength={160} placeholder="name@company.com" /></label>
              <button type="submit" className={css.btn}>Add to team</button>
            </form>
          </section>
        </div>
      </main>
    </Shell>
  );
}
