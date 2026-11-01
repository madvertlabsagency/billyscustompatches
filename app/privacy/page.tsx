import type { Metadata } from 'next';
import { BUSINESS, contactLine } from '@/lib/options';
import { withBase } from '@/lib/base';

export const metadata: Metadata = { title: 'Privacy Policy | Billys Custom Patches' };

// DRAFT: review with the business owner before launch.
export default function Privacy() {
  return (
    <main className="legal">
      <p><a href={withBase('/')}>Back to {BUSINESS.name}</a></p>
      <h1 className="hd">Privacy Policy</h1>
      <p>This policy explains how {BUSINESS.name} uses the information you share when you request a quote on this website.</p>
      <h2>What we collect</h2>
      <p>Your name, business name, email, phone or WhatsApp number, your patch requirements, any artwork you upload, and basic technical data such as your browser, IP address and the ad or link that brought you here.</p>
      <h2>How we use it</h2>
      <p>To prepare your quote and mockup, to contact you about your request by phone, SMS, WhatsApp or email, and to measure and improve our advertising. We do not sell your information.</p>
      <h2>Who we share it with</h2>
      <p>Service providers that help us run this website and our customer communication, including our CRM, hosting, file storage, email and messaging providers, and Meta for advertising measurement. Contact details sent to Meta are hashed first.</p>
      <h2>Your artwork</h2>
      <p>Uploaded files are stored privately and are only used to prepare your quote and order.</p>
      <h2>Your choices</h2>
      <p>You can ask us to stop contacting you at any time by replying STOP to a text, telling us on WhatsApp, or emailing us. You can also ask us to delete your information.</p>
      <h2>Contact</h2>
      <p>{contactLine()}</p>
    </main>
  );
}
