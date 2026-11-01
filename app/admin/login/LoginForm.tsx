'use client';
import { useActionState } from 'react';
import { login } from '../actions';

export default function LoginForm() {
  const [error, action, pending] = useActionState(login, '');
  return (
    <form action={action} className="qcard" style={{ maxWidth: 420, flex: 'none', width: '100%' }}>
      <h1 className="hd h3 mb">Owner login</h1>
      <label className="fld">
        Password
        <input className="inp" type="password" name="password" autoComplete="current-password" required autoFocus aria-invalid={!!error} />
      </label>
      {error && <p className="alert" role="alert">{error}</p>}
      <div className="navrow">
        <button className="next" type="submit" disabled={pending}>{pending ? 'Checking...' : 'Log in'}</button>
      </div>
    </form>
  );
}
