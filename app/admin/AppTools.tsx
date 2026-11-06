'use client';
// Install the CRM as an app and turn on new lead notifications on this phone or computer.
import { useCallback, useEffect, useState } from 'react';
import css from './crm.module.css';

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function keyBytes(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration('/admin/')) || navigator.serviceWorker.register('/crm-sw.js', { scope: '/admin/' });
}

export default function AppTools({ variant }: { variant: 'nav' | 'panel' }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const ua = navigator.userAgent;
    setIos(/iphone|ipad|ipod/i.test(ua));
    setStandalone(window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    setPerm('Notification' in window && 'PushManager' in window ? Notification.permission : 'unsupported');
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    registration()
      .then((r) => r?.pushManager.getSubscription())
      .then((s) => setSubscribed(!!s))
      .catch(() => undefined);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const install = useCallback(async () => {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice.catch(() => undefined);
    setPrompt(null);
  }, [prompt]);

  const enable = useCallback(async () => {
    setBusy(true);
    setMsg('');
    try {
      if (!VAPID) throw new Error('Notifications are not set up on the server yet.');
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p !== 'granted') throw new Error('Notifications are blocked. Allow them in your browser or phone settings, then try again.');
      const reg = await registration();
      if (!reg) throw new Error('This browser cannot show app notifications.');
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) as BufferSource }));
      const res = await fetch('/api/crm/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON(), test: true }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not turn on notifications.');
      setSubscribed(true);
      setMsg('Notifications are on. A test notification is on its way.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not turn on notifications.');
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await registration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/crm/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setMsg('Notifications are off on this device.');
    } finally {
      setBusy(false);
    }
  }, []);

  if (variant === 'nav') {
    return prompt && !standalone ? (
      <button type="button" className={css.installBtn} onClick={install}>⤓ Install app</button>
    ) : null;
  }

  const needsInstallFirst = ios && !standalone; // iPhone shows web app notifications only once the app is on the Home Screen
  return (
    <div className={css.appTools}>
      <div className={css.appToolRow}>
        <div>
          <b>Install the app</b>
          <span>{standalone ? 'You are using the installed app.' : 'Madvert Labs Patches CRM on your Home Screen, full screen, one tap away.'}</span>
        </div>
        {standalone ? (
          <span className={`${css.chip} ${css.chipGood}`}>Installed</span>
        ) : prompt ? (
          <button type="button" className={css.btn} onClick={install}>⤓ Install app</button>
        ) : ios ? (
          <span className={css.iosHint}>On iPhone: tap <b>Share</b> <span aria-hidden="true">⎙</span>, then <b>Add to Home Screen</b>.</span>
        ) : (
          <span className={css.iosHint}>Open the browser menu <b>⋮</b> and choose <b>Install app</b> or <b>Add to Home screen</b>.</span>
        )}
      </div>
      <div className={css.appToolRow}>
        <div>
          <b>New lead notifications</b>
          <span>
            {perm === 'unsupported'
              ? 'This browser cannot show notifications. Use Chrome, Edge or Safari, or install the app.'
              : needsInstallFirst
                ? 'On iPhone, add the app to your Home Screen first, open it from there, then turn notifications on.'
                : subscribed
                  ? 'On for this device. You get a ping the moment a new RFQ lead arrives.'
                  : 'Get a ping on this device with the lead name and score the moment a new RFQ arrives.'}
          </span>
        </div>
        {perm !== 'unsupported' && !needsInstallFirst && (
          subscribed ? (
            <button type="button" className={css.btnGhost} onClick={disable} disabled={busy}>Turn off</button>
          ) : (
            <button type="button" className={css.btn} onClick={enable} disabled={busy}>{busy ? 'Turning on...' : '🔔 Turn on notifications'}</button>
          )
        )}
      </div>
      {msg && <p className={css.muted} role="status">{msg}</p>}
    </div>
  );
}
