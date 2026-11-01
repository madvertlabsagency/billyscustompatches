# GoHighLevel setup for the quote funnel (owner only, no reps)

The funnel code does the data work automatically: for every quote request it creates or updates the contact
(never a duplicate), fills the custom fields, adds tags, adds a note with the full specification, assigns the
owner and creates an opportunity. Everything below is what you click inside GHL once.

Menu names follow the current GHL interface; if one has moved, use the search bar at the top of GHL.

---

## Part A. One time setup (about 30 minutes)

### A1. Owner user and mobile app
1. Settings, **My Staff**: make sure the owner is a user with a mobile number and email.
2. Open the owner's user, copy the **User ID** (shown in the URL or the user details). This goes in Vercel as `GHL_ROUND_ROBIN_USER_IDS`.
3. Install the **LeadConnector** app on the owner's phone, log in, and allow notifications. All WhatsApp chats, lead alerts and reminders arrive here.

### A2. Pipeline
Opportunities, **Pipelines**, Create new pipeline:
- Name: `Billys Custom Patches Sales Pipeline` (exactly this, the code looks it up by name)
- Stages, in order:
  1. `New RFQ` (exactly this)
  2. `Contacted`
  3. `Mockup Sent`
  4. `Quoted`
  5. `Won`
  6. `Lost`

How the owner uses it: move the card to **Contacted** as soon as you talk to the customer (this stops the speed to lead reminders), **Mockup Sent** when the mockup goes out, **Quoted** when the price goes out (this starts the follow ups), then **Won** or **Lost**.

### A3. WhatsApp
1. Settings, **WhatsApp**, connect the Billys Custom Patches WhatsApp Business number and finish Meta's steps.
2. Before connecting, read GHL's notes on that screen about using the same number in the WhatsApp Business phone app ("coexistence"). If GHL does not offer it for your account, the number moves to GHL and the owner answers WhatsApp in the LeadConnector app.
3. Settings, WhatsApp, **Templates**: create the templates in Part C and submit them for approval (usually minutes to a day).

### A4. Email sending
Settings, **Email Services**: set up the sending domain for `billyscustompatches.com` (GHL shows DNS records; add them in **your DNS provider**). Set the default from name `Billys Custom Patches` and from address, for example `quotes@billyscustompatches.com`. The customer's PDF email is sent through this.

### A5. SMS (optional, US numbers)
Only if you want SMS too: Settings, **Phone Numbers**, buy a number, then complete **A2P 10DLC** registration (Trust Center). US carriers block business SMS until A2P is approved, which can take one to three weeks. WhatsApp and email work without it, so you can launch without SMS.

### A6. API access for the funnel
Settings, **Private Integrations**, Create new integration, name `Quote funnel`, scopes:
- contacts (view, edit), contacts tags (write)
- opportunities (view, edit)
- locations custom fields (view, edit)
- conversations (view, edit), conversations messages (view, edit)
- users (view)

Copy the token. Settings, **Business Profile**: copy the **Location ID**.
Put both **directly in Vercel** (never in chat or email):

| Vercel variable | Value |
|---|---|
| `CRM_PROVIDER` | `ghl` |
| `WHATSAPP_PROVIDER` | `ghl` |
| `CUSTOMER_EMAIL_PROVIDER` | `ghl` |
| `GHL_PRIVATE_INTEGRATION_TOKEN` | the token |
| `GHL_LOCATION_ID` | the Location ID |
| `GHL_ROUND_ROBIN_USER_IDS` | the owner's User ID |
| `GHL_WEBHOOK_SECRET` | any random 24+ character string |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | WhatsApp number, digits with country code, e.g. `YOUR_WHATSAPP_NUMBER` |

### A7. What the code creates in GHL (do not rename these)
**Custom fields** (created automatically on the first quote; find them under Settings, Custom Fields):
`RFQ ID`, `RFQ Patch Type`, `RFQ Quantity`, `RFQ Width`, `RFQ Height`, `RFQ Backing`, `RFQ Deadline`,
`RFQ Preferred Contact Method`, `RFQ Project Notes`, `RFQ Artwork URL`, `RFQ Quote PDF URL`, `RFQ Landing Page`,
`RFQ UTM Source`, `RFQ UTM Medium`, `RFQ UTM Campaign`, `RFQ UTM Content`, `RFQ FBCLID`, `RFQ Meta Campaign ID`,
`RFQ Meta Ad Set ID`, `RFQ Meta Ad ID`, `RFQ Submitted At`, `RFQ Lead Score`, `RFQ Lead Grade`,
`RFQ WhatsApp Verified`, `RFQ Verify Code`, `RFQ WhatsApp Link`, `RFQ Summary`.

