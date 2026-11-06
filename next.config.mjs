// Served from the root of its own domain by default. To serve it under a path of another
// domain (for example madvertlabs.com/billys through a rewrite) set NEXT_PUBLIC_BASE_PATH=/billys.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
// Domains allowed to post the admin forms (server actions) when the page is reached through
// the madvertlabs.com rewrite. Comma separated.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'madvertlabs.com,www.madvertlabs.com').split(',').map((s) => s.trim()).filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  experimental: { serverActions: { allowedOrigins } },
  poweredByHeader: false,
  // The CRM moved from /admin to /patches: old links, bookmarks and installed apps keep working.
  async redirects() {
    return [
      { source: '/admin', destination: '/patches', permanent: false },
      { source: '/admin/:path*', destination: '/patches/:path*', permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};
export default nextConfig;
