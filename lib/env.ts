// Server-only environment access. Never import this from a client component.
import 'server-only';

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}
const opt = (name: string, fallback = '') => (process.env[name] || '').trim() || fallback;
// Choice settings are matched case-insensitively, so 'GHL' and 'ghl ' both work.
const choice = (name: string, fallback = '') => opt(name, fallback).toLowerCase();

export const env = {
  // Public address of the funnel including the base path, e.g. https://madvertlabs.com/billys.
  // NEXT_PUBLIC_SITE_URL may be given with or without the base path.
  siteUrl: () => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
    const url = opt('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000').replace(/\/$/, '');
    return base && !url.endsWith(base) ? url + base : url;
  },
  supabaseUrl: () => req('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseServiceKey: () => req('SUPABASE_SERVICE_ROLE_KEY'),
  artworkBucket: () => opt('SUPABASE_ARTWORK_BUCKET', 'rfq-artwork'),
  maxMb: () => Number(opt('ARTWORK_MAX_MB', '25')) || 25,
  linkSecret: () => req('ARTWORK_LINK_SECRET'),
  // CRM: 'none' keeps everything in Supabase plus the /admin page; 'ghl' also syncs to GoHighLevel.
  crmProvider: () => (choice('CRM_PROVIDER', 'none') === 'ghl' ? 'ghl' : 'none') as 'ghl' | 'none',
  adminPassword: () => opt('ADMIN_PASSWORD'),
  // Customer email: through GHL (shows in the GHL conversation) or Resend. Defaults to GHL when the CRM is GHL.
  customerEmailVia: () => (choice('CUSTOMER_EMAIL_PROVIDER') || (choice('CRM_PROVIDER') === 'ghl' ? 'ghl' : 'resend')) as 'ghl' | 'resend',
  waNudgeTemplate: () => opt('WHATSAPP_NUDGE_TEMPLATE'),
  waTemplateLang: () => opt('WHATSAPP_TEMPLATE_LANG', 'en_US'),
  ghlEmailFrom: () => opt('GHL_EMAIL_FROM'),
  ghlToken: () => opt('GHL_PRIVATE_INTEGRATION_TOKEN'),
  ghlLocationId: () => opt('GHL_LOCATION_ID'),
  ghlBase: () => opt('GHL_API_BASE', 'https://services.leadconnectorhq.com'),
  ghlPipelineName: () => opt('GHL_PIPELINE_NAME', 'Billys Custom Patches Sales Pipeline'),
  ghlStageName: () => opt('GHL_STAGE_NAME', 'New RFQ'),
  ghlUserIds: () => opt('GHL_ROUND_ROBIN_USER_IDS').split(',').map((s) => s.trim()).filter(Boolean),
  ghlWebhookSecret: () => opt('GHL_WEBHOOK_SECRET'),
  pixelId: () => opt('NEXT_PUBLIC_META_PIXEL_ID'),
  capiToken: () => opt('META_CAPI_ACCESS_TOKEN'),
  capiTestCode: () => opt('META_TEST_EVENT_CODE'),
  turnstileSecret: () => opt('TURNSTILE_SECRET_KEY'),
  resendKey: () => opt('RESEND_API_KEY'),
  fromEmail: () => opt('ALERT_FROM_EMAIL', 'Billys Custom Patches <service@billyscustomdigitizing.com>'),
  alertEmails: () => opt('ADMIN_ALERT_EMAILS').split(',').map((s) => s.trim()).filter(Boolean),
  whatsappProvider: () => choice('WHATSAPP_PROVIDER', 'meta') as 'ghl' | 'meta',
  whatsappBusinessNumber: () => opt('NEXT_PUBLIC_WHATSAPP_NUMBER', '18442245597').replace(/\D/g, ''),
  waPhoneNumberId: () => opt('WHATSAPP_PHONE_NUMBER_ID'),
  waAccessToken: () => opt('WHATSAPP_ACCESS_TOKEN'),
  waVerifyToken: () => opt('WHATSAPP_WEBHOOK_VERIFY_TOKEN'),
  waAppSecret: () => opt('WHATSAPP_APP_SECRET'),
  twilioSid: () => opt('TWILIO_ACCOUNT_SID'),
  twilioToken: () => opt('TWILIO_AUTH_TOKEN'),
  twilioVerifySid: () => opt('TWILIO_VERIFY_SERVICE_SID'),
  cronSecret: () => opt('CRON_SECRET'),
};
