import type { Metadata } from 'next';
import { requireCtx } from '@/lib/crm-auth';
import { withBase } from '@/lib/base';
import { ago } from '@/lib/crm';
import { loadAlerts } from '@/lib/crm-alerts-server';
import AppTools from '../AppTools';
import Shell from '../Shell';
import css from '../crm.module.css';

export const metadata: Metadata = { title: 'Notifications | Madvert Labs Patches CRM', robots: { index: false } };
export const dynamic = 'force-dynamic';

const ICON = { urgent: '🔴', warn: '🟠', info: '🆕' } as const;

export default async function NotificationsPage() {
  const ctx = await requireCtx();
  const alerts = await loadAlerts(ctx.account.id);
  const action = alerts.filter((a) => a.level !== 'info');
  const fresh = alerts.filter((a) => a.level === 'info' || a.id.startsWith('new-'));

  return (
    <Shell tab="notifications" ctx={ctx}>
      <main className={css.page}>
        <div className={css.pageHead}>
          <div>
            <h1 className={css.h}><span className={css.gt}>Notifications</span></h1>
            <p>What needs attention in {ctx.account.name} right now. This page updates by itself.</p>
          </div>
        </div>

        <div className={css.dashGrid}>
          <section className={css.panel} aria-label="Needs attention">
            <h2 className={css.h2}>Needs attention <span className={css.count}>{action.length}</span></h2>
            {action.length === 0 ? (
              <p className={css.muted}>All caught up. Every lead is moving and no task is late.</p>
            ) : (
              <ul className={css.alerts}>
                {action.map((a) => (
                  <li key={a.id} className={a.level === 'urgent' ? css.alertUrgent : css.alertWarn}>
                    <a href={withBase(a.href)}>
                      <i aria-hidden="true">{ICON[a.level]}</i>
                      <span>
                        <b>{a.title}</b>
                        <small>{a.body}</small>
                      </span>
                      <em>{ago(a.at)}</em>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <section className={css.panel} aria-label="New leads">
              <h2 className={css.h2}>New leads, last 48 hours <span className={css.count}>{fresh.length}</span></h2>
              {fresh.length === 0 ? (
                <p className={css.muted}>No new leads in the last 48 hours.</p>
              ) : (
                <ul className={css.alerts}>
                  {fresh.map((a) => (
                    <li key={a.id} className={a.level === 'urgent' ? css.alertUrgent : css.alertInfo}>
                      <a href={withBase(a.href)}>
                        <i aria-hidden="true">{a.level === 'urgent' ? '🔥' : ICON.info}</i>
                        <span>
                          <b>{a.title}</b>
                          <small>{a.body}</small>
                        </span>
                        <em>{ago(a.at)}</em>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className={css.panel} aria-label="This device">
              <h2 className={css.h2}>Get these on your phone</h2>
              <AppTools variant="panel" />
            </section>
          </div>
        </div>
      </main>
    </Shell>
  );
}
