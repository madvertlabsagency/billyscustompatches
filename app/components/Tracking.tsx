'use client';
import { useEffect } from 'react';
import { captureAttribution, mirrorToServer } from '@/lib/track-client';

// Billys Custom Patches Meta Pixel. NEXT_PUBLIC_META_PIXEL_ID overrides it.
export const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || '1965489534813400';

// The standard Meta snippet, served in the page HTML so it runs as soon as the page loads (and shows in
// View Source and Pixel Helper). The PageView event id is made in the browser and kept on window, so
// the Conversions API copy below carries the same id and Meta counts the PageView once.
const SNIPPET = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL_ID}');(function(){var c=window.crypto,id=c&&c.randomUUID?c.randomUUID():Date.now()+'-'+Math.random().toString(16).slice(2);window.__pageViewId=id;fbq('track','PageView',{},{eventID:id});})();`;

declare global {
  interface Window {
    __pageViewId?: string;
  }
}

export default function Tracking() {
  useEffect(() => {
    captureAttribution();
    if (PIXEL_ID && window.__pageViewId) mirrorToServer('PageView', {}, window.__pageViewId);
  }, []);

  if (!PIXEL_ID) return null;
  return (
    <>
      <script id="meta-pixel" dangerouslySetInnerHTML={{ __html: SNIPPET }} />
      <noscript>
        <img height="1" width="1" style={{ display: 'none' }} alt="" src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`} />
      </noscript>
    </>
  );
}
