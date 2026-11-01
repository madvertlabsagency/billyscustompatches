import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import Tracking from './components/Tracking';
import './globals.css';
import { withBase } from '@/lib/base';

// Self hosted (Archivo Black headings, DM Sans body) so the page never waits on a font CDN.
const archivo = localFont({ src: './fonts/archivo-black-latin-400-normal.woff2', weight: '400', variable: '--font-archivo', display: 'swap' });
const dm = localFont({
  src: [
    { path: './fonts/dm-sans-latin-400-normal.woff2', weight: '400' },
    { path: './fonts/dm-sans-latin-500-normal.woff2', weight: '500' },
    { path: './fonts/dm-sans-latin-700-normal.woff2', weight: '700' },
  ],
  variable: '--font-dm',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: 'Billys Custom Patches, Get a Free Quote',
  description:
    'PVC, embroidered, chenille, woven and printed patches from a team with 20+ years of award winning digitizing. Free design, free mockup in 24 hours, free shipping and no minimum order.',
  icons: { icon: withBase('/assets/logo-160.webp') },
  openGraph: { title: 'Billys Custom Patches, Get a Free Quote', images: [withBase('/assets/logo-240.png')] },
};

export const viewport: Viewport = { themeColor: '#121316', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${dm.variable}`}
      style={
        {
          '--img-bg-light': `url(${withBase('/assets/bg-pattern-light.svg')})`,
          '--img-bg-dark': `url(${withBase('/assets/bg-pattern-dark.svg')})`,
          '--img-icons': `url(${withBase('/assets/icons-3d-sprite.svg')})`,
        } as React.CSSProperties
      }
    >
      <body>
        {children}
        <Tracking />
      </body>
    </html>
  );
}
