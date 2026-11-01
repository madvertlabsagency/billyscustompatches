import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin-auth';
import { loadSettings } from '@/lib/funnel/load';
import { mergeSettings } from '@/lib/funnel/settings';
import localFont from 'next/font/local';
import FunnelDashboard from './FunnelDashboard';

// Madvert Labs brand face for the dashboard only (self hosted, no font CDN).
const montserrat = localFont({
  src: [
    { path: '../../fonts/montserrat-latin-600-normal.woff2', weight: '600' },
    { path: '../../fonts/montserrat-latin-700-normal.woff2', weight: '700' },
    { path: '../../fonts/montserrat-latin-800-normal.woff2', weight: '800' },
  ],
  variable: '--font-mv',
  display: 'swap',
});

export const metadata: Metadata = { title: 'Funnel Health | Billys Custom Patches', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function FunnelPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  const settings = await loadSettings().catch(() => mergeSettings(null));
  return (
    <div className={montserrat.variable}>
      <FunnelDashboard settings={settings} />
    </div>
  );
}
