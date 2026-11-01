// Meta Marketing API numbers, one row per ad for the selected date range.
export type MetaAdRow = {
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  ad_id: string;
  ad_name: string;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  link_clicks: number;
  landing_page_views: number;
  leads: number;
};

// Account level totals for the same filter: reach and frequency cannot be summed across ads.
export type MetaTotals = { spend: number; impressions: number; reach: number; frequency: number };

export type MetaData = {
  configured: boolean;
  ads: MetaAdRow[];
  totals: MetaTotals | null;
  fetchedAt: string | null;
  error?: string;
  stale?: boolean;
};

export const EMPTY_META: MetaData = { configured: false, ads: [], totals: null, fetchedAt: null };

type Action = { action_type: string; value: string };
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const actionValue = (actions: Action[] | undefined, type: string) => num(actions?.find((a) => a.action_type === type)?.value);

// Converts one raw insights row from the Graph API into our shape.
export function parseInsightRow(r: Record<string, unknown>): MetaAdRow {
  const actions = r.actions as Action[] | undefined;
  return {
    campaign_id: String(r.campaign_id || ''),
    campaign_name: String(r.campaign_name || ''),
    adset_id: String(r.adset_id || ''),
    adset_name: String(r.adset_name || ''),
    ad_id: String(r.ad_id || ''),
    ad_name: String(r.ad_name || ''),
    spend: num(r.spend),
    impressions: num(r.impressions),
    reach: num(r.reach),
    frequency: num(r.frequency),
    link_clicks: num(r.inline_link_clicks),
    landing_page_views: actionValue(actions, 'landing_page_view'),
    leads: actionValue(actions, 'offsite_conversion.fb_pixel_lead'),
  };
}
