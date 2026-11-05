'use client';
import Script from 'next/script';
import { useEffect, useState } from 'react';
import { captureAttribution, mirrorToServer, uuid } from '@/lib/track-client';

// Billys Custom Patches Meta Pixel. NEXT_PUBLIC_META_PIXEL_ID overrides it.
export const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || '1965489534813400';

export default function Tracking() {
  // PageView fires inside the Pixel snippet itself; the same event id goes to the Conversions API.
  const [pageViewId] = useState(() => uuid());
  useEffect(() => {
    captureAttribution();
    if (PIXEL_ID) mirrorToServer('PageView', {}, pageViewId);
  }, [pageViewId]);

  if (!PIXEL_ID) return null;
  return (
    <>
      <noscript>
        <img height="1" width="1" style={{ display: 'none' }} alt="" src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`} />
      </noscript>
      <Script
        id="meta-pixel"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL_ID}');fbq('track','PageView',{},{eventID:'${pageViewId}'});`,
        }}
      />
    </>
  );
}
