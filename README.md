# Billys Custom Patches quote funnel

Landing page and 7 step quote configurator for quote.billyscustompatches.com.
Next.js (App Router, TypeScript) on Vercel, Supabase, WhatsApp Cloud API, Meta Pixel plus Conversions API,
Cloudflare Turnstile. No CRM required: leads live in Supabase and on the owner's `/admin` page
(GoHighLevel sync is optional, `CRM_PROVIDER=ghl`).

- `docs/DEPLOY.md`: Vercel, your DNS provider, Supabase, Meta, Turnstile, email setup
- `docs/WHATSAPP-AUTOMATION.md`: the customer journey, WhatsApp verification, PDF auto reply, message texts
- `docs/NEW-CLIENT.md`: reusing this funnel for another client
- `supabase/schema.sql`: run once in Supabase
- `.env.example`: every environment variable

## Flow
1. Visitor completes the 7 steps. Answers are kept in sessionStorage, so Back or a refresh never loses them.
2. Artwork uploads go straight from the browser to a private Supabase bucket through signed upload URLs.
3. Submit: rate limit, Turnstile, zod validation, saved to `quote_requests` (status pending) FIRST.
4. After the response: Lead to Conversions API, PDF built (details plus artwork) and emailed to the customer,
   instant "new lead" email to the owner with one tap WhatsApp and Call buttons.
5. Thank you page asks the customer to verify on WhatsApp; their message triggers the WhatsApp reply with the PDF.
6. Not verified after 10 minutes: one nudge by email (and WhatsApp template if approved).
7. Owner works leads on `/admin`: status New, Contacted, Quoted, Won, Lost, plus notes.
8. Any failed background step is retried by `/api/cron/retry` with backoff (1, 5, 15, 60, 240 min, then every 6 h).

## Commands
```
npm install
npm run dev        # http://localhost:3000
npm test           # lead scoring, duplicate handling, GHL retry, PDF
npm run lint       # TypeScript check
npm run build
```

## Docs
- `docs/GHL-WORKFLOWS.md`: GoHighLevel setup, workflows and WhatsApp templates (click by click)
- `TEST-CHECKLIST.md`: launch test with UTM parameters and a Meta test event code

## Not done yet
- Lead score points and thresholds are placeholders in `lib/scoring.ts` until RFQ-SPEC.md is provided.
- Editable settings on /admin (phone, options, Pixel ID): these come from code and environment variables for now.
