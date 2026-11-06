'use client';
// Install the CRM as an app and turn notifications on or off on this phone or computer.
import { useCallback, useEffect, useState } from 'react';
import { disablePush, enablePush, hasSubscription, isIOS, isStandalone, pushSupported, type InstallPrompt } from './pushClient';
import { playChaChing } from './NewLeadToast';
import css from './crm.module.css';

export default function AppTools({ variant }: { variant: 'nav' | 'panel' }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setIos(isIOS());
    setStandalone(isStandalone());
    setPerm(pushSupported() ? Notification.permission : 'unsupported');
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    hasSubscription().then(setSubscribed);
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
      await enablePush(true);
      setPerm('granted');
      setSubscribed(true);
      setMsg('Notifications are on. A test notification is on its way.');
    } catch (e) {
      setPerm(pushSupported() ? Notification.permission : 'unsupported');
      setMsg(e instanceof Error ? e.message : 'Could not turn on notifications.');
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      await disablePush();
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
          <span>{standalone ? 'You are using the installed app.' : 'Madvert Labs Patches CRM on your phone Home Screen or computer, full screen, one tap away.'}</span>
        </div>
        {standalone ? (
          <span className={`${css.chip} ${css.chipGood}`}>Installed</span>
        ) : prompt ? (
          <button type="button" className={css.btn} onClick={install}>⤓ Install app</button>
        ) : ios ? (
          <span className={css.iosHint}>On iPhone: tap <b>Share</b> <span aria-hidden="true">⎙</span>, then <b>Add to Home Screen</b>.</span>
        ) : (
          <span className={css.iosHint}>Chrome or Edge: use the install icon in the address bar, or the menu <b>⋮</b> and <b>Install app</b>.</span>
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
                : perm === 'denied'
                  ? 'Notifications are blocked for this site. Allow them in the browser or phone settings, then tap Turn on.'
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
      <div className={css.appToolRow}>
        <div>
          <b>New RFQ sound</b>
          <span>An open CRM plays a cha-ching and shows a popup when a new RFQ arrives. Phone notifications use the phone&apos;s own notification sound.</span>
        </div>
        <button type="button" className={css.btnGhost} onClick={() => void playChaChing()}>🔊 Play the cha-ching</button>
      </div>
      {msg && <p className={css.muted} role="status">{msg}</p>}
    </div>
  );
}
