# Billys Custom Patches: launch checklist

Same funnel and automation as Custom Patch Lab: landing page, 7 step quote form, lead saved in Supabase,
instant email to the customer and the owner, WhatsApp verification with the quote PDF, nudge after 10
minutes, Meta Pixel plus Conversions API, owner dashboard at /admin.

## 1. Show the client (today)
- [ ] Vercel: Add New Project, repo `markhorpatches`, Root Directory `billys-funnel`, deploy.
      The landing page works without any keys; the form needs step 3 before it can save leads.

## 2. From the client
- [ ] WhatsApp number from billyscustomdigitizing.com: confirm whether it is on the WhatsApp Business app
      or the Cloud API (Cloud API is needed for the instant automatic reply with the PDF)
- [ ] Phone, email and business address (from billyscustomdigitizing.com) for the header, footer, PDF and legal pages (`lib/options.ts` BUSINESS)
- [ ] Domain for the funnel (for example quote.billyscustompatches.com) and access to its DNS
- [ ] Meta ad account, Pixel (dataset) ID and a Conversions API token
- [ ] Real customer reviews (shown only when real ones exist) and real patch photos if they have them
- Offers confirmed by the client and live on the page: free design, free shipping, unlimited design
  revisions, no minimum order, free mockup in 24 hours, money back guarantee, pre production sample.
- [ ] Money back guarantee terms for the Terms page (time limit, return of the patches)

## 3. Our setup (about an hour once we have step 2)
- [ ] New Supabase project, run `supabase/schema.sql`, create the private artwork bucket
- [ ] Vercel environment variables from `.env.example` (Supabase, admin password, cron secret, Turnstile,
      Resend for email, WhatsApp, Meta Pixel and CAPI). Never paste keys into chat.
- [ ] WhatsApp Cloud API: number, webhook `/api/whatsapp/inbound`, verify token, app secret,
      nudge template approved by Meta (docs/WHATSAPP-AUTOMATION.md)
- [ ] Email sender domain verified in Resend (customer email and owner alert)
- [ ] Optional GoHighLevel sync (`CRM_PROVIDER=ghl`, docs/GHL-WORKFLOWS.md)
- [ ] Connect the domain in Vercel and set `NEXT_PUBLIC_SITE_URL`

## 4. Test before ads
- [ ] One test lead end to end with permission: form, email, WhatsApp verify, PDF reply, /admin, Meta test events
- [ ] Mobile speed check and the Funnel Health page at /admin/funnel
