'use client';
// Browser side of CRM notifications: the service worker, the push subscription, and saving it for this user.
export const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
export const SCOPE = '/patches';

export type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function keyBytes(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration(SCOPE)) || navigator.serviceWorker.register('/crm-sw.js', { scope: SCOPE });
}

async function save(sub: PushSubscription, test: boolean): Promise<void> {
  const res = await fetch('/api/crm/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON(), test }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not turn on notifications.');
}

// Asks for permission (call it from a tap), subscribes this device and saves it for the signed in user.
export async function enablePush(test = true): Promise<void> {
  if (!VAPID) throw new Error('Notifications are not set up on the server yet.');
  if (!pushSupported()) throw new Error('This browser cannot show app notifications.');
  const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (p !== 'granted') throw new Error('Notifications are blocked. Allow them in your browser or phone settings, then try again.');
  const reg = await registration();
  if (!reg) throw new Error('This browser cannot show app notifications.');
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) as BufferSource }));
  await save(sub, test);
}

// When permission was already given (another visit, another login), keep this device subscribed quietly.
export async function refreshPush(): Promise<boolean> {
  if (!VAPID || !pushSupported() || Notification.permission !== 'granted') return false;
  try {
    await enablePush(false);
    return true;
  } catch {
    return false;
  }
}

export async function hasSubscription(): Promise<boolean> {
  try {
    return !!(await (await registration())?.pushManager.getSubscription());
  } catch {
    return false;
  }
}

export async function disablePush(): Promise<void> {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (!sub) return;
  await fetch('/api/crm/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
  await sub.unsubscribe();
}

// "Not now" hides a prompt for a few days on this device.
const KEY = 'crm-prompt-';
export function snoozed(name: string): boolean {
  try {
    return Number(localStorage.getItem(KEY + name) || 0) > Date.now();
  } catch {
    return false;
  }
}
export function snooze(name: string, days = 3): void {
  try {
    localStorage.setItem(KEY + name, String(Date.now() + days * 86400000));
  } catch {
    /* storage blocked: the prompt simply shows again next time */
  }
}
