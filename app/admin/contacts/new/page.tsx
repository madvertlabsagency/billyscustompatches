import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin-auth';
import { withBase } from '@/lib/base';
import { MAX_NOTE_LENGTH } from '@/lib/notes';
import { loadTeam, STAGES } from '@/lib/crm';
import { createContact } from '../../actions';
import Shell from '../../Shell';
import css from '../../crm.module.css';

export const metadata: Metadata = { title: 'Add contact | Billys Custom Patches portal', robots: { index: false } };
export const dynamic = 'force-dynamic';

const PATCH_TYPES = ['Embroidered', 'PVC', 'Woven', 'Chenille', 'Leather', 'Printed', 'Other'];

export default async function NewContactPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!(await isAdmin())) redirect('/admin/login');
  const { error } = await searchParams;
  const team = await loadTeam();
  return (
    <Shell tab="contacts">
      <main className={css.page}>
        <a className={css.back} href={withBase('/admin/contacts')}>← Back to contacts</a>
        <section className={css.panel} style={{ maxWidth: 760 }}>
          <h1 className={css.h} style={{ fontSize: 24 }}>Add a <span className={css.gt}>contact</span></h1>
          <p className={css.muted} style={{ margin: '6px 0 16px' }}>For leads you get yourself, by phone, walk in or referral. They go into the pipeline like every other lead. No automatic email or WhatsApp is sent to them.</p>
          {error && (
            <p className={css.alert} role="alert" style={{ marginBottom: 12 }}>
              {error === 'save' ? 'The contact could not be saved. Try again in a moment.' : 'Check the form: a first name and an email or phone number are needed, and the email must be valid.'}
            </p>
          )}
          <form action={createContact} className={css.formGrid}>
            <label>First name *<input className={css.input} name="first_name" required maxLength={60} autoComplete="off" /></label>
            <label>Last name<input className={css.input} name="last_name" maxLength={60} autoComplete="off" /></label>
            <label>Phone (with country code)<input className={css.input} name="phone" type="tel" maxLength={30} placeholder="+1 520 585 2589" /></label>
            <label>Email<input className={css.input} name="email" type="email" maxLength={160} placeholder="name@company.com" /></label>
            <label className={css.span2}>Business<input className={css.input} name="business" maxLength={120} /></label>
            <label>Patch type
              <select className={css.select} name="patch_type" defaultValue="">
                <option value="">Not specified</option>
                {PATCH_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label>Quantity<input className={css.input} name="quantity" maxLength={40} placeholder="e.g. 100" /></label>
            <label>Opportunity value ($)<input className={css.input} name="value" inputMode="decimal" maxLength={20} placeholder="e.g. 250" /></label>
            <label>Stage
              <select className={css.select} name="lead_status" defaultValue="new">
                {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
            <label className={css.span2}>Owner
              <select className={css.select} name="assignee_id" defaultValue="">
                <option value="">No owner</option>
                {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <label className={css.span2}>First note (optional)<textarea className={css.textarea} name="note" maxLength={MAX_NOTE_LENGTH} placeholder="Met at the trade show, needs 100 PVC patches by March" /></label>
            <div className={css.span2}><button type="submit" className={css.btn}>Add contact</button></div>
          </form>
        </section>
      </main>
    </Shell>
  );
}
