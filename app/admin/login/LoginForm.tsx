'use client';
import { useActionState, useState } from 'react';
import { login } from '../actions';

export default function LoginForm() {
  const [error, action, pending] = useActionState(login, '');
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="qcard" style={{ maxWidth: 420, flex: 'none', width: '100%' }}>
      <h1 className="hd h3 mb">Owner login</h1>
      <label className="fld" htmlFor="admin-password">Password</label>
      <div style={{ position: 'relative', marginTop: 6 }}>
        <input
          id="admin-password"
          className="inp"
          type={show ? 'text' : 'password'}
          name="password"
          autoComplete="current-password"
          required
          autoFocus
          aria-invalid={!!error}
          style={{ paddingRight: 84 }}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
          style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', minHeight: 40, padding: '0 12px', border: 'none', borderRadius: 10, background: '#EEF0F3', color: 'var(--navy)', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      {error && <p className="alert" role="alert">{error}</p>}
      <div className="navrow">
        <button className="next" type="submit" disabled={pending}>{pending ? 'Checking...' : 'Log in'}</button>
      </div>
    </form>
  );
}
