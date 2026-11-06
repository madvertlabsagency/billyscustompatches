// The installable app: Madvert Labs Patches CRM. Opens on the account picker, stays inside /admin.
export const dynamic = 'force-static';

export function GET() {
  return new Response(
    JSON.stringify({
      id: '/admin/',
      name: 'Madvert Labs Patches CRM',
      short_name: 'Patches CRM',
      description: 'Leads, pipeline, tasks and alerts for Madvert Labs custom patches clients.',
      start_url: '/admin/accounts?source=app',
      scope: '/admin/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#f5faff',
      theme_color: '#0b172a',
      icons: [
        { src: '/crm/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/crm/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/crm/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      shortcuts: [
        { name: 'Pipeline', url: '/admin', icons: [{ src: '/crm/icon-192.png', sizes: '192x192' }] },
        { name: 'Notifications', url: '/admin/notifications', icons: [{ src: '/crm/icon-192.png', sizes: '192x192' }] },
      ],
    }),
    { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' } },
  );
}
