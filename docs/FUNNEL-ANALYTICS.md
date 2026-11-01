# Funnel analytics and the Funnel Health dashboard

Live view of where people drop off between the Meta ad and a qualified quote request, at
`https://quote.billyscustompatches.com/admin/funnel` (same password as `/admin`).

```
Impressions → Link clicks → Landing page views (Meta) → Sessions → Engaged → Quote started
→ Step 1 … Step 7 → Submitted RFQ → Qualified RFQ
```

The first three stages come from the Meta Marketing API. Everything from Sessions onward comes
from our own first party tracking on the landing page.

---

## 1. Setup

### 1.1 Database
Run the whole `supabase/schema.sql` again in the Supabase SQL editor (safe to re-run). It adds:

| Table | Purpose |
|---|---|
| `funnel_events` | One row per tracked event. RLS on with no policies: the public key can neither read nor insert. Only the server route `/api/fe` writes, with the service role. Indexes on `created_at`, `event`, `utm_campaign` and `session_id`. |
| `meta_insights_cache` | Meta API responses, reused for 10 minutes. |

Thresholds are stored in the existing `app_state` table under the key `funnel_settings`.

Columns of `funnel_events`: `id, session_id, visitor_id, event, step, meta (jsonb), utm_source,
utm_medium, utm_campaign, utm_content, fbclid, campaign_id, adset_id, ad_id, device (mobile, tablet,
desktop), referrer, created_at`.

### 1.2 Vercel environment variables

| Variable | Value | Notes |
|---|---|---|
| `META_SYSTEM_USER_TOKEN` | system user token | Business Settings, System users, Generate token, permission `ads_read`, assign the ad account. Server only. |
| `META_AD_ACCOUNT_ID` | `YOUR_AD_ACCOUNT_ID` | Without `act_`. |
| `META_GRAPH_VERSION` | e.g. `v24.0` | Set to the latest stable Graph API version shown in Meta's changelog. |
| `FUNNEL_TIMEZONE` | `America/New_York` | Date ranges and hour of day. Should match the ad account time zone. |
| `FUNNEL_CAMPAIGN_FILTER` | `Leadlink` | Default campaign name filter. |
| `NEXT_PUBLIC_ENGAGED_SECONDS` | `10` | When the browser sends the time based `engaged` event. |

Redeploy after adding them. Without `META_SYSTEM_USER_TOKEN` the dashboard still works and simply
hides impressions, clicks and costs.

### 1.3 URL parameters for every Meta ad
Ads Manager, ad, Tracking, URL parameters. Paste exactly:

```
utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}
```

Meta adds `fbclid` by itself. The older `cpl_cid`, `cpl_asid` and `cpl_aid` parameters still work,
so ads that are already running keep their attribution.

---

## 2. Tracking

`lib/funnel-client.ts` keeps a small queue in memory and sends batches to `/api/fe` every 4
seconds, when 20 events are waiting, and with `navigator.sendBeacon` when the tab is hidden or
closed. It never blocks rendering and swallows every error.

* `session_id`: random, in `sessionStorage` (one per tab visit).
* `visitor_id`: random, in `localStorage` (returning visitors).
* Attribution (UTM, fbclid, campaign, ad set and ad IDs, device, referrer host) is read once from
  the landing URL and kept for the session.

`/api/fe` validates every batch (known events only, at most 50 per batch, meta at most 2 KB),
rate limits to 300 batches per IP per 10 minutes, drops bots (headless browsers, crawlers, Meta's
link preview) and uses the server clock for `created_at`.

`rfq_submit` and `rfq_qualified` are written by `/api/rfq` on the server after the quote is
saved, so they are counted even if the browser closes right away. The browser cannot send them.

### Events

| Event | When | Step | Meta |
|---|---|---|---|
| `page_view` | Landing page opens | | path |
| `page_load` | Largest Contentful Paint is known (or the tab hides first) | | `lcp`, `fcp`, `ttfb` in ms |
| `engaged` | First of: 10 seconds on page, scroll past 50%, any click | | `reason`, `seconds` |
| `scroll_25` `scroll_50` `scroll_75` `scroll_100` | Scroll depth reached, once each | | |
| `cta_click` | Any element with `data-cta` | | `cta`: header_quote, header_phone, hero_quote, hero_upload, reel_mockup, final_quote, mobile_sticky |
| `patch_type_card_click` | "Get a quote for this style" on a patch card | | `patch_type` |
| `rfq_start` | First answer in the form | | |
| `rfq_step_view` | Step shown. Step 1 when the form card scrolls into view | 1 to 7 | |
| `rfq_step_complete` | Step passed validation | 1 to 7 | `ms` on the step, plus the answer for steps 1, 2, 4, 5, 6 |
| `artwork_upload_success` / `artwork_upload_fail` | Upload finished or failed (including wrong type or too large) | 5 | `ext`, `size`, `error` |
| `validation_error` | Continue or Submit blocked | step | `field` |
| `rfq_submit` | Quote saved (server) | | `rfq_id`, `grade`, `score`, `patch_type`, `quantity` |
| `rfq_qualified` | Saved quote graded High or Very high (server) | | same |
| `page_exit` | Tab hidden or closed | last step | `seconds`, `max_scroll`, `clicked`, `last_step` |

