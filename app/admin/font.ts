import localFont from 'next/font/local';

// Madvert Labs brand face for the partner portal (self hosted, no font CDN).
export const montserrat = localFont({
  src: [
    { path: '../fonts/montserrat-latin-600-normal.woff2', weight: '600' },
    { path: '../fonts/montserrat-latin-700-normal.woff2', weight: '700' },
    { path: '../fonts/montserrat-latin-800-normal.woff2', weight: '800' },
  ],
  variable: '--font-mv',
  display: 'swap',
});
