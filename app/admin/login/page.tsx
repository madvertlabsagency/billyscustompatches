import type { Metadata } from 'next';
import { withBase } from '@/lib/base';
import { montserrat } from '../font';
import css from '../crm.module.css';
import LoginForm from './LoginForm';

export const metadata: Metadata = { title: 'Sign in | Madvert Labs Patches CRM', robots: { index: false } };

export default function Page() {
  return (
    <div className={`${css.shell} ${montserrat.variable}`}>
      <main className={css.login}>
        <img src={withBase('/crm/icon-192.png')} alt="" width={72} height={72} style={{ borderRadius: 18, boxShadow: '0 18px 40px -18px rgba(0, 72, 160, 0.6)' }} />
        <LoginForm />
        <img src={withBase('/assets/madvert/logo-light.webp')} alt="Madvert Labs" width={480} height={140} style={{ height: 26, width: 'auto', opacity: 0.85 }} />
      </main>
    </div>
  );
}
