'use client';
// The two prompts that make the CRM feel like an app: "Install the app" as soon as the browser allows it,
// and "Allow new lead alerts" once signed in. Browsers only show their own Allow box after a tap,
// so the second prompt asks first and opens the system box on that tap.
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { enablePush, isIOS, isStandalone, pushSupported, refreshPush, snooze, snoozed, VAPID, type InstallPrompt } from './pushClient';
import { montserrat } from './font';
import css from './crm.module.css';

type Sheet = 'install' | 'ios' | 'notify' | null;

export default function AppPrompts() {
  const path = usePathname() || '';
  const signedIn = !path.startsWith('/patches/login');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
      if (!isStandalone() && !snoozed('install')) setSheet((s) => s || 'install');
    };
    const onInstalled = () => setSheet((s) => (s === 'install' ? null : s));
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      // iPhone has no install event: explain Add to Home Screen once, since alerts need the installed app there.
      if (isIOS() && !isStandalone() && !snoozed('ios')) return setSheet((s) => s || 'ios');
      if (!signedIn || !VAPID || !pushSupported()) return;
      if (Notification.permission === 'granted') return void refreshPush();
      if (Notification.permission === 'default' && !snoozed('notify') && (!isIOS() || isStandalone())) setSheet((s) => s || 'notify');
    }, 1200);
    return () => clearTimeout(t);
  }, [signedIn, path]);

  if (!sheet) return null;

  const close = (name: string) => {
    snooze(name);
    setSheet(null);
    setMsg('');
  };

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice.catch(() => undefined);
    setPrompt(null);
    setSheet(null);
  };

  const allow = async () => {
    setBusy(true);
    setMsg('');
    try {
      await enablePush(true);
      setSheet(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not turn on notifications.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${css.sheetWrap} ${montserrat.variable}`} role="dialog" aria-modal="false" aria-labelledby="app-sheet-title">
      <div className={css.appSheet}>
        <img src="/crm/icon-192.png" alt="" width={56} height={56} />
        {sheet === 'install' && (
          <>
            <div className={css.sheetText}>
              <b id="app-sheet-title">Install Madvert Labs Patches CRM</b>
              <span>Open your leads in one tap from your Home Screen or desktop, full screen, with new lead alerts.</span>
            </div>
            <div className={css.sheetBtns}>
              <button type="button" className={css.btn} onClick={install}>⤓ Install app</button>
              <button type="button" className={css.btnGhost} onClick={() => close('install')}>Not now</button>
            </div>
          </>
        )}
        {sheet === 'ios' && (
          <>
            <div className={css.sheetText}>
              <b id="app-sheet-title">Install Patches CRM on your iPhone</b>
              <span>Tap <b>Share</b> <span aria-hidden="true">⎙</span> at the bottom of Safari, then <b>Add to Home Screen</b>. Open it from your Home Screen to get new lead alerts.</span>
            </div>
            <div className={css.sheetBtns}>
              <button type="button" className={css.btnGhost} onClick={() => close('ios')}>Got it</button>
            </div>
          </>
        )}
        {sheet === 'notify' && (
          <>
            <div className={css.sheetText}>
              <b id="app-sheet-title">Get new lead alerts on this device?</b>
              <span>A notification with the lead name and score the moment a new RFQ arrives. Tap Allow, then Allow again on the box that opens.</span>
              {msg && <span className={css.alert} role="alert">{msg}</span>}
            </div>
            <div className={css.sheetBtns}>
              <button type="button" className={css.btn} onClick={allow} disabled={busy}>{busy ? 'Turning on...' : '🔔 Allow'}</button>
              <button type="button" className={css.btnGhost} onClick={() => close('notify')}>Not now</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
