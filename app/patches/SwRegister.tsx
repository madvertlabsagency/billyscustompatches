'use client';
import { useEffect } from 'react';

// Registers the CRM service worker so the app can be installed and receive notifications.
export default function SwRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/crm-sw.js', { scope: '/patches' }).catch(() => undefined);
  }, []);
  return null;
}
