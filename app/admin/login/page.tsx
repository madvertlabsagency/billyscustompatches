import type { Metadata } from 'next';
import { withBase } from '@/lib/base';
import { BUSINESS } from '@/lib/options';
import { montserrat } from '../font';
import css from '../crm.module.css';
import LoginForm from './LoginForm';

export const metadata: Metadata = { title: `Partner portal login | ${BUSINESS.name}`, robots: { index: false } };

export default function Page() {
  return (
    <div className={`${css.shell} ${montserrat.variable}`}>
      <main className={css.login}>
        <img src={withBase('/assets/madvert/logo-light.webp')} alt="Madvert Labs" width={480} height={140} style={{ height: 40, width: 'auto' }} />
        <LoginForm business={BUSINESS.name} />
        <p className={css.foot} style={{ marginTop: 0 }}>Custom Patches Partnership, a dedicated portal by Madvert Labs.</p>
      </main>
    </div>
  );
}
