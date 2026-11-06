'use client';
import { useActionState } from 'react';
import { changeMyPassword } from '../actions';
import css from '../crm.module.css';

export default function ChangePassword() {
  const [msg, action, pending] = useActionState(changeMyPassword, '');
  return (
    <form action={action} className={css.formGrid}>
      <label>Current password<input className={css.input} name="current" type="password" required autoComplete="current-password" /></label>
      <label>New password (at least 8 characters)<input className={css.input} name="next" type="password" minLength={8} required autoComplete="new-password" /></label>
      <div className={css.span2} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="submit" className={css.btnGhost} disabled={pending}>{pending ? 'Saving...' : 'Change password'}</button>
        {msg && <span className={css.muted} role="status">{msg}</span>}
      </div>
    </form>
  );
}
