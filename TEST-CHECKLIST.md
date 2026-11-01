# Launch test checklist

RFQ-SPEC.md (with its 12 numbered success conditions) has not been provided yet. This checklist covers
everything the funnel does today; map it to the spec's conditions when the spec arrives.

## Before testing
- Events Manager, dataset **Customers** (YOUR_PIXEL_ID), **Test events**: copy the test code into Vercel
  `META_TEST_EVENT_CODE`, redeploy.
- Test URL (open on a phone):
  `https://quote.billyscustompatches.com/?utm_source=facebook&utm_medium=paid&utm_campaign=launch_test&utm_content=test_ad&fbclid=TEST123&cpl_cid=111&cpl_asid=222&cpl_aid=333`

## 1. Page and form
- [ ] Page loads fast on mobile; fonts, patch images, icons and background patterns show.
- [ ] Tap **Get a quote for this style** on PVC: page scrolls to the form with PVC selected, on step 2.
- [ ] Tap **Continue** without choosing: a message says exactly what to choose.
- [ ] Go to step 5, upload a PNG and a PDF: both show a progress bar and "uploaded".
- [ ] Upload a .docx: rejected with a clear message. Upload a file over 25 MB: rejected.
- [ ] Turn on airplane mode, upload: error with a **Retry** button; turn it off, tap Retry, upload works, nothing else lost.
- [ ] Press **Back** to step 1 and forward again: every answer is still there. Refresh the page: still there.
- [ ] Step 7: wrong email or a 7 digit phone number shows a message naming the field to fix.
- [ ] Submit: thank you page with the summary, including "Artwork received".

## 2. Saved and synced
- [ ] Supabase, table `quote_requests`: the row exists with status `synced` and the UTM values, fbclid and 111/222/333 in `tracking`.
- [ ] GHL contact: all `RFQ ...` custom fields filled, tags `NEW RFQ`, `ARTWORK UPLOADED`, `WHATSAPP NOT VERIFIED` (plus quantity and rush tags as chosen), a note with the full spec.
- [ ] GHL opportunity in `Billys Custom Patches Sales Pipeline`, stage `New RFQ`, name `First Last | Quantity Type | Artwork Uploaded`, assigned to the owner.
- [ ] Artwork link in GHL opens the file; the same link opened after logging out still works (stable link, private file).
- [ ] Submit again with the same email: no second contact; tag `REPEAT RFQ` added; a second opportunity created.

## 3. Customer journey
- [ ] Customer email with the PDF arrives and shows in the GHL conversation.
- [ ] Thank you page, **Verify on WhatsApp**: WhatsApp opens with the code typed; press Send.
- [ ] Within seconds: WhatsApp reply with the welcome text and the PDF; thank you page switches to "WhatsApp verified"; tag `WHATSAPP VERIFIED`.
- [ ] A second test where you do not verify: after 10 minutes the nudge template and email arrive (workflow RFQ 4).

## 4. Owner
- [ ] Owner gets the app notification and email with WhatsApp, Call and artwork links (workflow RFQ 2).
- [ ] Leave the card in New RFQ: reminders at 2, 5 and 15 minutes. Move to Contacted: no more reminders.
- [ ] Move to Quoted, reply from the customer phone: follow ups stop.
- [ ] `/admin`: wrong password refused; correct password shows the lead with artwork and PDF links.

## 5. Tracking
- [ ] Events Manager, Test events: PageView, ViewContent, StartRFQ, PatchTypeSelected, ArtworkUploaded and Lead each appear from **Browser and Server**, marked deduplicated.
- [ ] Lead (server) shows hashed email and phone in the event details.
- [ ] For a large order (500 to 999, artwork, ASAP): QualifiedRFQ appears (server).
- [ ] Remove `META_TEST_EVENT_CODE` and redeploy after testing.

## 6. Failure safety
- [ ] In Vercel, temporarily change `GHL_PRIVATE_INTEGRATION_TOKEN` to a wrong value, redeploy, submit: the thank you page still works, the row is saved with status `failed`, and it shows on /admin.
- [ ] Restore the token, redeploy: within about 5 minutes the cron retry syncs it (status `synced`, contact and opportunity appear once).
- [ ] Submit 7 times quickly from one phone: the 7th is refused with a "wait a few minutes" message.
