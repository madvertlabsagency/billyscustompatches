# Go live: quote.billyscustompatches.com (Vercel + Supabase + GoHighLevel)

The page and its server code run on **Vercel**. Leads are saved first in **Supabase**, then synced to **GoHighLevel**,
where the owner handles WhatsApp, notifications, the pipeline and follow ups. The domain stays where it is;
you only add one DNS record in Hostinger. Total: about 1 to 2 hours.

Never paste keys or tokens into chat or email. Put them only in Vercel, Settings, Environment Variables.

## Step 1. Supabase (10 minutes)
1. supabase.com, sign up, **New project**. Name `custom-patch-lab`, region **East US**, save the database password somewhere safe.
2. Left menu, **SQL Editor**, New query, paste the whole file `supabase/schema.sql`, **Run**. It should say Success.
3. Left menu, **Project Settings**, **API** (or Data API / API Keys): copy
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **service_role** secret key → `SUPABASE_SERVICE_ROLE_KEY`

## Step 2. GoHighLevel (30 to 45 minutes)
Do `docs/GHL-WORKFLOWS.md` **Part A** now: owner user and app, pipeline with the exact names, WhatsApp, email
domain and the Private Integration token. Keep the token, Location ID and owner User ID ready for step 4.

## Step 3. Meta Conversions API token (5 minutes)
Events Manager, dataset **Customers** (`YOUR_PIXEL_ID`), Settings, Conversions API, **Generate access token**.
Copy it → `META_CAPI_ACCESS_TOKEN`.

## Step 4. Vercel (15 minutes)
1. vercel.com, sign up with GitHub, **Add New, Project**, import `agencyescom/html-starter`.
2. **Root Directory**: `markhor-funnel`. Framework preset: Next.js.
3. Open **Environment Variables** before the first deploy and add:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://quote.billyscustompatches.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | from step 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | from step 1 |
| `ARTWORK_LINK_SECRET` | a random string of 40+ characters (see below) |
| `CRON_SECRET` | another random string of 40+ characters |
| `ADMIN_PASSWORD` | the owner's password for /admin, 12+ characters |
| `CRM_PROVIDER` | `ghl` |
| `WHATSAPP_PROVIDER` | `ghl` |
| `CUSTOMER_EMAIL_PROVIDER` | `ghl` |
| `GHL_PRIVATE_INTEGRATION_TOKEN` | from step 2 |
| `GHL_LOCATION_ID` | from step 2 |
| `GHL_ROUND_ROBIN_USER_IDS` | the owner's GHL User ID |
| `GHL_WEBHOOK_SECRET` | another random string of 24+ characters |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | the WhatsApp number connected in GHL, digits with country code, e.g. `YOUR_WHATSAPP_NUMBER` |
| `NEXT_PUBLIC_META_PIXEL_ID` | `YOUR_PIXEL_ID` |
| `META_CAPI_ACCESS_TOKEN` | from step 3 |

   Random strings: use any password generator (for example 1Password or Bitwarden, length 40, letters and numbers only).

   Optional, can be added later: `META_TEST_EVENT_CODE` (testing only), `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and
   `TURNSTILE_SECRET_KEY` (spam protection), `RESEND_API_KEY` and `ADMIN_ALERT_EMAILS` (owner alert email if GHL is down),
   `NEXT_PUBLIC_PRODUCTION_TIME` and `NEXT_PUBLIC_SHIPPING_TIME` (FAQ), `NEXT_PUBLIC_TRUSTPILOT_BUSINESSUNIT_ID`.

4. **Deploy**. When it finishes, open the `...vercel.app` link and check the page.
5. If the code is on a branch other than `main`: Settings, Git, **Production Branch**, set it to that branch and redeploy.

Plan: the Hobby (free) plan works for testing. Vercel's terms require **Pro** ($20 per month) for a commercial site, so upgrade before running ads.

## Step 5. Domain (5 minutes plus DNS time)
1. Vercel project, Settings, **Domains**, add `quote.billyscustompatches.com`. Vercel shows the record to add (normally CNAME `cname.vercel-dns.com`).
2. In the domain's DNS panel (Hostinger): **Add record**, Type `CNAME`, Name `quote`, Target `cname.vercel-dns.com`, TTL default.
3. Wait 5 to 30 minutes until Vercel shows **Valid Configuration**. SSL is automatic. The main website is not affected.

## Step 6. Automatic retries every 5 minutes (5 minutes)
Vercel runs the retry job once a day as a backup. For a 5 minute retry on any plan:
1. cron-job.org, free account, **Create cronjob**.
2. URL `https://quote.billyscustompatches.com/api/cron/retry`, schedule **every 5 minutes**.
3. Advanced, **Headers**: name `Authorization`, value `Bearer <your CRON_SECRET>`.
4. Save, then **Test run**: the response should be JSON starting with `{"processed":`.

## Step 7. GHL workflows (30 to 45 minutes)
Build `docs/GHL-WORKFLOWS.md` **Part B** (workflows RFQ 1 to RFQ 6) and submit the **Part C** WhatsApp templates.
Workflow RFQ 1 needs the live URL with your `GHL_WEBHOOK_SECRET`.

## Step 8. Test, then launch
Follow `TEST-CHECKLIST.md` with a Meta test event code. Then remove `META_TEST_EVENT_CODE`, redeploy, and add
these URL parameters to every Meta ad (Ads Manager, ad, Tracking, URL parameters):

```
utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}
```

Ad destination URL: `https://quote.billyscustompatches.com/`

Owner's lead backup view: `https://quote.billyscustompatches.com/admin` (password from step 4).

Funnel Health dashboard: `https://quote.billyscustompatches.com/admin/funnel`. Setup (Meta system user token, re-running the schema) is in `docs/FUNNEL-ANALYTICS.md`.