To track a new button, add `data-cta="name"` to it. No other code is needed.

---

## 3. Metrics

All metrics are computed per session (`lib/funnel/sessions.ts`, `lib/funnel/metrics.ts`).

| Metric | Definition |
|---|---|
| Session | A `session_id` with a `page_view` in the range. |
| Engaged session | Any click or form action, a scroll past 50%, or time on page at least `Engaged after (seconds)`. Time on page is the largest of the `page_exit` seconds, the `engaged` seconds and the gap between the first and last event. |
| Bounce | A session with a page view and no engagement. Bounce rate = bounces ÷ sessions. Change the seconds threshold in the dashboard settings; it applies to past data too. |
| Quote started | `rfq_start`, any step completed, or any step after 1 viewed. |
| Step N reached | Started sessions whose furthest step is at least N. Step 1 = Quote started. Counts never go up from one step to the next. |
| Saw the form | Sessions where the quote card scrolled into view (shown above the step chart). |
| Submitted RFQ | Sessions with `rfq_submit`. |
| Qualified RFQ | Sessions with `rfq_qualified` (grade High or Very high from `lib/scoring.ts`). |
| Moved on | Count of a stage ÷ count of the stage above it. |
| Cost per stage | Meta spend ÷ stage count. For Impressions it is CPM (spend ÷ impressions × 1000). |
| CTR (link) | Link clicks (`inline_link_clicks`) ÷ impressions. |
| Click to landing page view | Meta landing page views (`landing_page_view` action) ÷ link clicks. |
| Visit to quote start | Quote started ÷ sessions (our landing page views). |
| Quote start to submit | Submitted ÷ quote started. |
| Cost per landing page view, per RFQ, per qualified RFQ | Spend ÷ Meta landing page views, ÷ submitted, ÷ qualified. |
| Step lost % | 1 − (next step reached ÷ this step reached). Step 7 is compared with Submitted. |
| Median time on step | Median of `ms` from `rfq_step_complete` for that step. |
| LCP median and 75th percentile | From `page_load` per session, mobile (phones and tablets) and desktop. Red above the LCP good threshold (2.5 s). |
| Previous period | The same length right before the range. For Today it is yesterday up to the same time of day; Meta numbers for it are the whole of yesterday because Meta reports by day. |

### Which sessions are counted
* Default ("Leadlink" campaigns only): sessions whose `campaign_id` belongs to a Meta campaign with
  "Leadlink" in its name, or whose `utm_campaign` contains "Leadlink". Meta numbers use the same
  filter (`campaign.name CONTAIN Leadlink`).
* "All traffic and campaigns": every session and every campaign, including organic and direct.
* Campaign, ad set and ad filters narrow both our sessions and the Meta rows.

### Meta numbers
`lib/meta-ads.ts` calls `GET /act_{id}/insights` twice per range: `level=ad` with spend,
impressions, reach, frequency, inline_link_clicks and actions, and `level=account` for de-duplicated
reach and frequency. Campaign and ad set numbers are added up from the ad rows. Responses are
cached for 10 minutes in `meta_insights_cache`; if Meta fails, the last cached numbers are shown with
a note. Meta "leads" are `offsite_conversion.fb_pixel_lead`.

---

## 4. Rate cards and benchmarks

Each card shows the value, a status (Good, Watch, Poor, or Low data when the sample is under the
minimum), the change against the previous period and the benchmark.

| Card | Good | Poor | Sample needed |
|---|---|---|---|
| CTR (link) | above 1.5% | below 0.8% | 100 impressions |
| Click to landing page view | above 80% | below 65% | 30 link clicks |
| Bounce rate | below 45% | above 65% | 20 sessions |
| Visit to quote start | above 35% | below 20% | 20 sessions |
| Quote start to submit | above 40% | below 25% | 15 starts |
| Cost per landing page view | below $1.00 | above $2.50 | 30 link clicks |
| Cost per RFQ | below $30 | above $75 | 15 starts |
| Cost per qualified RFQ | below $60 | above $150 | 15 starts |

The cost benchmarks are starting points. Set them to your real margins in the dashboard under
Thresholds and benchmarks.

---

## 5. Insight rules

Rules live in `lib/funnel/insights.ts`. Each one first checks its minimum sample; if it is not met the
rule appears under "Not enough data yet" with how much data it has. Fired insights are sorted
critical, warning, good.

