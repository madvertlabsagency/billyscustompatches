import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin-auth';
import { db } from '@/lib/supabase';
import { withBase } from '@/lib/base';
import { BUSINESS } from '@/lib/options';
import Shell from '../Shell';
import css from '../crm.module.css';

export const metadata: Metadata = { title: `Welcome | ${BUSINESS.name} portal`, robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function WelcomePage() {
  if (!(await isAdmin())) redirect('/admin/login');
  const { count } = await db().from('quote_requests').select('id', { count: 'exact', head: true }).eq('lead_status', 'new');
  const fresh = count || 0;

  return (
    <Shell tab="welcome">
      <main className={css.page}>
        <div className={css.welcome}>
          <section className={css.hero}>
            <span className={css.confetti} aria-hidden="true" />
            <img src={withBase('/assets/madvert/logo-dark.webp')} alt="Madvert Labs" width={480} height={128} />
            <span className={css.kicker}>🎉 Custom Patches Partnership</span>
            <h1>Welcome to <span>{BUSINESS.name}</span>, from Madvert Labs</h1>
            <p>Congratulations, your partner portal is live. Every quote request from your funnel lands here, ready for your team to call, quote and close. Let&apos;s get you started.</p>
            <div className={css.heroCta}>
              <a className={css.btn} href={withBase('/admin')}>Open my pipeline{fresh ? ` (${fresh} new)` : ''} →</a>
              <a className={css.btnGhost} href={withBase('/admin/team')}>Add my team</a>
            </div>
          </section>

          <ol className={css.steps}>
            <li>
              <b>Add your team</b>
              <span>Add the people who handle leads, so you can make them owners and followers.</span>
              <a href={withBase('/admin/team')}>Go to Team →</a>
            </li>
            <li>
              <b>Work your pipeline</b>
              <span>New RFQs arrive in the first column. Use the arrows to move them to Contacted, Quote Sent, Won or Lost.</span>
              <a href={withBase('/admin')}>Open Pipeline →</a>
            </li>
            <li>
              <b>Keep notes on every lead</b>
              <span>Open a lead to call, WhatsApp or email in one tap, set the owner and log notes with the date and time.</span>
              <a href={withBase('/admin')}>See leads →</a>
            </li>
            <li>
              <b>Watch your funnel</b>
              <span>Funnel Health shows visits, quote requests and where people drop off, updated live.</span>
              <a href={withBase('/admin/funnel')}>Funnel Health →</a>
            </li>
          </ol>
          <p className={css.foot}>A dedicated portal for {BUSINESS.name}, built and run by Madvert Labs.</p>
        </div>
      </main>
    </Shell>
  );
}
