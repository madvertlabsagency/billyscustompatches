import { NextResponse, type NextRequest } from 'next/server';

// crm.madvertlabs.com serves only the Madvert Labs Patches CRM: the bare domain opens /patches and the
// funnel pages are not shown there. Other hosts (the Billys funnel domain) pass through untouched.
const CRM_HOSTS = (process.env.CRM_HOSTS || 'crm.madvertlabs.com').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);

function crmPath(path: string): boolean {
  return (
    path === '/patches' ||
    path.startsWith('/patches/') ||
    path.startsWith('/api/crm/') ||
    path.startsWith('/api/admin/') ||
    path === '/crm-sw.js' ||
    path.startsWith('/crm/') ||
    path.startsWith('/assets/')
  );
}

export function middleware(req: NextRequest) {
  const host = (req.headers.get('host') || '').toLowerCase().split(':')[0];
  if (!CRM_HOSTS.includes(host) || crmPath(req.nextUrl.pathname)) return NextResponse.next();
  const url = req.nextUrl.clone();
  const old = req.nextUrl.pathname.startsWith('/admin');
  url.pathname = old ? req.nextUrl.pathname.replace(/^\/admin/, '/patches') : '/patches';
  if (!old) url.search = '';
  return NextResponse.redirect(url, 307);
}

export const config = { matcher: ['/((?!_next/|favicon.ico|robots.txt).*)'] };
