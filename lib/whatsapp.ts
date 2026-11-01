import 'server-only';
import { env } from './env';
import { Ghl } from './ghl';
import { BUSINESS } from './options';

// Messages sent after the customer messages us first (inside the free 24 hour service window),
// so no template approval is needed.
export function welcomeMessage(firstName: string, quoteNumber: string): string {
  return [
    `Hi ${firstName}! Thanks for your quote request with ${BUSINESS.name}. Your WhatsApp is now verified.`,
    ``,
    `Your quote number is ${quoteNumber}. Attached is a PDF with your patch details and artwork.`,
    ``,
    `A patch specialist will send your price and free mockup here within 24 hours.`,
    ``,
    `Quick question so we can start right away: what will these patches go on (hats, jackets, uniforms, bags)? Just reply here.`,
  ].join('\n');
}

// Business initiated message (outside the 24 hour window). Needs a template approved in WhatsApp Manager.
export async function sendWhatsAppTemplate(toE164: string, name: string, params: string[]): Promise<void> {
  const id = env.waPhoneNumberId();
  const token = env.waAccessToken();
  if (!id || !token) return;
  const res = await fetch(`https://graph.facebook.com/v21.0/${id}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toE164.replace(/\D/g, ''),
      type: 'template',
      template: {
        name,
        language: { code: env.waTemplateLang() },
        components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
      },
    }),
  });
  if (!res.ok) throw new Error(`WhatsApp template failed ${res.status}: ${await res.text()}`);
}

export async function sendWhatsApp(opts: { toE164: string; ghlContactId?: string | null; text: string; pdfUrl?: string; pdfName?: string }): Promise<void> {
  if (env.whatsappProvider() === 'ghl') {
    if (!opts.ghlContactId) throw new Error('No GHL contact yet for WhatsApp reply');
    const ghl = new Ghl(env.ghlToken(), env.ghlLocationId(), env.ghlBase());
    await ghl.sendWhatsApp(opts.ghlContactId, opts.text, opts.pdfUrl ? [opts.pdfUrl] : []);
    return;
  }
  const id = env.waPhoneNumberId();
  const token = env.waAccessToken();
  if (!id || !token) throw new Error('WhatsApp Cloud API is not configured');
  const to = opts.toE164.replace(/\D/g, '');
  const post = async (payload: Record<string, unknown>) => {
    const res = await fetch(`https://graph.facebook.com/v21.0/${id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, ...payload }),
    });
    if (!res.ok) throw new Error(`WhatsApp send failed ${res.status}: ${await res.text()}`);
  };
  await post({ type: 'text', text: { body: opts.text } });
  if (opts.pdfUrl) await post({ type: 'document', document: { link: opts.pdfUrl, filename: opts.pdfName || 'quote.pdf' } });
}