| Rule id | Fires when | Severity | Sample |
|---|---|---|---|
| `ctr_low` | CTR below good | critical below poor, else warning | impressions ≥ `minImpressions` (100) |
| `click_to_lpv_low` | Click to LPV below good | same | link clicks ≥ `minClicks` (30) |
| `bounce_high` | Bounce above good | critical above poor | sessions ≥ `minSessions` (20) |
| `visit_to_start_low` | Visit to quote start below good | critical below poor | sessions ≥ 20 |
| `start_to_submit_low` | Start to submit below good | critical below poor | starts ≥ `minStarts` (15) |
| `step_drop` | A step loses more than `stepDropPct` (35%) or more than `stepDropMultiple` (2) × the average step loss. Names the step, its top validation errors and median time, with step specific advice | critical when loss > 1.5 × the limit | visitors on the step ≥ `minStepReach` (20) |
| `upload_fail` | Upload failures above `uploadFailPct` (5%). Names each failing file type with counts | critical above 3 × the limit | attempts ≥ `minUploads` (10) |
| `lcp_slow` | Mobile LCP 75th percentile above `lcpGoodMs` (2.5 s) | critical above `lcpPoorMs` (4 s) | mobile samples ≥ `minLcpSamples` (20) |
| `ad_cost_outlier` | An ad with spend ≥ `minAdSpend` ($20) has cost per RFQ above `adCostMultiple` (2) × the best ad, or spent that much with no RFQ. Suggests pausing it | warning | at least 2 ads with enough spend and one RFQ |
| `ad_winner` | The cheapest ad (≥ `minWinnerRfqs` RFQs) costs at most `winnerShareOfAvg` (50%) of the other ads combined. Suggests moving budget | good | as above |
| `fatigue` | Frequency above `frequencyMax` (2.5) and CPM up more than `cpmRisePct` (10%) versus the previous period | warning | impressions ≥ `minFrequencyImpressions` (1,000) |
| `improvements` | A step completion rate, quote completion, or cost per RFQ improved by `improvePct` (15%) or more versus the previous period | good | each side meets its own minimum |

Every threshold above is editable on the dashboard (Thresholds and benchmarks) and saved in
`app_state.funnel_settings`. Defaults are in `lib/funnel/settings.ts`.

### Adding a rule
1. If it needs a new threshold, add it to `DEFAULT_SETTINGS` and `SETTING_FIELDS` in
   `lib/funnel/settings.ts`. It appears in the settings form automatically.
2. Add an entry to `RULES` in `lib/funnel/insights.ts`:
   ```ts
   {
     id: 'my_rule',
     title: 'Short title shown while waiting for data',
     run: (c) => {
       if (c.counts.sessions < c.s.minSessions) return { needed: `${c.counts.sessions} of ${c.s.minSessions} sessions` };
       if (/* condition is fine */) return [];
       return [{ id: 'my_rule', severity: 'warning', title: '...', evidence: 'Real numbers ...', meaning: '...', actions: ['...', '...'] }];
     },
   },
   ```
   For a simple "rate below or above a benchmark" rule, use the `rateRule({...})` helper.
   The context `c` has the settings, Meta sums for this and the previous period, counts for both
   periods, bounce rates, step rows, page speed, the ad table and upload results.
3. Add tests in `tests/funnel.test.ts`: one case that fires, one that does not, one with too little
   data. Copy must not use long dashes; a test checks this.

---

## 6. Dashboard

`/admin/funnel` (server page, admin login required) loads data from `/api/admin/funnel`, which also
checks the admin cookie. The Meta token and the Supabase service key never reach the browser.

* Refreshes every 60 seconds and shows "Updated X seconds ago". Filters are kept in the address bar.
* Date range: Today, Yesterday, Last 7 days, Custom. Campaign, ad set and ad filters.
* Funnel bars (Meta bars and our bars use separate scales), key rate cards, Insights, step by step
  chart with lost %, median time and top errors, page speed, breakdowns (by ad, device, hour of day,
  patch type, quantity) and the last 20 sessions.
* **Demo data** button: generated traffic from `lib/funnel/demo.ts` with a yellow DEMO MODE banner on
  every view. It never touches the database and is the same for a given range, so it can be used to
  check the layout before real traffic arrives.

## 7. Files

| File | Role |
|---|---|
| `lib/funnel-client.ts`, `app/components/FunnelTracker.tsx` | Browser tracking |
| `app/api/fe/route.ts`, `lib/funnel/server.ts` | Event ingest and server side submit events |
| `lib/meta-ads.ts`, `lib/funnel/meta-types.ts` | Meta Marketing API and cache |
| `lib/funnel/sessions.ts`, `metrics.ts`, `report.ts`, `range.ts` | Funnel math |
| `lib/funnel/insights.ts`, `settings.ts` | Rules and thresholds |
| `lib/funnel/demo.ts` | Demo data |
| `lib/funnel/load.ts`, `app/api/admin/funnel/route.ts`, `app/admin/funnel/*` | Dashboard |
| `tests/funnel.test.ts` | Unit tests for bounce, funnel math, ranges and every rule |
