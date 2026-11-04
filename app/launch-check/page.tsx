import type { Metadata } from 'next';
import { db } from '@/lib/supabase';
import { env } from '@/lib/env';
import { Ghl } from '@/lib/ghl';

export const metadata: Metadata = { title: 'Launch check | Billys Custom Patches', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

// Shows which pieces of the funnel are set up, as yes or no only. No key or password is ever shown.
type Row = { area: string; item: string; ok: boolean | null; note: string; fix: string };

const set = (name: string) => !!(process.env[name] || '').trim();

async function tryDb(fn: () => PromiseLike<{ error: { message: string } | null }>): Promise<[boolean, string]> {
  try {
    const { error } = await fn();
    return error ? [false, error.message.slice(0, 120)] : [true, ''];
  } catch (e) {
    return [false, String(e).slice(0, 120)];
  }
}

async function resendDomain(): Promise<[boolean | null, string]> {
  const key = env.resendKey();
  if (!key) return [false, 'RESEND_API_KEY is not set'];
  try {
    const res = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' });
    if (!res.ok) return [false, `Resend answered ${res.status}`];
    const data = (await res.json()) as { data?: { name: string; status: string }[] };
    const from = (env.fromEmail().match(/@([^>\s]+)/) || [])[1] || '';
    const d = data.data?.find((x) => x.name === from);
    if (!d) return [false, `${from} is not added in Resend`];
    return [d.status === 'verified', `${from}: ${d.status}`];
  } catch (e) {
    return [null, String(e).slice(0, 120)];
  }
}

async function ghlCheck(): Promise<[boolean, string]> {
  if (!env.ghlToken() || !env.ghlLocationId()) return [false, `${env.ghlToken() ? '' : 'GHL_PRIVATE_INTEGRATION_TOKEN missing. '}${env.ghlLocationId() ? '' : 'GHL_LOCATION_ID missing.'}`];
  try {
    await new Ghl(env.ghlToken(), env.ghlLocationId(), env.ghlBase()).findPipeline(env.ghlPipelineName(), env.ghlStageName());
    return [true, `Pipeline "${env.ghlPipelineName()}", stage "${env.ghlStageName()}"`];
  } catch (e) {
    return [false, (e instanceof Error ? e.message : String(e)).slice(0, 160)];
  }
}

export default async function LaunchCheck() {
  const supa = set('NEXT_PUBLIC_SUPABASE_URL') || set('SUPABASE_URL');
  const key = set('SUPABASE_SERVICE_ROLE_KEY');
  const can = supa && key;
  const [leads, leadsMsg] = can ? await tryDb(() => db().from('quote_requests').select('id').limit(1)) : [false, 'Supabase is not connected'];
  const [events, eventsMsg] = can ? await tryDb(() => db().from('funnel_events').select('id').limit(1)) : [false, 'Supabase is not connected'];
  const [limits, limitsMsg] = can ? await tryDb(() => db().rpc('hit_rate_limit', { p_key: 'launch-check', p_limit: 1000, p_window_seconds: 60 })) : [false, 'Supabase is not connected'];
  let bucket = false;
  let bucketMsg = 'Supabase is not connected';
  if (can) {
    try {
      const { data, error } = await db().storage.getBucket(env.artworkBucket());
      bucket = !!data && !error;
      bucketMsg = error ? error.message.slice(0, 120) : '';
    } catch (e) {
      bucketMsg = String(e).slice(0, 120);
    }
  }
  const [mail, mailMsg] = await resendDomain();
  const ghlOn = env.crmProvider() === 'ghl';
  const [ghl, ghlMsg] = ghlOn ? await ghlCheck() : [false, 'Off: leads stay in Supabase and /admin only'];
  const schema = 'Supabase > SQL Editor: paste epcf-funnel/supabase/schema.sql and Run';

  const rows: Row[] = [
    { area: 'Database', item: 'Supabase connected', ok: can, note: can ? '' : `${supa ? '' : 'NEXT_PUBLIC_SUPABASE_URL missing. '}${key ? '' : 'SUPABASE_SERVICE_ROLE_KEY missing.'}`, fix: 'Vercel > Integrations > Supabase, or add both variables' },
    { area: 'Database', item: 'Leads table (quote_requests)', ok: leads, note: leadsMsg, fix: schema },
    { area: 'Database', item: 'Funnel analytics table', ok: events, note: eventsMsg, fix: schema },
    { area: 'Database', item: 'Spam rate limit function', ok: limits, note: limitsMsg, fix: schema },
    { area: 'Database', item: `Artwork upload bucket (${env.artworkBucket()})`, ok: bucket, note: bucketMsg, fix: schema },
    { area: 'Security', item: 'ARTWORK_LINK_SECRET', ok: set('ARTWORK_LINK_SECRET'), note: '', fix: 'Any random 40 character string' },
    { area: 'Security', item: 'ADMIN_PASSWORD (for /admin)', ok: set('ADMIN_PASSWORD'), note: '', fix: '12+ character password' },
    { area: 'Security', item: 'CRON_SECRET (retries failed emails)', ok: set('CRON_SECRET'), note: '', fix: 'Any random string' },
    { area: 'Security', item: 'Turnstile spam check', ok: set('NEXT_PUBLIC_TURNSTILE_SITE_KEY') && set('TURNSTILE_SECRET_KEY'), note: 'Optional but recommended for ads', fix: 'Cloudflare Turnstile site key and secret' },
    { area: 'Emails', item: 'Alert emails go to', ok: env.alertEmails().length > 0, note: env.alertEmails().length ? `${env.alertEmails().length} address(es)` : '', fix: 'ADMIN_ALERT_EMAILS' },
    { area: 'CRM', item: 'GoHighLevel (CRM_PROVIDER=ghl)', ok: ghlOn, note: ghlOn ? 'On' : 'Off: leads stay in Supabase and /admin only', fix: 'Set CRM_PROVIDER=ghl to send every lead to GHL' },
    ...(ghlOn ? [{ area: 'CRM', item: 'GHL connection and pipeline', ok: ghl, note: ghlMsg, fix: 'GHL_PRIVATE_INTEGRATION_TOKEN, GHL_LOCATION_ID, and the pipeline and stage in GHL (docs/GHL-WORKFLOWS.md)' }] : []),
    { area: 'Emails', item: 'Resend: sending domain verified', ok: mail, note: ghlOn ? `${mailMsg}. Optional with GHL: customer emails go from GHL; Resend only adds the owner alert email` : mailMsg, fix: 'resend.com > Domains > add and verify your domain, then RESEND_API_KEY' },
    {
      area: 'WhatsApp',
      item: 'WhatsApp auto reply',
      ok: env.whatsappProvider() === 'ghl' ? !!(env.ghlToken() && env.ghlLocationId()) : !!(env.waPhoneNumberId() && env.waAccessToken() && env.waAppSecret() && env.waVerifyToken()),
      note: env.whatsappProvider() === 'ghl' ? 'Through GHL' : 'Through the WhatsApp Cloud API. Without it, Verify on WhatsApp still opens the chat, but nothing replies automatically',
      fix: 'WHATSAPP_PROVIDER=ghl with the number connected in GHL, or the four WhatsApp Cloud API values',
    },
    { area: 'Tracking', item: 'Meta Pixel', ok: !!env.pixelId(), note: env.pixelId(), fix: '' },
    { area: 'Tracking', item: 'Conversions API token', ok: set('META_CAPI_ACCESS_TOKEN'), note: 'Recommended: catches events blocked in the browser', fix: 'Events Manager > Settings > Generate access token, then META_CAPI_ACCESS_TOKEN' },
    { area: 'Tracking', item: 'Test event code is off', ok: !set('META_TEST_EVENT_CODE'), note: set('META_TEST_EVENT_CODE') ? 'Remove META_TEST_EVENT_CODE before going live' : '', fix: 'Delete META_TEST_EVENT_CODE' },
    { area: 'Site', item: 'NEXT_PUBLIC_SITE_URL', ok: set('NEXT_PUBLIC_SITE_URL'), note: process.env.NEXT_PUBLIC_SITE_URL || '', fix: 'The live address, for example https://quote.billyscustompatches.com' },
  ];
  const required = new Set(['Supabase connected', 'Leads table (quote_requests)', 'Funnel analytics table', 'Spam rate limit function', `Artwork upload bucket (${env.artworkBucket()})`, 'ARTWORK_LINK_SECRET', 'Alert emails go to', ...(ghlOn ? ['GHL connection and pipeline'] : ['Resend: sending domain verified'])]);
  const blockers = rows.filter((r) => required.has(r.item) && r.ok !== true).length;

  // The last few leads and how far their GHL sync got (quote code and status only, no personal details).
  type Recent = { verify_code: string; status: string; ghl_contact_id: string | null; ghl_opportunity_id: string | null; last_error: string | null };
  let recent: Recent[] = [];
  if (can) {
    const { data } = await db().from('quote_requests').select('verify_code, status, ghl_contact_id, ghl_opportunity_id, last_error').order('created_at', { ascending: false }).limit(3);
    recent = (data as Recent[] | null) || [];
  }
  // Plain choice settings are shown as typed (they are not secrets), so a stray quote or space shows up.
  const shown = (name: string) => (process.env[name] === undefined ? 'not set' : JSON.stringify(process.env[name]));
  const related = Object.keys(process.env)
    .filter((k) => /GHL|CRM|WHATSAPP|EMAIL_PROVIDER/i.test(k))
    .sort();
  const diag: [string, string][] = [
    ['Vercel project URL', process.env.VERCEL_PROJECT_PRODUCTION_URL || 'unknown'],
    ['Environment', process.env.VERCEL_ENV || 'unknown'],
    ['Deployed commit', `${(process.env.VERCEL_GIT_COMMIT_SHA || 'unknown').slice(0, 7)} ${process.env.VERCEL_GIT_COMMIT_MESSAGE ? '(' + process.env.VERCEL_GIT_COMMIT_MESSAGE.split('\n')[0].slice(0, 80) + ')' : ''}`],
    ['CRM_PROVIDER', shown('CRM_PROVIDER')],
    ['CUSTOMER_EMAIL_PROVIDER', shown('CUSTOMER_EMAIL_PROVIDER')],
    ['WHATSAPP_PROVIDER', shown('WHATSAPP_PROVIDER')],
    ['GHL, CRM and WhatsApp setting names seen', related.length ? related.join(', ') : 'none'],
    ...recent.map((r): [string, string] => [`Lead ${r.verify_code}`, `${r.status}${r.ghl_contact_id ? ', contact in GHL' : ''}${r.ghl_opportunity_id ? ', opportunity in GHL' : ', no opportunity yet'}${r.last_error ? `. Error: ${r.last_error.slice(0, 300)}` : ''}`]),
  ];

  return (
    <main style={{ maxWidth: 920, margin: '0 auto', padding: '32px 16px 64px', fontFamily: 'Arial, sans-serif', color: '#102019' }}>
      <h1 style={{ margin: 0 }}>Launch check</h1>
      <p style={{ fontSize: 18, fontWeight: 700, color: blockers ? '#b42318' : '#0f7a45' }}>
        {blockers ? `${blockers} required item(s) left before going live` : 'Everything required is set. Ready for ads.'}
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #d4a445' }}><th>Area</th><th>Item</th><th>Status</th><th>Details / how to fix</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.item} style={{ borderBottom: '1px solid #eee', verticalAlign: 'top' }}>
              <td style={{ padding: '8px 6px', color: '#56645d' }}>{r.area}</td>
              <td style={{ padding: '8px 6px', fontWeight: 700 }}>{r.item}{required.has(r.item) ? ' *' : ''}</td>
              <td style={{ padding: '8px 6px', fontWeight: 800, color: r.ok ? '#0f7a45' : r.ok === null ? '#9c7420' : '#b42318' }}>{r.ok ? 'OK' : r.ok === null ? 'Unknown' : 'Missing'}</td>
              <td style={{ padding: '8px 6px', color: '#56645d' }}>{[r.note.replace(/\.$/, ''), r.ok ? '' : r.fix].filter(Boolean).join('. ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ color: '#56645d', fontSize: 13 }}>* required. This page shows only yes or no, never a key or password.</p>

      <h2 style={{ marginTop: 36, fontSize: 20 }}>Diagnostics</h2>
      <p style={{ color: '#56645d', fontSize: 13, marginTop: 0 }}>Which Vercel deployment answers this page, and which setting names it can see. Names only, never values.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <tbody>
          {diag.map(([k, v]) => (
            <tr key={k} style={{ borderBottom: '1px solid #eee', verticalAlign: 'top' }}>
              <td style={{ padding: '6px', fontWeight: 700, width: 260 }}>{k}</td>
              <td style={{ padding: '6px', color: '#56645d', wordBreak: 'break-word' }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
