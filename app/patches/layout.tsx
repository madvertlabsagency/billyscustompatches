import type { Metadata, Viewport } from 'next';
import SwRegister from './SwRegister';
import AppPrompts from './AppPrompts';
import NewLeadToast from './NewLeadToast';

// Every /patches page is part of the installable Madvert Labs Patches CRM app, on phones and desktops.
export const metadata: Metadata = {
  title: 'Madvert Labs Patches CRM',
  applicationName: 'Madvert Labs Patches CRM',
  manifest: '/patches/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Patches CRM', statusBarStyle: 'default' },
  icons: { icon: '/crm/icon-192.png', apple: '/crm/apple-touch-icon.png' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#0b172a', width: 'device-width', initialScale: 1 };

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SwRegister />
      {children}
      <NewLeadToast />
      <AppPrompts />
    </>
  );
}
