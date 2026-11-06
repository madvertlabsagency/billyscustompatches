'use client';
// Keeps CRM pages live: refreshes every 30 seconds while visible, when the app comes back to the
// front, and at once when a new lead notification arrives.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LiveRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const timer = setInterval(tick, seconds * 1000);
    document.addEventListener('visibilitychange', tick);
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'crm-refresh') router.refresh();
    };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      navigator.serviceWorker?.removeEventListener('message', onMsg);
    };
  }, [router, seconds]);
  return null;
}
