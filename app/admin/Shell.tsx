import { withBase } from '@/lib/base';
import type { Ctx } from '@/lib/crm-auth';
import { initials } from '@/lib/crm';
import { actionCount } from '@/lib/crm-alerts';
import { loadAlerts } from '@/lib/crm-alerts-server';
import { logout } from './actions';
import { montserrat } from './font';
import AppTools from './AppTools';
import LiveRefresh from './LiveRefresh';
import css from './crm.module.css';

type Tab = 'dashboard' | 'pipeline' | 'contacts' | 'tasks' | 'notifications' | 'team' | 'funnel' | 'welcome' | 'none';

// The frame around every CRM page: Madvert Labs Patches CRM, the client account, who is signed in, the menu.
export default async function Shell({ tab, ctx, children }: { tab: Tab; ctx: Ctx; children: React.ReactNode }) {
  const alerts = actionCount(await loadAlerts(ctx.account.id).catch(() => []));
  const link = (key: Tab, href: string, label: React.ReactNode) => (
    <a href={withBase(href)} className={`${css.navLink} ${tab === key ? css.navOn : ''}`} aria-current={tab === key ? 'page' : undefined}>
      {label}
    </a>
  );
  return (
    <div className={`${css.shell} ${montserrat.variable}`}>
      <LiveRefresh />
      <header className={css.top}>
        <div className={css.topIn}>
          <a className={css.brand} href={withBase('/admin/dashboard')} aria-label={`Madvert Labs Patches CRM, ${ctx.account.name}`}>
            <img src={withBase('/assets/madvert/logo-light.webp')} alt="Madvert Labs" width={480} height={140} />
            <span className={css.brandRule} aria-hidden="true" />
            <span className={css.brandText}>
              <small>Madvert Labs Patches CRM</small>
              <b>{ctx.account.name}</b>
            </span>
          </a>
          <div className={css.who}>
            <AppTools variant="nav" />
            <a className={css.bell} href={withBase('/admin/notifications')} aria-label={alerts ? `Notifications, ${alerts} need attention` : 'Notifications'}>
              <span aria-hidden="true">🔔</span>
              {alerts > 0 && <b className={css.badge}>{alerts}</b>}
            </a>
            <a className={css.switch} href={withBase('/admin/accounts')} title="Switch account">⇄ Switch</a>
            <span className={css.me} title={`Signed in as ${ctx.actor}`}>
              <i aria-hidden="true" style={{ background: ctx.member?.color || '#0b172a' }}>{ctx.isOwner ? 'ML' : initials(ctx.actor)}</i>
              <span>{ctx.actor}</span>
            </span>
          </div>
          <nav className={css.nav} aria-label="CRM">
            {link('dashboard', '/admin/dashboard', 'Dashboard')}
            {link('pipeline', '/admin', 'Pipeline')}
            {link('contacts', '/admin/contacts', 'Contacts')}
            {link('tasks', '/admin/tasks', 'Tasks')}
            {link('notifications', '/admin/notifications', <>Notifications{alerts > 0 && <b className={css.badge} aria-label={`${alerts} need attention`}>{alerts}</b>}</>)}
            {link('team', '/admin/team', 'Team')}
            {link('funnel', '/admin/funnel', 'Funnel Health')}
            <form action={logout}>
              <button type="submit" className={css.logout}>Log out</button>
            </form>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