In messages, insert them with the **merge field picker** (the `{}` icon, Contact, Custom Fields). GHL turns
`RFQ Artwork URL` into a key like `{{contact.rfq_artwork_url}}`; always pick from the list rather than typing.

**Tags**: `NEW RFQ` (every request), `REPEAT RFQ` (customer asked before), `HIGH INTENT RFQ`, `ARTWORK UPLOADED`,
`NO ARTWORK`, `250 PLUS`, `500 PLUS`, `1000 PLUS`, `RUSH ORDER`, `WHATSAPP NOT VERIFIED`, `WHATSAPP VERIFIED`.

**Opportunity**: in `Billys Custom Patches Sales Pipeline`, stage `New RFQ`, named
`{First} {Last} | {Quantity} {Type} | Artwork Uploaded` (or `No Artwork`), assigned to the owner.

**Note** on the contact with the full specification, artwork links, PDF link and ad source.

**Email** to the customer from the GHL conversation with the quote PDF attached.

---

## Part B. Workflows

Create each one in Automation, **Workflows**, Create Workflow, **Start from scratch**. Name them exactly as below
so they sort together. After building each one: Settings (gear at the top of the workflow) as noted, then **Save** and switch to **Publish**.

Several workflows use the trigger **Opportunity Created** with filter **In pipeline: Billys Custom Patches Sales Pipeline**.
The funnel creates a new opportunity for every request (including repeat customers), so this fires once per quote.

### RFQ 1, WhatsApp verify (required)
Passes the customer's WhatsApp message to the funnel, which verifies the number and replies with the PDF.
1. Trigger: **Customer Replied**. Filter: **Reply channel is WhatsApp**.
2. Action: **Webhook** (Custom Webhook).
   - Method: POST
   - URL: `https://quote.billyscustompatches.com/api/whatsapp/inbound?secret=<your GHL_WEBHOOK_SECRET>`
   - Custom data:
     - `phone` = `{{contact.phone}}`
     - `message` = `{{message.body}}`
     - `contact_id` = `{{contact.id}}`
3. Settings: **Allow re-entry ON**.

### RFQ 2, New lead alert to owner (required)
1. Trigger: **Opportunity Created**, filter In pipeline `Billys Custom Patches Sales Pipeline`.
2. Action: **Internal Notification**, type **App notification**, user: owner.
   - Title: `New quote: {{contact.first_name}} {{contact.last_name}}`
   - Body: insert `RFQ Summary`
