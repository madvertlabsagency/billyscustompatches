import type { Metadata } from 'next';
import { requireCtx } from '@/lib/crm-auth';
import { db } from '@/lib/supabase';
import { withBase } from '@/lib/base';
import { loadTasks, loadTeam, todayNY, type Task } from '@/lib/crm';
import TaskRow from '../TaskRow';
import Shell from '../Shell';
import css from '../crm.module.css';

export const metadata: Metadata = { title: 'Tasks | Madvert Labs Patches CRM', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ who?: string; show?: string }> }) {
  const ctx = await requireCtx();
  const { who = '', show = 'open' } = await searchParams;
  const [team, all] = await Promise.all([loadTeam(ctx.account.id), loadTasks({ accountId: ctx.account.id, open: show !== 'done' })]);
  const byId = new Map(team.map((t) => [t.id, t]));
  let tasks = show === 'done' ? all.filter((t) => t.done_at) : all;
  if (who === 'none') tasks = tasks.filter((t) => !t.assignee_id);
  else if (byId.has(who)) tasks = tasks.filter((t) => t.assignee_id === who);

  const ids = [...new Set(tasks.map((t) => t.lead_id))];
  const { data } = ids.length ? await db().from('quote_requests').select('id, first_name, last_name').eq('account_id', ctx.account.id).in('id', ids) : { data: [] };
  const leads = new Map(((data || []) as { id: string; first_name: string; last_name: string }[]).map((l) => [l.id, { id: l.id, name: `${l.first_name} ${l.last_name}`.trim() }]));

  const today = todayNY();
  const groups: [string, Task[]][] =
    show === 'done'
      ? [['Completed', tasks]]
      : [
          ['Overdue', tasks.filter((t) => t.due_on && t.due_on < today)],
          ['Due today', tasks.filter((t) => t.due_on === today)],
          ['Upcoming', tasks.filter((t) => t.due_on && t.due_on > today)],
          ['No due date', tasks.filter((t) => !t.due_on)],
        ];

  return (
    <Shell tab="tasks" ctx={ctx}>
      <main className={css.page}>
        <div className={css.pageHead}>
          <div>
            <h1 className={css.h}>Team <span className={css.gt}>Tasks</span></h1>
            <p>Follow ups for every lead, assigned to your team. Add a task from any lead page.</p>
          </div>
          <form className={css.filters} action={withBase('/admin/tasks')}>
            <select className={css.select} name="who" defaultValue={who} aria-label="Assigned to">
              <option value="">Everyone</option>
              <option value="none">Not assigned</option>
              {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <select className={css.select} name="show" defaultValue={show} aria-label="Status">
              <option value="open">Open tasks</option>
              <option value="done">Completed</option>
            </select>
            <button type="submit" className={css.btnGhost}>Filter</button>
          </form>
        </div>

        {tasks.length === 0 && (
          <section className={css.panel}>
            <p className={css.muted}>{show === 'done' ? 'No completed tasks yet.' : 'No open tasks. Open a lead and add one in its Tasks tab.'}</p>
          </section>
        )}
        <div className={css.taskGroups}>
          {groups.filter(([, list]) => list.length).map(([label, list]) => (
            <section key={label} className={css.panel} aria-label={label}>
              <h2 className={css.h2}>{label} <span className={css.count}>{list.length}</span></h2>
              <ul className={css.tasks}>
                {list.map((t) => <TaskRow key={t.id} task={t} member={t.assignee_id ? byId.get(t.assignee_id) : undefined} lead={leads.get(t.lead_id)} />)}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </Shell>
  );
}
