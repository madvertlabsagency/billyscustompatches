import type { Metadata } from 'next';
import { BUSINESS, contactLine } from '@/lib/options';
import { withBase } from '@/lib/base';

export const metadata: Metadata = { title: 'Terms | Billys Custom Patches' };

// DRAFT: review with the business owner before launch.
export default function Terms() {
  return (
    <main className="legal">
      <p><a href={withBase('/')}>Back to {BUSINESS.name}</a></p>
      <h1 className="hd">Terms</h1>
      <p>Requesting a quote on this website is free and does not commit you to an order.</p>
      <h2>Quotes and mockups</h2>
      <p>Quotes are based on the details you provide and are confirmed in writing before production. Mockups are digital previews; final patches may vary slightly in color and stitch detail.</p>
      <h2>Your artwork</h2>
      <p>By uploading artwork you confirm you have the right to use it, including any logos or trademarks it contains.</p>
      <h2>Messages</h2>
      <p>By submitting the quote form you agree that we may contact you about your quote by phone, SMS, WhatsApp or email. Message and data rates may apply. Reply STOP to opt out of texts.</p>
      <h2>Contact</h2>
      <p>{contactLine()}</p>
    </main>
  );
}
