# Reusing this funnel for another client

The app is built so a new client is a copy plus configuration, not a rebuild.

1. Copy the `quote-funnel` folder into the client's repo (or a new folder in this one).
2. **Business details**: `lib/options.ts`, `BUSINESS` (name, phone, email, address, Trustpilot link).
3. **Funnel choices**: `lib/options.ts`, product types, quantities, backings, deadlines, contact methods.
4. **Copy and sections**: `app/page.tsx` (hero, trust grid, how it works, reviews, FAQ, final CTA).
5. **Brand**: colors are CSS variables at the top of `app/globals.css`; fonts in `app/fonts` and `app/layout.tsx`; logo and illustrations in `public/assets`.
6. **Messages**: WhatsApp auto reply in `lib/whatsapp.ts`; emails and the owner alert in `lib/service.ts`; PDF layout in `lib/pdf.ts`.
7. **Lead score**: points and tag rules in `lib/scoring.ts`.
8. New Supabase project (run `supabase/schema.sql`), new Vercel project (Root Directory = the folder), the client's own Pixel, WhatsApp number and email domain in the environment variables.
9. Client's DNS: one CNAME record, as in `docs/DEPLOY.md`.

Each client gets their own database, storage, Vercel project and keys, so no client can ever see another client's leads.
