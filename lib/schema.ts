import { z } from 'zod';
import { BACKINGS, CONTACT_METHODS, DEADLINES, PATCH_TYPES, QUANTITIES } from './options';

const label = <T extends readonly { label: string }[]>(arr: T) => arr.map((o) => o.label) as [string, ...string[]];

export const artworkFileSchema = z.object({
  path: z.string().regex(/^rfq\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|jpeg|pdf|ai|eps|svg)$/, 'Invalid artwork path'),
  name: z.string().min(1).max(200),
  size: z.number().int().positive(),
  ext: z.string(),
});

export const trackingSchema = z.object({
  utm_source: z.string().max(200).optional(),
  utm_medium: z.string().max(200).optional(),
  utm_campaign: z.string().max(200).optional(),
  utm_content: z.string().max(200).optional(),
  utm_term: z.string().max(200).optional(),
  fbclid: z.string().max(500).optional(),
  meta_campaign_id: z.string().max(40).optional(),
  meta_adset_id: z.string().max(40).optional(),
  meta_ad_id: z.string().max(40).optional(),
  landing_page: z.string().max(1000).optional(),
  fbp: z.string().max(200).optional(),
  fbc: z.string().max(500).optional(),
  // first party funnel analytics ids, so the server can log rfq_submit to the same session
  funnel_session_id: z.string().max(64).optional(),
  funnel_visitor_id: z.string().max(64).optional(),
  device: z.enum(['mobile', 'tablet', 'desktop']).optional(),
});

export const submissionSchema = z
  .object({
    patchType: z.enum(label(PATCH_TYPES)),
    quantity: z.enum(QUANTITIES as unknown as [string, ...string[]]),
    width: z.string().max(10).optional().default(''),
    height: z.string().max(10).optional().default(''),
    sizeUnsure: z.boolean(),
    backing: z.enum(label(BACKINGS)),
    files: z.array(artworkFileSchema).max(10),
    noArtwork: z.boolean(),
    deadline: z.enum(DEADLINES as unknown as [string, ...string[]]),
    deadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    notes: z.string().max(3000).optional().default(''),
    firstName: z.string().trim().min(1, 'Enter your first name.').max(80),
    lastName: z.string().trim().min(1, 'Enter your last name.').max(80),
    business: z.string().trim().max(120).optional().default(''),
    email: z.string().trim().email('Enter a valid email so we can send your quote.').max(200),
    phone: z.string().trim().min(8, 'Enter your WhatsApp number.').max(25),
    contactMethod: z.enum(CONTACT_METHODS as unknown as [string, ...string[]]),
    consent: z.literal(true, { errorMap: () => ({ message: 'Tick the box to agree to be contacted about your quote.' }) }),
    turnstileToken: z.string().optional().default(''),
    eventId: z.string().uuid(),
    tracking: trackingSchema.default({}),
  })
  .superRefine((v, ctx) => {
    if (!v.sizeUnsure && !(parseFloat(v.width) > 0 && parseFloat(v.height) > 0)) {
      ctx.addIssue({ code: 'custom', path: ['width'], message: "Enter a width and height in inches, or tick I'm not sure yet." });
    }
    if (!v.files.length && !v.noArtwork) {
      ctx.addIssue({ code: 'custom', path: ['files'], message: "Upload your artwork, or tick I don't have artwork yet." });
    }
    if (v.deadline === 'Specific deadline' && !v.deadlineDate) {
      ctx.addIssue({ code: 'custom', path: ['deadlineDate'], message: 'Pick your deadline date.' });
    }
    if (v.phone.replace(/\D/g, '').length < 8) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Enter your full WhatsApp number.' });
    }
  });

export type Submission = z.infer<typeof submissionSchema>;
export type ArtworkFile = z.infer<typeof artworkFileSchema>;
export type Tracking = z.infer<typeof trackingSchema>;
