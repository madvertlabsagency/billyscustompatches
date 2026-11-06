import { withBase } from '@/lib/base';
import { BUSINESS } from '@/lib/options';
import { logout } from './actions';
import { montserrat } from './font';
import css from './crm.module.css';

type Tab = 'dashboard' | 'pipeline' | 'contacts' | 'tasks' | 'team' | 'funnel' | 'welcome' | 'none';

// The branded frame around every partner portal page: Madvert Labs, the partner's name, and the menu.
export default function Shell({ tab, children }: { tab: Tab; children: React.ReactNode }) {
  const link = (key: Tab, href: string, label: string) => (
    <a href={withBase(href)} className={`${css.navLink} ${tab === key ? css.navOn : ''}`} aria-current={tab === key ? 'page' : undefined}>
      {label}
    </a>
  );
  return (
    <div className={`${css.shell} ${montserrat.variable}`}>
      <header className={css.top}>
        <div className={css.topIn}>
          <a className={css.brand} href={withBase('/admin/dashboard')} aria-label={`Madvert Labs partner portal for ${BUSINESS.name}`}>
            <img src={withBase('/assets/madvert/logo-light.webp')} alt="Madvert Labs" width={480} height={140} />
            <span className={css.brandRule} aria-hidden="true" />
            <span className={css.brandText}>
              <small>Custom Patches Partnership</small>
              <b>{BUSINESS.name} portal</b>
            </span>
          </a>
          <nav className={css.nav} aria-label="Portal">
            {link('dashboard', '/admin/dashboard', 'Dashboard')}
            {link('pipeline', '/admin', 'Pipeline')}
            {link('contacts', '/admin/contacts', 'Contacts')}
            {link('tasks', '/admin/tasks', 'Tasks')}
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
