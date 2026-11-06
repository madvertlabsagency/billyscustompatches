// The installable app: Madvert Labs Patches CRM, on phones and desktops. Opens on the account picker
// and stays inside /patches (the scope has no trailing slash so the pipeline at /patches is in it).
export const dynamic = 'force-static';

export function GET() {
  return new Response(
    JSON.stringify({
      id: '/patches',
      name: 'Madvert Labs Patches CRM',
      short_name: 'Patches CRM',
      description: 'Leads, pipeline, tasks and new lead alerts for Madvert Labs custom patches clients.',
      start_url: '/patches/accounts?source=app',
      scope: '/patches',
      display: 'standalone',
      background_color: '#f5faff',
      theme_color: '#0b172a',
      categories: ['business', 'productivity'],
      icons: [
        { src: '/crm/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/crm/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/crm/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      shortcuts: [
        { name: 'Pipeline', url: '/patches', icons: [{ src: '/crm/icon-192.png', sizes: '192x192', type: 'image/png' }] },
        { name: 'Notifications', url: '/patches/notifications', icons: [{ src: '/crm/icon-192.png', sizes: '192x192', type: 'image/png' }] },
        { name: 'Add contact', url: '/patches/contacts/new', icons: [{ src: '/crm/icon-192.png', sizes: '192x192', type: 'image/png' }] },
      ],
    }),
    { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' } },
  );
}
