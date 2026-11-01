import 'server-only';
import { createHash } from 'node:crypto';
import { db } from './supabase';
import { EMPTY_META, parseInsightRow, type MetaData, type MetaTotals } from './funnel/meta-types';

// Meta Marketing API (Graph API) insights, read with a system user token. Server only.
// Responses are cached in Supabase (meta_insights_cache) for 10 minutes.

const CACHE_MS = 10 * 60 * 1000;
const FIELDS = 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,reach,frequency,inline_link_clicks,actions';

const cfg = () => ({
  token: (process.env.META_SYSTEM_USER_TOKEN || '').trim(),
  account: (process.env.META_AD_ACCOUNT_ID || '').trim().replace(/^act_/, ''),
  version: (process.env.META_GRAPH_VERSION || 'v24.0').trim(),
});

async function graph(path: string, params: Record<string, string>, token: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let url: string | null = `https://graph.facebook.com/${cfg().version}/${path}?${new URLSearchParams({ ...params, access_token: token })}`;
  for (let page = 0; url && page < 20; page++) {
    const res: Response = await fetch(url, { cache: 'no-store' });
    const json = (await res.json().catch(() => ({}))) as { data?: Record<string, unknown>[]; paging?: { next?: string }; error?: { message?: string; code?: number } };
    if (!res.ok || json.error) throw new Error(`Meta API ${res.status}: ${json.error?.message || 'request failed'}`);
    out.push(...(json.data || []));
    url = json.paging?.next || null;
  }
  return out;
}

export async function getMetaData(since: string, until: string, nameFilter: string | null): Promise<MetaData> {
  const { token, account, version } = cfg();
  if (!token || !account) return EMPTY_META;
  const key = createHash('sha256').update(JSON.stringify([account, version, since, until, nameFilter || ''])).digest('hex').slice(0, 40);

  const { data: cached } = await db().from('meta_insights_cache').select('fetched_at, payload').eq('key', key).maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_MS) return cached.payload as MetaData;

  const base: Record<string, string> = {
    time_range: JSON.stringify({ since, until }),
    limit: '500',
    ...(nameFilter ? { filtering: JSON.stringify([{ field: 'campaign.name', operator: 'CONTAIN', value: nameFilter }]) } : {}),
  };
  try {
    const [adRows, accountRows] = await Promise.all([
      graph(`act_${account}/insights`, { ...base, level: 'ad', fields: FIELDS }, token),
      graph(`act_${account}/insights`, { ...base, level: 'account', fields: 'spend,impressions,reach,frequency' }, token),
    ]);
    const a = accountRows[0];
    const totals: MetaTotals | null = a
      ? { spend: Number(a.spend) || 0, impressions: Number(a.impressions) || 0, reach: Number(a.reach) || 0, frequency: Number(a.frequency) || 0 }
      : null;
    const payload: MetaData = { configured: true, ads: adRows.map(parseInsightRow), totals, fetchedAt: new Date().toISOString() };
    await db().from('meta_insights_cache').upsert({ key, fetched_at: payload.fetchedAt, payload });
    return payload;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Meta API failed';
    console.error('meta insights failed', msg);
    if (cached) return { ...(cached.payload as MetaData), stale: true, error: msg };
    return { ...EMPTY_META, configured: true, error: msg };
  }
}
