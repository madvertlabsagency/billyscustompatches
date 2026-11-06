'use client';
import { useActionState, useState } from 'react';
import { login } from '../actions';
import css from '../crm.module.css';

// Team members sign in with email and password; the Madvert Labs admin can switch to the master password.
export default function LoginForm() {
  const [error, action, pending] = useActionState(login, '');
  const [show, setShow] = useState(false);
  const [owner, setOwner] = useState(false);
  // Kept in state so a wrong password does not wipe the email (a form action resets uncontrolled fields).
  const [email, setEmail] = useState('');
  return (
    <form action={action} className={css.loginCard}>
      <p className={css.kickerLight}>Madvert Labs</p>
      <h1 className={css.h}>Patches <span className={css.gt}>CRM</span></h1>
      <p>{owner ? 'Madvert Labs admin sign in with the master password.' : 'Sign in with the email and password your team gave you.'}</p>
      <input type="hidden" name="mode" value={owner ? 'owner' : 'member'} />
      {!owner && (
        <>
          <label htmlFor="crm-email" className={css.lbl}>Email</label>
          <input id="crm-email" className={css.input} style={{ width: '100%', minHeight: 50, fontSize: 16, marginBottom: 12 }} type="email" name="email" autoComplete="username" required autoFocus inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </>
      )}
      <label htmlFor="admin-password" className={css.lbl}>{owner ? 'Master password' : 'Password'}</label>
      <div className={css.pw}>
        <input id="admin-password" className={css.input} type={show ? 'text' : 'password'} name="password" autoComplete="current-password" required autoFocus={owner} aria-invalid={!!error} />
        <button type="button" className={css.pwToggle} onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      {error && <p className={css.alert} role="alert">{error}</p>}
      <button className={css.btn} type="submit" disabled={pending}>{pending ? 'Checking...' : 'Sign in'}</button>
      <button type="button" className={css.linkBtn} onClick={() => setOwner((v) => !v)}>
        {owner ? '← Team member sign in' : 'Madvert Labs admin? Use the master password'}
      </button>
    </form>
  );
}
