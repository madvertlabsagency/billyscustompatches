'use client';
import { useEffect, useState } from 'react';
import { BUSINESS, waVerifyText } from '@/lib/options';
import { withBase } from '@/lib/base';

const WA = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '').replace(/\D/g, '');

type Last = { id: string; code: string; first: string; summary: { k: string; v: string }[]; hasArtwork: boolean };

export default function ThankYou() {
  const [last, setLast] = useState<Last | null>(null);
  const [verified, setVerified] = useState(false);
  const [otpMode, setOtpMode] = useState<'idle' | 'sent'>('idle');
  const [otp, setOtp] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    try {
      setLast(JSON.parse(sessionStorage.getItem('cpl-last') || 'null'));
    } catch {
      /* ignore */
    }
  }, []);

  // Poll until the customer's WhatsApp message reaches us.
  useEffect(() => {
    if (!last || verified) return;
    const t = setInterval(async () => {
      const r = await fetch(withBase(`/api/rfq/status?id=${last.id}&code=${last.code}`)).then((x) => x.json()).catch(() => null);
      if (r?.verified) setVerified(true);
    }, 4000);
    return () => clearInterval(t);
  }, [last, verified]);

  const waText = last ? waVerifyText(last.code) : `Hi ${BUSINESS.name}`;
  const waLink = WA ? `https://wa.me/${WA}?text=${encodeURIComponent(waText)}` : '';

  async function otpCall(action: 'send' | 'check') {
    if (!last) return;
    setMsg('');
    const r = await fetch(withBase('/api/whatsapp/otp'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: last.id, code: last.code, action, otp: action === 'check' ? otp : undefined }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(d.error || 'Something went wrong.');
    if (action === 'send') {
      setOtpMode('sent');
      setMsg('Code sent. Check WhatsApp.');
    } else if (d.verified) setVerified(true);
  }

  return (
    <div className="ty">
      <img src={withBase('/assets/logo-160.webp')} alt="" width={96} height={96} style={{ borderRadius: '50%' }} />
      <h1 className="hd" style={{ margin: '14px 0 8px', fontSize: 'clamp(28px, 3.6vw, 42px)' }}>Your Quote Request Is In!</h1>
      <p style={{ margin: '0 auto 22px', fontSize: 17, color: 'var(--muted)', maxWidth: 520 }}>
        Thanks{last?.first ? ` ${last.first}` : ''}. Our patch team has received your project details and will send your quote and free mockup within 24 hours.
      </p>

      {last && waLink && (
        <div className="wa-box" aria-live="polite">
          {verified ? (
            <>
              <strong style={{ fontSize: 20 }}>WhatsApp verified. Check your chat!</strong>
              <p style={{ margin: '8px 0 0', color: 'var(--muted)' }}>We just sent your quote details and PDF on WhatsApp.</p>
            </>
          ) : (
            <>
              <strong style={{ fontSize: 20 }}>Last step: confirm your WhatsApp</strong>
              <p style={{ margin: '8px 0 16px', color: 'var(--muted)' }}>
                Tap the button and press Send. We will reply right away with your quote details and PDF, and send your mockup there.
              </p>
              <a href={waLink} target="_blank" rel="noopener" className="btn wa-btn">
                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="#fff"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.3-.8-2.8-1.1-4.5-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.3.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3z"/></svg>
                Verify on WhatsApp
              </a>
              <p style={{ margin: '12px 0 0', fontSize: 14 }}>
                Your quote code: <strong>{last.code}</strong>
              </p>
              <div style={{ marginTop: 14, fontSize: 14 }}>
                {otpMode === 'idle' ? (
                  <button type="button" onClick={() => otpCall('send')} style={{ background: 'none', border: 'none', textDecoration: 'underline', color: 'var(--navy)', minHeight: 44, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>
                    Can&apos;t open WhatsApp here? Send me a code instead
                  </button>
                ) : (
                  <form onSubmit={(e) => { e.preventDefault(); otpCall('check'); }} style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <label className="sr-only" htmlFor="otp">Code from WhatsApp</label>
                    <input id="otp" className="inp" style={{ maxWidth: 160, textAlign: 'center' }} inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="6 digit code" />
                    <button type="submit" className="next" style={{ marginLeft: 0 }}>Verify</button>
                  </form>
                )}
                {msg && <p role="status" style={{ margin: '8px 0 0' }}>{msg}</p>}
              </div>
            </>
          )}
        </div>
      )}

      {last && (
        <div style={{ textAlign: 'left', background: '#fff', borderRadius: 20, padding: '10px 20px', marginTop: 22 }}>
          {last.summary.map((r) => (
            <div className="srow" key={r.k} style={{ padding: '11px 0' }}><span>{r.k}</span><strong>{r.v}</strong></div>
          ))}
        </div>
      )}

      {BUSINESS.phoneTel && (
        <>
          <p style={{ margin: '24px 0 12px', fontWeight: 700, fontSize: 17 }}>Need help faster?</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={`tel:${BUSINESS.phoneTel}`} className="btn" style={{ background: 'var(--navy)', color: '#fff', padding: '0 24px', minHeight: 52 }}>Call {BUSINESS.phoneDisplay}</a>
            <a href={`sms:${BUSINESS.phoneTel}`} className="btn" style={{ background: 'var(--teal)', color: '#fff', padding: '0 24px', minHeight: 52 }}>Text us</a>
          </div>
        </>
      )}
      <a href={withBase('/#quote')} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, marginTop: 20, fontSize: 14 }}>Start another quote</a>
    </div>
  );
}
