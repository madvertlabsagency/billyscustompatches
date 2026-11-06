'use client';
// The Shopify style moment: when a new RFQ lands, an open CRM plays a cha-ching and shows a celebratory card
// with the Madvert Labs logo, the estimated value and the lead. It hears about new leads from the
// notification (service worker message) and from the live refresh (window event), and shows each lead once.
import { useCallback, useEffect, useRef, useState } from 'react';
import { gradeLine, money, type LeadAlert } from '@/lib/lead-alert';
import { montserrat } from './font';
import css from './crm.module.css';

export const NEW_LEAD_EVENT = 'crm-new-lead';
const SOUND = '/crm/cha-ching.mp3';

let audio: HTMLAudioElement | null = null;
function player(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(SOUND);
    audio.preload = 'auto';
    audio.volume = 0.9;
  }
  return audio;
}

export async function playChaChing(): Promise<boolean> {
  try {
    const a = player();
    a.currentTime = 0;
    await a.play();
    return true;
  } catch {
    return false; // the browser blocks sound until the person has tapped the page once
  }
}

const shown = new Set<string>();

export default function NewLeadToast() {
  const [alerts, setAlerts] = useState<LeadAlert[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((a: LeadAlert) => {
    if (!a?.leadId || shown.has(a.leadId)) return;
    shown.add(a.leadId);
    setAlerts((list) => [a, ...list].slice(0, 3));
    void playChaChing();
    if ('vibrate' in navigator) navigator.vibrate?.([90, 60, 220, 80, 220]);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAlerts([]), 10000);
  }, []);

  useEffect(() => {
    // Sound needs one tap on the page first: play silently on the first tap so later alerts can ring.
    const unlock = () => {
      const a = player();
      a.muted = true;
      a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(() => { a.muted = false; });
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    const onSw = (e: MessageEvent) => { if (e.data?.type === 'crm-new-lead') show(e.data.alert); };
    const onWin = (e: Event) => show((e as CustomEvent<LeadAlert>).detail);
    navigator.serviceWorker?.addEventListener('message', onSw);
    window.addEventListener(NEW_LEAD_EVENT, onWin);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      navigator.serviceWorker?.removeEventListener('message', onSw);
      window.removeEventListener(NEW_LEAD_EVENT, onWin);
    };
  }, [show]);

  if (!alerts.length) return null;
  const a = alerts[0];
  return (
    <div className={`${css.toastWrap} ${montserrat.variable}`} role="status" aria-live="assertive">
      <a href={a.url} className={`${css.toast} ${a.urgent ? css.toastHot : ''}`} onClick={() => setAlerts([])}>
        <span className={css.toastHead}>
          <img src="/crm/icon-192.png" alt="" width={22} height={22} />
          <span>Madvert Labs Patches CRM</span>
          <em>now</em>
        </span>
        <b className={css.toastTitle}>🎉 New RFQ received!</b>
        {a.est && <strong className={css.toastMoney}>{money(a.est)} <small>est.</small></strong>}
        <span className={css.toastBody}>
          Congratulations! <b>{a.name}</b>, {a.product}
        </span>
        {gradeLine(a) && <span className={`${css.chip} ${a.urgent ? css.chipBad : css.chipBlue}`}>{gradeLine(a)}</span>}
        {alerts.length > 1 && <span className={css.toastMore}>+{alerts.length - 1} more new RFQ{alerts.length > 2 ? 's' : ''}</span>}
      </a>
      <button type="button" className={css.toastClose} onClick={() => setAlerts([])} aria-label="Close">×</button>
    </div>
  );
}
