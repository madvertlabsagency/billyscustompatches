'use client';
// Without notifications turned on, an open CRM still celebrates new RFQs: the live refresh brings the newest
// lead, and when it is one this device has not seen yet, the cha-ching popup shows.
import { useEffect } from 'react';
import type { LeadAlert } from '@/lib/lead-alert';
import { NEW_LEAD_EVENT } from './NewLeadToast';

export default function NewLeadWatcher({ account, latest }: { account: string; latest: LeadAlert | null }) {
  useEffect(() => {
    if (!latest) return;
    const key = `crm-last-lead-${account}`;
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(key);
      localStorage.setItem(key, latest.leadId);
    } catch {
      return; // storage blocked: skip, so an old lead is never announced as new
    }
    // First visit on this device: remember the newest lead quietly. Only leads from the last 30 minutes ring.
    const fresh = Date.now() - new Date(latest.at).getTime() < 30 * 60000;
    if (!(seen && seen !== latest.leadId && fresh)) return;
    // Wait a beat: on a full page load the popup in the layout starts listening after this page does.
    const t = setTimeout(() => window.dispatchEvent(new CustomEvent(NEW_LEAD_EVENT, { detail: latest })), 400);
    return () => clearTimeout(t);
  }, [account, latest]);
  return null;
}
