// The funnel is served under a path on another domain (madvertlabs.com/billys).
// next.config.mjs sets basePath from the same value and exposes it here at build time.
// Next adds the prefix to <Link> and router.push by itself; everything else (plain <a>, <img>,
// fetch, CSS urls, metadata) goes through withBase().
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

export function withBase(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  return `${BASE_PATH}${path}`;
}