3. Action: **Internal Notification**, type **Email**, to: owner.
   - Subject: `New quote: {{contact.first_name}} {{contact.last_name}}, {{contact.rfq_quantity}} {{contact.rfq_patch_type}}` (pick the fields from the picker)
   - Body (use the editor's button or link tools for the four links):
     ```
     NEW QUOTE REQUEST
     {{RFQ Summary}}

     OPEN LEAD: (link to the contact, use "Contact link" from the picker if offered, otherwise your GHL contacts page)
     CALL: tel:{{contact.phone}}
     WHATSAPP: {{RFQ WhatsApp Link}}
     VIEW ARTWORK: {{RFQ Artwork URL}}
     QUOTE PDF: {{RFQ Quote PDF URL}}

     Notes: {{RFQ Project Notes}}
     Email: {{contact.email}}  Business: {{contact.company_name}}
     Source: {{RFQ UTM Source}} / {{RFQ UTM Campaign}}
     ```
4. Optional, only after A2P approval: **Internal Notification**, type **SMS** to the owner's phone with
   `New quote {{contact.first_name}}: {{RFQ Summary}} WhatsApp: {{RFQ WhatsApp Link}}`.
5. Settings: Allow re-entry ON.

### RFQ 3, Speed to lead reminders (required)
Nags the owner at 2, 5 and 15 minutes until the card is moved out of New RFQ.
1. Trigger: **Opportunity Created**, filter In pipeline `Billys Custom Patches Sales Pipeline`.
2. **Wait** 2 minutes.
3. **If/Else**: Opportunity, Pipeline stage **is** `New RFQ`.
   - Yes: **Internal Notification** (App) to owner: `2 min: {{contact.first_name}} is waiting. WhatsApp now: {{RFQ WhatsApp Link}}`
   - No: End.
4. **Wait** 3 minutes, same If/Else, notification `5 min: {{contact.first_name}} has not been contacted.`
5. **Wait** 10 minutes, same If/Else, notification (App and Email) `15 min: {{contact.first_name}} still waiting. Leads go cold fast.`
6. Settings: Allow re-entry ON.

### RFQ 4, WhatsApp verify nudge to customer (recommended)
For customers who did not tap Verify on WhatsApp.
1. Trigger: **Opportunity Created**, filter In pipeline `Billys Custom Patches Sales Pipeline`.
2. **Wait** 10 minutes.
3. **If/Else**: Contact tags **include** `WHATSAPP VERIFIED`. Yes: End.
4. No branch:
   - **Send WhatsApp** using template `rfq_verify_nudge` (Part C). Map {{1}} to first name and {{2}} to `RFQ Verify Code`.
   - **Send Email**: subject `{{contact.first_name}}, where should we send your free mockup?`, body:
     ```
     Hi {{contact.first_name}}, we are working on your {{RFQ Quantity}} {{RFQ Patch Type}} patches
     (quote {{RFQ Verify Code}}). The fastest way to get your price and mockup is WhatsApp:
     https://wa.me/YOUR_WHATSAPP_NUMBER?text=Hi%20Custom%20Patch%20Lab%2C%20my%20quote%20code%20is%20{{RFQ Verify Code}}
     Prefer email? Just reply here.
     ```
     (replace YOUR_WHATSAPP_NUMBER with your WhatsApp number)
5. Settings: **Stop on response ON**, Allow re-entry ON.

When the customer replies to the template, workflow RFQ 1 runs, verifies them and sends the PDF.

### RFQ 5, Follow ups after the quote (required)
Starts when the owner moves the card to Quoted; stops by itself as soon as the customer replies.
1. Trigger: **Pipeline Stage Changed**, pipeline `Billys Custom Patches Sales Pipeline`, stage `Quoted`.
2. **Wait** 1 day. **Send WhatsApp** template `rfq_followup_1` (Part C). **Send Email**: `Any questions about your patch quote?`
3. **Wait** 2 days. **Send WhatsApp** template `rfq_followup_2`. **Send Email**: `Want us to adjust anything on your mockup?`
4. **Wait** 4 days. **Send Email**: `Should we keep your quote open?` Then **Internal Notification** to owner: `{{contact.first_name}} has not replied in 7 days. Call or move to Lost.`
5. Settings: **Stop on response ON**, Allow re-entry ON.

Optional: duplicate this as **RFQ 5b, Follow ups after mockup** with trigger stage `Mockup Sent`.

### RFQ 6, Won: thank you and review request (recommended)
1. Trigger: **Pipeline Stage Changed**, stage `Won`.
2. **Wait** 10 days (after delivery).
3. **Send WhatsApp** template `rfq_review` and **Send Email** with the Trustpilot link `https://www.trustpilot.com/review/billyscustompatches.com`.
4. Settings: Stop on response ON.

### Notifications for customer replies
Settings, **My Profile** (or the LeadConnector app settings), Notifications: turn on push notifications for
**new inbound messages** on WhatsApp, SMS and email, so every customer reply reaches the owner's phone.

---

## Part C. WhatsApp templates (Settings, WhatsApp, Templates)
Messages we send first, or more than 24 hours after the customer's last message, must use an approved template.
Category **Utility**, language English (US).

| Name | Body |
|---|---|
| `rfq_verify_nudge` | `Hi {{1}}, this is Billys Custom Patches. We received your patch quote request {{2}}. Reply YES here to get your free mockup and price on WhatsApp.` |
| `rfq_followup_1` | `Hi {{1}}, just checking in on your Billys Custom Patches quote. Any questions about the price or the mockup? Reply here and we will help.` |
| `rfq_followup_2` | `Hi {{1}}, would you like any changes to your patch mockup? Revisions are free. Reply here and we will update it.` |
| `rfq_review` | `Hi {{1}}, thanks for ordering with Billys Custom Patches! If you love your patches, a quick review helps our small team a lot: https://www.trustpilot.com/review/billyscustompatches.com` |

The instant reply after the customer verifies (welcome text plus the PDF) is sent by the funnel code inside the
24 hour window, so it needs no template. Its text is in `lib/whatsapp.ts`.

---

## Part D. Check it works
1. Submit a test quote on the live page with your own phone number.
2. Within a minute: contact, tags, note, custom fields and an opportunity in `New RFQ` appear in GHL; the
   PDF email shows in the contact's conversation; workflow RFQ 2 notifies the owner.
3. Tap **Verify on WhatsApp** on the thank you page and press Send: the WhatsApp reply with the PDF arrives,
   the tag changes to `WHATSAPP VERIFIED`.
4. Leave the card in `New RFQ`: reminders at 2, 5 and 15 minutes. Move it to `Contacted`: reminders stop.
5. Move it to `Quoted` and reply from the customer phone: follow ups stop.

If a quote does not reach GHL (wrong token, missing pipeline), it is still saved in Supabase, the owner gets an
email alert (when Resend is configured) and the funnel retries automatically. Leads are always visible at
`https://quote.billyscustompatches.com/admin`.
