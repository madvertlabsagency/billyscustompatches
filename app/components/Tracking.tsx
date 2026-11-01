'use client';
import Script from 'next/script';
import { useEffect } from 'react';
import { captureAttribution, track, uuid } from '@/lib/track-client';

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

export default function Tracking() {
  useEffect(() => {
    captureAttribution();
  }, []);

  if (!PIXEL_ID) return null;
  const pageViewId = uuid();
  return (
    <Script
      id="meta-pixel"
      strategy="lazyOnload"
      onReady={() => { track('PageView', {}, pageViewId); }}
      dangerouslySetInnerHTML={{
        __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL_ID}');`,
      }}
    />
  );
}
