'use client';
import { useActionState, useState } from 'react';
import { login } from '../actions';
import css from '../crm.module.css';

export default function LoginForm({ business }: { business: string }) {
  const [error, action, pending] = useActionState(login, '');
  const [show, setShow] = useState(false);
  return (
    <form action={action} className={css.loginCard}>
      <h1 className={css.h}>Partner portal for <span className={css.gt}>{business}</span></h1>
      <p>Log in to see your leads, pipeline and team.</p>
      <label htmlFor="admin-password" style={{ display: 'block', fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Password</label>
      <div className={css.pw}>
        <input id="admin-password" className={css.input} type={show ? 'text' : 'password'} name="password" autoComplete="current-password" required autoFocus aria-invalid={!!error} />
        <button type="button" className={css.pwToggle} onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      {error && <p className={css.alert} role="alert">{error}</p>}
      <button className={css.btn} type="submit" disabled={pending}>{pending ? 'Checking...' : 'Log in'}</button>
    </form>
  );
}
