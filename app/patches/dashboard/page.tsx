import type { Metadata } from 'next';
import { requireCtx } from '@/lib/crm-auth';
import { db } from '@/lib/supabase';
import { withBase } from '@/lib/base';
import { ago, loadTasks, loadTeam, STAGES, todayNY, type Lead } from '@/lib/crm';
import { computeMetrics, pct, ratio, usd, type MetricRow } from '@/lib/crm-metrics';
import Avatar from '../Avatar';
import Shell from '../Shell';
import css from '../crm.module.css';

export const metadata: Metadata = { title: 'Dashboard | Madvert Labs Patches CRM', robots: { index: false } };
export const dynamic = 'force-dynamic';

const RANGES = [
  ['7', 'Last 7 days'],
  ['30', 'Last 30 days'],
  ['90', 'Last 90 days'],
  ['all', 'All time'],
] as const;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const ctx = await requireCtx();
  const { range: raw } = await searchParams;
  const range = RANGES.some(([k]) => k === raw) ? raw! : 'all';

  let q = db().from('quote_requests').select('id, first_name, last_name, patch_type, quantity, created_at, lead_status, opportunity_value, quoted_at, won_at, lost_at, assignee_id, source, tracking').eq('account_id', ctx.account.id).order('created_at', { ascending: false }).limit(10000);
  if (range !== 'all') q = q.gte('created_at', new Date(Date.now() - Number(range) * 86400000).toISOString());
  const [{ data }, team, tasks] = await Promise.all([q, loadTeam(ctx.account.id), loadTasks({ accountId: ctx.account.id, open: true })]);
  const rows = (data || []) as (MetricRow & Pick<Lead, 'id' | 'first_name' | 'last_name' | 'patch_type' | 'quantity'>)[];
  const m = computeMetrics(rows);
  const byId = new Map(team.map((t) => [t.id, t]));
  const today = todayNY();
  const overdue = tasks.filter((t) => t.due_on && t.due_on < today).length;
  const dueToday = tasks.filter((t) => t.due_on === today).length;
  const stageMax = Math.max(1, ...STAGES.map((s) => m.byStage[s.key]?.count || 0));

  const kpis: { label: string; value: string; sub: string; tone?: 'good' | 'bad' | 'blue' }[] = [
    { label: 'Total leads', value: String(m.total.leads), sub: `${m.total.open} open right now`, tone: 'blue' },
    { label: 'Pipeline value', value: usd(m.total.pipelineValue), sub: `${m.total.open} open opportunit${m.total.open === 1 ? 'y' : 'ies'}` },
    { label: 'Won revenue', value: usd(m.total.wonRevenue), sub: `${m.total.won} deal${m.total.won === 1 ? '' : 's'} won`, tone: 'good' },
    { label: 'Lost revenue', value: usd(m.total.lostRevenue), sub: `${m.total.lost} deal${m.total.lost === 1 ? '' : 's'} lost`, tone: 'bad' },
    { label: 'Conversion rate', value: pct(m.conversion), sub: 'Won out of all leads' },
    { label: 'Lead to quote', value: pct(m.leadToQuote), sub: `${m.total.reachedQuote} of ${m.total.leads} leads got a quote` },
    { label: 'Quote to sale', value: pct(m.quoteToSale), sub: `${m.total.won} of ${m.total.reachedQuote} quotes won` },
    { label: 'Win rate', value: pct(m.winRate), sub: 'Won out of closed (won plus lost)' },
    { label: 'Average deal', value: m.avgDeal === null ? 'n/a' : usd(m.avgDeal), sub: 'Average value of won deals' },
  ];

  const owners = [...m.byOwner.entries()].sort((a, b) => b[1].wonRevenue - a[1].wonRevenue || b[1].leads - a[1].leads);
  const sources = [...m.bySource.entries()].sort((a, b) => b[1].leads - a[1].leads);

  return (
    <Shell tab="dashboard" ctx={ctx}>
      <main className={css.page}>
        <div className={css.pageHead}>
          <div>
            <h1 className={css.h}>Sales <span className={css.gt}>Dashboard</span></h1>
            <p>Leads created in the selected period, with their current stage and value.</p>
          </div>
          <div className={css.filters}>
            <nav className={css.chipNav} aria-label="Period">
              {RANGES.map(([k, label]) => (
                <a key={k} href={withBase(`/patches/dashboard?range=${k}`)} className={range === k ? css.chipNavOn : ''} aria-current={range === k ? 'page' : undefined}>{label}</a>
              ))}
            </nav>
            <a className={css.btn} href={withBase('/patches/contacts/new')}>+ Add contact</a>
          </div>
        </div>

        <section className={css.kpis} aria-label="Key numbers">
          {kpis.map((k) => (
            <div key={k.label} className={`${css.kpi} ${k.tone === 'good' ? css.kpiGood : k.tone === 'bad' ? css.kpiBad : k.tone === 'blue' ? css.kpiBlue : ''}`}>
              <span>{k.label}</span>
              <b>{k.value}</b>
              <small>{k.sub}</small>
            </div>
          ))}
        </section>

        {m.unvaluedOpen > 0 && (
          <p className={css.hint}>
            {m.unvaluedOpen} open lead{m.unvaluedOpen === 1 ? ' has' : 's have'} no opportunity value yet, so the pipeline value is lower than it really is. Open a lead and set its value. <a href={withBase('/patches')}>Go to pipeline →</a>
          </p>
        )}

        <div className={css.dashGrid}>
          <section className={css.panel} aria-label="Pipeline by stage">
            <h2 className={css.h2}>Pipeline by stage</h2>
            <ul className={css.bars}>
              {STAGES.map((s) => {
                const b = m.byStage[s.key] || { count: 0, value: 0 };
                return (
                  <li key={s.key}>
                    <div className={css.barTop}><b>{s.label}</b><span>{b.count} lead{b.count === 1 ? '' : 's'}, {usd(b.value)}</span></div>
                    <i className={css.barTrack}><i style={{ width: `${(b.count / stageMax) * 100}%`, background: s.color }} /></i>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className={css.panel} aria-label="Tasks">
            <h2 className={css.h2}>Tasks</h2>
            <div className={css.miniKpis}>
              <a href={withBase('/patches/tasks')} className={overdue ? css.miniBad : ''}><b>{overdue}</b><span>Overdue</span></a>
              <a href={withBase('/patches/tasks')} className={dueToday ? css.miniWarn : ''}><b>{dueToday}</b><span>Due today</span></a>
              <a href={withBase('/patches/tasks')}><b>{tasks.length}</b><span>Open tasks</span></a>
            </div>
            <h2 className={css.h2} style={{ marginTop: 18 }}>Newest leads</h2>
            <ul className={css.latest}>
              {rows.slice(0, 5).map((r) => (
                <li key={r.id}>
                  <a href={withBase(`/patches/lead/${r.id}`)}>{r.first_name} {r.last_name}</a>
                  <span>{r.quantity} {r.patch_type}, {ago(r.created_at)}</span>
                </li>
              ))}
              {rows.length === 0 && <li><span>No leads in this period.</span></li>}
            </ul>
          </section>
        </div>

        <section className={css.panel} aria-label="Team performance" style={{ marginTop: 16 }}>
          <h2 className={css.h2}>Who manages what</h2>
          <div className={css.tableWrap}>
            <table className={css.table}>
              <thead>
                <tr><th>Owner</th><th>Leads</th><th>Open</th><th>Won</th><th>Lost</th><th>Pipeline</th><th>Won revenue</th><th>Conversion</th></tr>
              </thead>
              <tbody>
                {owners.map(([ownerId, b]) => {
                  const member = byId.get(ownerId);
                  return (
                    <tr key={ownerId || 'none'}>
                      <td>
                        <a className={css.ownerCell} href={withBase(`/patches?owner=${ownerId || 'none'}`)}>
                          <Avatar member={member} />
                          {member ? member.name : ownerId ? 'Removed member' : 'No owner'}
                        </a>
                      </td>
                      <td>{b.leads}</td>
                      <td>{b.open}</td>
                      <td>{b.won}</td>
                      <td>{b.lost}</td>
                      <td>{usd(b.pipelineValue)}</td>
                      <td>{usd(b.wonRevenue)}</td>
                      <td>{pct(ratio(b.won, b.leads))}</td>
                    </tr>
                  );
                })}
                {owners.length === 0 && <tr><td colSpan={8}>No leads in this period.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className={css.panel} aria-label="Lead sources" style={{ marginTop: 16 }}>
          <h2 className={css.h2}>Where leads come from</h2>
          <div className={css.tableWrap}>
            <table className={css.table}>
              <thead>
                <tr><th>Source</th><th>Leads</th><th>Got a quote</th><th>Won</th><th>Won revenue</th><th>Conversion</th></tr>
              </thead>
              <tbody>
                {sources.map(([label, b]) => (
                  <tr key={label}>
                    <td><b>{label}</b></td>
                    <td>{b.leads}</td>
                    <td>{b.reachedQuote}</td>
                    <td>{b.won}</td>
                    <td>{usd(b.wonRevenue)}</td>
                    <td>{pct(ratio(b.won, b.leads))}</td>
                  </tr>
                ))}
                {sources.length === 0 && <tr><td colSpan={6}>No leads in this period.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <p className={css.foot}>Values are the opportunity values your team sets on each lead. Pipeline counts New RFQ, Contacted and Quote Sent.</p>
      </main>
    </Shell>
  );
}

