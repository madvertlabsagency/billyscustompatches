import { withBase } from '@/lib/base';
import type { Ctx } from '@/lib/crm-auth';
import { initials } from '@/lib/crm';
import { actionCount } from '@/lib/crm-alerts';
import { loadAlerts } from '@/lib/crm-alerts-server';
import { db } from '@/lib/supabase';
import { toLeadAlert, type AlertLead } from '@/lib/lead-alert';
import NewLeadWatcher from './NewLeadWatcher';
import { logout } from './actions';
import { montserrat } from './font';
import AppTools from './AppTools';
import LiveRefresh from './LiveRefresh';
import css from './crm.module.css';

type Tab = 'dashboard' | 'pipeline' | 'contacts' | 'tasks' | 'notifications' | 'team' | 'funnel' | 'welcome' | 'none';

// The frame around every CRM page: Madvert Labs Patches CRM, the client account, who is signed in, the menu.
export default async function Shell({ tab, ctx, children }: { tab: Tab; ctx: Ctx; children: React.ReactNode }) {
  const [alerts, newest] = await Promise.all([
    loadAlerts(ctx.account.id).then(actionCount).catch(() => 0),
    // The newest funnel lead, so an open CRM can celebrate it. Contacts added by hand do not ring.
    db()
      .from('quote_requests')
      .select('id, first_name, last_name, quantity, patch_type, lead_grade, lead_score, tags, created_at')
      .eq('account_id', ctx.account.id)
      .neq('source', 'manual')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => (data ? toLeadAlert(data as AlertLead, ctx.account) : null), () => null),
  ]);
  const link = (key: Tab, href: string, label: React.ReactNode) => (
    <a href={withBase(href)} className={`${css.navLink} ${tab === key ? css.navOn : ''}`} aria-current={tab === key ? 'page' : undefined}>
      {label}
    </a>
  );
  return (
    <div className={`${css.shell} ${montserrat.variable}`}>
      <LiveRefresh />
      <NewLeadWatcher account={ctx.account.id} latest={newest} />
      <header className={css.top}>
        <div className={css.topIn}>
          <a className={css.brand} href={withBase('/patches/dashboard')} aria-label={`Madvert Labs Patches CRM, ${ctx.account.name}`}>
            <img src={withBase('/assets/madvert/logo-light.webp')} alt="Madvert Labs" width={480} height={140} />
            <span className={css.brandRule} aria-hidden="true" />
            <span className={css.brandText}>
              <small>Madvert Labs Patches CRM</small>
              <b>{ctx.account.name}</b>
            </span>
          </a>
          <div className={css.who}>
            <AppTools variant="nav" />
            <a className={css.bell} href={withBase('/patches/notifications')} aria-label={alerts ? `Notifications, ${alerts} need attention` : 'Notifications'}>
              <span aria-hidden="true">🔔</span>
              {alerts > 0 && <b className={css.badge}>{alerts}</b>}
            </a>
            <a className={css.switch} href={withBase('/patches/accounts')} title="Switch account">⇄ Switch</a>
            <span className={css.me} title={`Signed in as ${ctx.actor}`}>
              <i aria-hidden="true" style={{ background: ctx.member?.color || '#0b172a' }}>{ctx.isOwner ? 'ML' : initials(ctx.actor)}</i>
              <span>{ctx.actor}</span>
            </span>
          </div>
          <nav className={css.nav} aria-label="CRM">
            {link('dashboard', '/patches/dashboard', 'Dashboard')}
            {link('pipeline', '/patches', 'Pipeline')}
            {link('contacts', '/patches/contacts', 'Contacts')}
            {link('tasks', '/patches/tasks', 'Tasks')}
            {link('notifications', '/patches/notifications', <>Notifications{alerts > 0 && <b className={css.badge} aria-label={`${alerts} need attention`}>{alerts}</b>}</>)}
            {link('team', '/patches/team', 'Team')}
            {link('funnel', '/patches/funnel', 'Funnel Health')}
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
