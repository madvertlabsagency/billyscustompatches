# Customer journey and WhatsApp automation (no CRM needed)

Everything runs on Supabase, the WhatsApp Cloud API, email and the owner's `/admin` page. GoHighLevel is optional (`CRM_PROVIDER=ghl`).

## The customer journey
| Time | Customer sees | Owner sees |
|---|---|---|
| 0 min | Submits the 7 step form. Thank you page with a big **Verify on WhatsApp** button and their quote code | Email "New quote MKP-482913" with WhatsApp, Call, Email and Open leads buttons, all details and artwork links |
| 0 min | Email with the quote PDF (details plus their artwork) and a WhatsApp button | |
| when they tap Verify | WhatsApp opens with "Hi Billys Custom Patches, my quote code is MKP-482913" typed; they press Send | The chat appears in the WhatsApp Business app on the owner's phone |
| 1 second later | Auto reply on WhatsApp: welcome message, quote PDF and one easy question | Lead marked **WhatsApp verified** and **Contacted** on /admin |
| 10 min, not verified | Email "where should we send your free mockup?" with the WhatsApp button (plus a WhatsApp template if approved) | Lead shows **WhatsApp not verified** on /admin |
| within 24 h | Price and mockup from the owner on WhatsApp | Owner moves the lead to Quoted, Won or Lost on /admin |

Why the verify button works:
1. It **proves the number is real**: the message comes from that phone. Fake and VoIP numbers fail here. If they message from a different number, we save the real WhatsApp number.
2. The **customer starts the chat**, which opens WhatsApp's 24 hour service window: we can reply freely with files, no template approval, and Meta does not charge for service replies.
3. It **triggers the instant reply** with the PDF, while the customer is still holding their phone.

## Setup: WhatsApp Cloud API with coexistence (owner keeps using the WhatsApp Business app)
"Coexistence" lets the same number run the automation through the API **and** stay in the WhatsApp Business app on the owner's phone, so the owner answers every chat from the phone like today. You connect it through a Meta Business Partner that supports coexistence onboarding (for example 360dialog or Twilio; confirm coexistence support when you sign up). The number must already be active in the WhatsApp Business app.

1. Sign up with the partner and connect the existing Billys Custom Patches WhatsApp Business number using their coexistence flow (scan a QR code from the WhatsApp Business app).
2. developers.facebook.com, your app, WhatsApp, API Setup: copy the **Phone number ID**. Create a **System User** in Business Settings with a permanent token that has `whatsapp_business_messaging` and `whatsapp_business_management`.
3. App settings, Basic: copy the **App secret**.
4. WhatsApp, Configuration, Webhook: Callback URL `https://quote.billyscustompatches.com/api/whatsapp/inbound`, Verify token = any string, also put in `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. Subscribe to `messages`.
5. Vercel env:
   - `WHATSAPP_PROVIDER=meta`
   - `NEXT_PUBLIC_WHATSAPP_NUMBER=YOUR_WHATSAPP_NUMBER` (your WhatsApp number, digits with country code)
   - `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`

If the partner you pick sends webhooks in its own format instead of Meta's, tell us and we add a small adapter.

## Optional: WhatsApp nudge template
Messages we send first (customer has not written to us) need a template approved in WhatsApp Manager. Create a **Utility** template:

- Name: `rfq_verify_nudge`, language English (US)
- Body: `Hi {{1}}, this is Billys Custom Patches. We received your patch quote request {{2}}. Reply YES here to get your free mockup and price on WhatsApp.`

When approved, set `WHATSAPP_NUDGE_TEMPLATE=rfq_verify_nudge`. When the customer replies YES, the app matches their number, verifies them and sends the PDF. Without the template, the nudge goes by email only.

## Optional: code by WhatsApp (Twilio Verify)
For visitors on a laptop without WhatsApp, the thank you page offers "Send me a code instead". twilio.com, Verify, Services, Create, enable **WhatsApp**. Put the Account SID, Auth Token and Verify Service SID in Vercel. Leave them empty to hide this option. About $0.05 per verification plus the WhatsApp fee.

## Message texts
Auto reply after verification (edit in `lib/whatsapp.ts`):

> Hi {first name}! Thanks for your quote request with Billys Custom Patches. Your WhatsApp is now verified.
>
> Your quote number is MKP-482913. Attached is a PDF with your patch details and artwork.
>
> A patch specialist will send your price and free mockup here within 24 hours.
>
> Quick question so we can start right away: what will these patches go on (hats, jackets, uniforms, bags)? Just reply here.

The closing question is deliberate: a question answerable in one word gets far more replies than a plain thank you, and each reply keeps the free 24 hour window open.

## If you add GoHighLevel later
Set `CRM_PROVIDER=ghl` and the GHL variables. Leads then also sync to GHL (contact, custom fields, tags, note, opportunity in "Billys Custom Patches Sales Pipeline", stage "New RFQ"). If the WhatsApp number is connected to GHL instead of the Cloud API, set `WHATSAPP_PROVIDER=ghl` and add a GHL workflow: trigger **Customer Replied** (channel WhatsApp), action **Webhook** POST to `https://quote.billyscustompatches.com/api/whatsapp/inbound?secret=<GHL_WEBHOOK_SECRET>` with custom data `phone={{contact.phone}}`, `message={{message.body}}`, `contact_id={{contact.id}}`.
