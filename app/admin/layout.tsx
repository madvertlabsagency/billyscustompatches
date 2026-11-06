import type { Metadata, Viewport } from 'next';
import SwRegister from './SwRegister';

// Every /admin page is part of the installable Madvert Labs Patches CRM app.
export const metadata: Metadata = {
  applicationName: 'Madvert Labs Patches CRM',
  manifest: '/admin/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Patches CRM', statusBarStyle: 'black-translucent' },
  icons: { icon: '/crm/icon-192.png', apple: '/crm/apple-touch-icon.png' },
  robots: { index: false },
};

export const viewport: Viewport = { themeColor: '#0b172a', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SwRegister />
      {children}
    </>
  );
}
