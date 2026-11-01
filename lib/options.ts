import { withBase } from './base';
// Funnel choices shared by the client form, the server validator and the PDF.
// Copy rule: no em dashes or en dashes; use "to" for ranges.

export const PATCH_TYPES = [
  { key: 'pvc', label: 'PVC', img: withBase('/assets/pvc.svg'), desc: 'Durable dimensional rubber patches that last outdoors.' },
  { key: 'emb', label: 'Embroidered', img: withBase('/assets/embroidered.svg'), desc: 'Classic textured embroidery for uniforms, teams and brands.' },
  { key: 'che', label: 'Chenille', img: withBase('/assets/chenille.svg'), desc: 'Premium varsity and streetwear style with a soft raised feel.' },
  { key: 'wov', label: 'Woven', img: withBase('/assets/woven.svg'), desc: 'Fine detail and small text with a flat, crisp finish.' },
  { key: 'sub', label: 'Sublimation', img: withBase('/assets/sublimation.svg'), desc: 'Full color printed patches for photos and detailed artwork.' },
  { key: 'uns', label: 'Not sure', img: '', desc: '' },
] as const;

export const QUANTITIES = ['10 to 24', '25 to 49', '50 to 99', '100 to 249', '250 to 499', '500 to 999', '1,000+', 'Not sure yet'] as const;

export const BACKINGS = [
  { label: 'Sew on', desc: 'Stitched in place' },
  { label: 'Iron on', desc: 'Heat applied' },
  { label: 'Velcro', desc: 'Hook and loop' },
  { label: 'Adhesive', desc: 'Peel and stick' },
  { label: 'Safety pin', desc: 'Pinned, removable' },
  { label: 'No backing', desc: 'Plain back' },
  { label: 'Not sure', desc: 'We will recommend' },
] as const;

export const DEADLINES = ['ASAP', 'Within 2 weeks', 'Within 1 month', '1 to 2 months', 'Just exploring', 'Specific deadline'] as const;

export const CONTACT_METHODS = ['WhatsApp', 'Phone', 'SMS', 'Email'] as const;

export const ARTWORK_EXTENSIONS = ['png', 'jpg', 'jpeg', 'pdf', 'ai', 'eps', 'svg'] as const;

export const ARTWORK_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  pdf: 'application/pdf',
  ai: 'application/postscript',
  eps: 'application/postscript',
  svg: 'image/svg+xml',
};

export const DEFAULT_MAX_MB = 25;

// Everything that names the business lives here. Fields left empty are hidden on the page,
// in emails and in the quote PDF, so fill them in before launch (see docs/BILLYS-CHECKLIST.md).
export const BUSINESS = {
  name: 'Billys Custom Patches',
  nameUpper: 'BILLYS CUSTOM PATCHES',
  tagline: '20+ years of award winning digitizing',
  codePrefix: 'BCP', // quote codes look like BCP-482913
  phoneDisplay: '+1 (844) 2-BILLYS',
  phoneTel: '18442245597', // also the WhatsApp number
  email: 'service@billyscustomdigitizing.com',
  address: '3705 W Pico Blvd# 26782, Los Angeles, CA 90019, United States',
  trustpilotUrl: '', // review page link; the reviews block stays hidden until real reviews exist
};

// "Billys Custom Patches, address, phone, email" with empty parts left out.
export function contactLine(sep = ', '): string {
  return [BUSINESS.name, BUSINESS.address, BUSINESS.phoneDisplay, BUSINESS.email].filter(Boolean).join(sep);
}

export const QUOTE_CODE_RE = new RegExp(`^${BUSINESS.codePrefix}-\\d{6}$`);
// Finds a quote code inside a WhatsApp message, tolerant of a missing dash or a space.
export const QUOTE_CODE_IN_TEXT = new RegExp(`${BUSINESS.codePrefix}-?\\s?(\\d{6})`, 'i');
// What the customer's WhatsApp opens with on the thank you page and in emails.
export const waVerifyText = (code: string) => `Hi ${BUSINESS.name}, my quote code is ${code}`;

export function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

export function formatDeadline(deadline: string, date?: string): string {
  if (deadline === 'Specific deadline' && date) {
    return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }
  return deadline;
}
