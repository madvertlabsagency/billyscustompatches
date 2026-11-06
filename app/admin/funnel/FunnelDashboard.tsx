'use client';
import { useActionState, useCallback, useEffect, useMemo, useState } from 'react';
import type { Report } from '@/lib/funnel/report';
import type { Status } from '@/lib/funnel/metrics';
import { SETTING_FIELDS, type Settings } from '@/lib/funnel/settings';
import { saveFunnelSettings } from './actions';
import css from './funnel.module.css';
import { withBase } from '@/lib/base';

type Params = { range: string; from: string; to: string; campaign: string; adset: string; ad: string; all: boolean; demo: boolean };
const DEFAULT: Params = { range: 'today', from: '', to: '', campaign: '', adset: '', ad: '', all: false, demo: false };
const REFRESH_MS = 60_000;

const int = (v: number | null | undefined) => (v === null || v === undefined ? 'n/a' : Math.round(v).toLocaleString('en-US'));
const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? 'n/a' : `${v.toFixed(d)}%`);
const usd = (v: number | null | undefined) => (v === null || v === undefined ? 'n/a' : v >= 100 ? `$${Math.round(v).toLocaleString('en-US')}` : `$${v.toFixed(2)}`);
const secs = (ms: number | null | undefined) => (ms === null || ms === undefined ? 'n/a' : `${(ms / 1000).toFixed(1)} s`);
const ago = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} seconds ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

const STATUS_TEXT: Record<Status, string> = { good: '✓ Good', warning: '! Watch', critical: '✕ Poor', none: 'No data' };
const SEV_TEXT = { critical: '✕ Critical', warning: '! Warning', good: '✓ Good news' } as const;

function Chip({ status }: { status: Status }) {
  return <span className={`${css.chip} ${css[status]}`}>{STATUS_TEXT[status]}</span>;
}

// Change versus the previous period. `better` says which direction is good news.
function Change({ value, better = 'higher' }: { value: number | null; better?: 'higher' | 'lower' }) {
  if (value === null || !Number.isFinite(value)) return <span className={css.flat}>no previous data</span>;
  if (Math.abs(value) < 0.5) return <span className={css.flat}>no change</span>;
  const up = value > 0;
  const good = better === 'higher' ? up : !up;
  return (
    <span className={good ? css.up : css.down}>
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(0)}%<span className={css.sr}>{good ? ' better' : ' worse'}</span>
    </span>
  );
}

function readParams(): Params {
  const q = new URLSearchParams(location.search);
  return {
    range: q.get('range') || DEFAULT.range,
    from: q.get('from') || '',
    to: q.get('to') || '',
    campaign: q.get('campaign') || '',
    adset: q.get('adset') || '',
    ad: q.get('ad') || '',
    all: q.get('all') === '1',
    demo: q.get('demo') === '1',
  };
}

function toQuery(p: Params): string {
  const q = new URLSearchParams();
  q.set('range', p.range);
  if (p.range === 'custom') {
    if (p.from) q.set('from', p.from);
    if (p.to) q.set('to', p.to);
  }
  if (p.campaign) q.set('campaign', p.campaign);
  if (p.adset) q.set('adset', p.adset);
  if (p.ad) q.set('ad', p.ad);
  if (p.all) q.set('all', '1');
  if (p.demo) q.set('demo', '1');
  return q.toString();
}

export default function FunnelDashboard({ settings }: { settings: Settings }) {
  const [p, setP] = useState<Params | null>(null);
  const [data, setData] = useState<Report | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [tab, setTab] = useState<'ads' | 'device' | 'hour' | 'patch' | 'qty'>('ads');
  const [saveMsg, saveAction, saving] = useActionState(saveFunnelSettings, '');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Light or dark: the owner's last choice, otherwise the device setting.
  useEffect(() => {
    let t: string | null = null;
    try {
      t = localStorage.getItem('mv-theme');
    } catch {
      /* ignore */
    }
    setTheme(t === 'dark' || t === 'light' ? t : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }, []);
  const toggleTheme = () =>
    setTheme((cur) => {
      const next = cur === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('mv-theme', next);
      } catch {
        /* ignore */
      }
      return next;
    });

  useEffect(() => setP(readParams()), []);

  const load = useCallback(async (params: Params) => {
    if (params.range === 'custom' && (!params.from || !params.to)) return;
    setLoading(true);
    try {
      const res = await fetch(withBase(`/api/admin/funnel?${toQuery(params)}`), { cache: 'no-store' });
      if (res.status === 401) {
        location.href = withBase('/admin/login');
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load the report.');
      setData(json);
      setErr('');
      setUpdated(Date.now());
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load the report.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on every filter change, then every 60 seconds.
  useEffect(() => {
    if (!p) return;
    history.replaceState(null, '', `${location.pathname}?${toQuery(p)}`);
    load(p);
    const t = setInterval(() => load(p), REFRESH_MS);
    return () => clearInterval(t);
  }, [p, load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (saveMsg && p) load(p);
  }, [saveMsg]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<Params>) => setP((cur) => ({ ...(cur || DEFAULT), ...patch }));

  const opts = data?.options;
  const adsets = useMemo(() => (opts?.adsets || []).filter((a) => !p?.campaign || a.parent === p.campaign), [opts, p?.campaign]);
  const ads = useMemo(() => (opts?.ads || []).filter((a) => !p?.adset || a.parent === p.adset), [opts, p?.adset]);

  if (!p) return null;

  const metaStages = data?.stages.filter((s) => s.source === 'meta') || [];
  const siteStages = data?.stages.filter((s) => s.source === 'site') || [];
  const metaMax = Math.max(1, ...metaStages.map((s) => s.count || 0));
  const siteMax = Math.max(1, ...siteStages.map((s) => s.count || 0));
  const step1 = Math.max(1, data?.steps[0]?.reached || 0, data?.sawForm || 0);
  const hourMax = Math.max(1, ...(data?.hour.map((h) => h.sessions) || [0]));

  return (
    <div className={css.shell} data-theme={theme}>
    <div className={css.aura} aria-hidden="true"><i /><i /><i /></div>
    <div className={css.page}>
      <header className={css.head}>
        <div className={css.brand}>
          <img className={css.logoLight} src={withBase('/assets/madvert/logo-light.webp')} alt="Madvert Labs" width={480} height={140} />
          <img className={css.logoDark} src={withBase('/assets/madvert/logo-dark.webp')} alt="Madvert Labs" width={480} height={128} />
          <span className={css.brandRule} aria-hidden="true" />
          <div>
            <h1 className="hd">Funnel <span className={css.gt}>Health</span></h1>
            <span className={css.brandSub}>Billys Custom Patches quote funnel</span>
          </div>
        </div>
        <div className={css.headSide}>
          <a className={css.link} href={withBase('/admin')}>Leads</a>
          <span className={css.live} aria-live="polite"><i className={loading ? css.liveBusy : ''} aria-hidden="true" />{updated ? `Updated ${ago(now - updated)}` : loading ? 'Loading' : ''}{loading && updated ? ', refreshing' : ''}</span>
          <button type="button" className={css.btn} onClick={() => load(p)} disabled={loading}>Refresh</button>
          <button type="button" className={css.btn} onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? '☀ Light' : '☾ Dark'}
          </button>
          <button type="button" className={`${css.btn} ${p.demo ? css.btnOn : ''}`} aria-pressed={p.demo} onClick={() => set({ demo: !p.demo, campaign: '', adset: '', ad: '' })}>
            Demo data {p.demo ? 'on' : 'off'}
          </button>
        </div>
      </header>

      {p.demo && (
        <div className={css.demoBanner} role="status">
          <span>DEMO MODE: every number below is generated test data, not real traffic.</span>
          <button type="button" className={css.btn} onClick={() => set({ demo: false, campaign: '', adset: '', ad: '' })}>Show real data</button>
        </div>
      )}

      <section className={css.card} aria-label="Filters">
        <div className={css.filters}>
          <div className={css.field}>
            Date range
            <div className={css.seg}>
              {[['today', 'Today'], ['yesterday', 'Yesterday'], ['last_7d', 'Last 7 days'], ['custom', 'Custom']].map(([k, label]) => (
                <button key={k} type="button" aria-pressed={p.range === k} onClick={() => set({ range: k })}>{label}</button>
              ))}
            </div>
          </div>
          {p.range === 'custom' && (
            <>
              <label className={css.field}>From<input className={css.select} type="date" value={p.from} onChange={(e) => set({ from: e.target.value })} /></label>
              <label className={css.field}>To<input className={css.select} type="date" value={p.to} onChange={(e) => set({ to: e.target.value })} /></label>
            </>
          )}
          <label className={css.field}>
            Campaign
            <select className={css.select} value={p.campaign} onChange={(e) => set({ campaign: e.target.value, adset: '', ad: '' })}>
              <option value="">All campaigns</option>
              {opts?.campaigns.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label className={css.field}>
            Ad set
            <select className={css.select} value={p.adset} onChange={(e) => set({ adset: e.target.value, ad: '' })}>
              <option value="">All ad sets</option>
              {adsets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label className={css.field}>
            Ad
            <select className={css.select} value={p.ad} onChange={(e) => set({ ad: e.target.value })}>
              <option value="">All ads</option>
              {ads.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label className={css.check}>
            <input type="checkbox" checked={p.all} onChange={(e) => set({ all: e.target.checked, campaign: '', adset: '', ad: '' })} />
            All traffic and campaigns
          </label>
        </div>
        <p className={css.sub} style={{ margin: '10px 0 0' }}>
          {data ? `${data.range.label}, compared with the previous ${data.range.label === 'Today' ? 'day up to the same time' : 'period of the same length'}. ` : ''}
          {p.all ? 'Showing every visit and every campaign.' : `Showing campaigns whose name contains "${data?.nameFilter || 'Leadlink'}" and the visits they sent.`}
        </p>
      </section>

      {err && <div className={`${css.notice} ${css.noticeErr}`} role="alert">{err}</div>}
      {data && !data.meta.configured && !data.demo && (
        <div className={css.notice}>Meta ad data is not connected yet, so impressions, clicks and costs are hidden. Add META_SYSTEM_USER_TOKEN in Vercel to turn them on.</div>
      )}
      {data?.meta.error && <div className={`${css.notice} ${css.noticeErr}`}>Meta API: {data.meta.error}{data.meta.stale ? ' Showing the last saved numbers.' : ''}</div>}

      {data && (
        <>
          <section aria-labelledby="rates-h">
            <h2 id="rates-h" className={css.sr}>Key rates</h2>
            <div className={css.rates}>
              {data.rates.map((r) => (
                <div key={r.key} className={css.rate}>
                  <div className={css.rateTop}><span>{r.label}</span>{r.lowSample && r.value !== null ? <span className={`${css.chip} ${css.none}`}>Low data</span> : <Chip status={r.status} />}</div>
                  <div className={css.rateVal}>{r.unit === '$' ? usd(r.value) : pct(r.value)}</div>
                  <div className={css.rateMeta}>
                    <Change value={r.change} better={r.better} /> vs {r.unit === '$' ? usd(r.prev) : pct(r.prev)}
                    <br />
                    {r.better === 'higher' ? `Good above ${r.good}${r.unit === '%' ? '%' : ''}, poor below ${r.poor}${r.unit === '%' ? '%' : ''}` : `Good below ${r.unit === '$' ? '$' : ''}${r.good}${r.unit === '%' ? '%' : ''}, poor above ${r.unit === '$' ? '$' : ''}${r.poor}${r.unit === '%' ? '%' : ''}`}
                    <br />
                    {r.hint}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={css.card} aria-labelledby="funnel-h">
            <h2 id="funnel-h" className="hd">Funnel</h2>
            <p className={css.sub}>From Meta impressions to qualified quote requests. Each bar shows the count; the right side shows how many moved on from the stage above and the cost per stage. Meta bars and site bars use separate scales.</p>
            <div className={css.funnel}>
              {[...metaStages, ...siteStages].map((s, i) => {
                const meta = s.source === 'meta';
                const width = ((s.count || 0) / (meta ? metaMax : siteMax)) * 100;
                const first = !meta && i === metaStages.length;
                return (
                  <div key={s.key}>
                    {first && metaStages.length > 0 && <div className={css.fGap} />}
                    <div className={css.fRow}>
                      <div className={css.fLabel}>{s.label}<small>{meta ? 'Meta' : 'Our tracking'}</small></div>
                      <div className={css.track} title={`${s.label}: ${int(s.count)}${s.fromPrev !== null ? `, ${pct(s.fromPrev)} of the stage above` : ''}`}>
                        <div className={`${css.fill} ${meta ? css.fillMeta : ''}`} style={{ width: `${Math.max(width, 0.5)}%` }} />
                        <span className={css.trackNum}>{int(s.count)}</span>
                      </div>
                      <div className={css.fStats}>
                        <span>{s.fromPrev === null ? 'First stage' : <><b>{pct(s.fromPrev)}</b> moved on</>}</span>
                        {s.costPer !== null && <span><b>{usd(s.costPer)}</b> {s.key === 'impressions' ? 'CPM' : 'each'}</span>}
                        <Change value={s.change} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className={css.card} aria-labelledby="ins-h">
            <h2 id="ins-h" className="hd">Insights</h2>
            <p className={css.sub}>What the numbers say and what to try next. Rules only speak once there is enough data.</p>
            {data.insights.length === 0 && <p className={css.muted}>No problems found for this range.</p>}
            <div className={css.insights}>
              {data.insights.map((i) => (
                <article key={i.id} className={`${css.insight} ${i.severity === 'critical' ? css.iCritical : i.severity === 'warning' ? css.iWarning : css.iGood}`}>
                  <span className={`${css.chip} ${css[i.severity]}`}>{SEV_TEXT[i.severity]}</span>
                  <h3>{i.title}</h3>
                  <p className={css.evidence}>{i.evidence}</p>
                  <p className={css.meaning}>{i.meaning}</p>
                  <ul>{i.actions.map((a) => <li key={a}>{a}</li>)}</ul>
                </article>
              ))}
            </div>
            {data.pending.length > 0 && (
              <details className={css.pending}>
                <summary>Not enough data yet for {data.pending.length} {data.pending.length === 1 ? 'check' : 'checks'}</summary>
                <ul>{data.pending.map((x) => <li key={x.id}><b>{x.title}:</b> has {x.needed}</li>)}</ul>
              </details>
            )}
          </section>

          <section className={css.card} aria-labelledby="steps-h">
            <h2 id="steps-h" className="hd">Quote form, step by step</h2>
            <p className={css.sub}>{int(data.sawForm)} sessions saw the form and {int(data.steps[0]?.reached)} started it. Red marks a step that loses more than the alert limit.</p>
            <div className={css.steps}>
              {data.steps.map((s) => {
                const alert = s.lostPct !== null && s.reached >= settings.minStepReach && s.lostPct > settings.stepDropPct;
                return (
                  <div key={s.step} className={css.sRow}>
                    <div className={css.fLabel}>{s.label}</div>
                    <div className={css.track} title={`${int(s.reached)} reached, ${int(s.next)} went on`}>
                      <div className={css.fill} style={{ width: `${Math.max((s.reached / step1) * 100, 0.5)}%` }} />
                      <span className={css.trackNum}>{int(s.reached)}</span>
                    </div>
                    <div>
                      <div className={css.fStats}>
                        <span className={`${css.chip} ${alert ? css.critical : css.none}`}>{s.lostPct === null ? 'no visitors' : `${pct(s.lostPct, 0)} lost`}</span>
                        <span>median <b>{s.medianSec === null ? 'n/a' : `${s.medianSec.toFixed(0)} s`}</b></span>
                      </div>
                      {s.errors.length > 0 && <div className={css.sErr}>Errors: {s.errors.map((e) => `${e.label} (${e.count})`).join(', ')}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className={css.card} aria-labelledby="speed-h">
            <h2 id="speed-h" className="hd">Page speed</h2>
            <p className={css.sub}>Largest Contentful Paint from real visits. Red above {(settings.lcpGoodMs / 1000).toFixed(1)} seconds at the 75th percentile.</p>
            <div className={css.speed}>
              {data.speed.map((r) => (
                <div key={r.device} className={css.speedCard} style={{ borderColor: r.slow ? 'var(--crit)' : undefined }}>
                  <div className={css.rateTop}><span>{r.device === 'mobile' ? 'Mobile and tablet' : 'Desktop'}</span><Chip status={r.samples === 0 ? 'none' : r.slow ? 'critical' : 'good'} /></div>
                  <dl>
                    <dt>LCP median</dt><dd>{secs(r.lcpMedian)}</dd>
                    <dt>LCP 75th percentile</dt><dd style={{ color: r.slow ? 'var(--crit)' : undefined }}>{secs(r.lcpP75)}</dd>
                    <dt>First paint, 75th percentile</dt><dd>{secs(r.fcpP75)}</dd>
                    <dt>Server response, 75th percentile</dt><dd>{secs(r.ttfbP75)}</dd>
                    <dt>Visits measured</dt><dd>{int(r.samples)}</dd>
                  </dl>
                </div>
              ))}
            </div>
          </section>

          <section className={css.card} aria-labelledby="bd-h">
            <h2 id="bd-h" className="hd">Breakdowns</h2>
            <div className={css.tabs} role="tablist">
              {([['ads', 'By ad'], ['device', 'By device'], ['hour', 'By hour'], ['patch', 'By patch type'], ['qty', 'By quantity']] as const).map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className={`${css.btn} ${tab === k ? css.btnOn : ''}`} onClick={() => setTab(k)}>{label}</button>
              ))}
            </div>
            {tab === 'ads' && (
              <div className={css.tableWrap}>
                <table className={css.table}>
                  <thead><tr><th>Ad</th><th>Spend</th><th>Impr.</th><th>CTR</th><th>LPV</th><th>Sessions</th><th>Started</th><th>RFQs</th><th>Qualified</th><th>Cost per RFQ</th><th>Visit to RFQ</th></tr></thead>
                  <tbody>
                    {data.ads.length === 0 && <tr><td colSpan={11}>No ad data for this range.</td></tr>}
                    {data.ads.map((a) => (
                      <tr key={a.adId}>
                        <td><b>{a.name}</b><br /><span className={css.muted}>{a.adset || a.campaign}</span></td>
                        <td>{usd(a.spend)}</td><td>{int(a.impressions)}</td><td>{pct(a.ctr, 2)}</td><td>{int(a.lpv)}</td>
                        <td>{int(a.sessions)}</td><td>{int(a.started)}</td><td>{int(a.submitted)}</td><td>{int(a.qualified)}</td>
                        <td>{usd(a.costPerRfq)}</td><td>{pct(a.conv)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {(tab === 'device' || tab === 'patch' || tab === 'qty') && (
              <GroupTable rows={tab === 'device' ? data.device : tab === 'patch' ? data.patchType : data.quantity} name={tab === 'device' ? 'Device' : tab === 'patch' ? 'Patch type' : 'Quantity'} />
            )}
            {tab === 'hour' && (
              <div>
                <div className={css.hours} role="img" aria-label="Sessions and submitted quotes by hour of day">
                  {data.hour.map((h) => (
                    <div key={h.hour} className={css.hourCol} title={`${h.hour}:00, ${h.sessions} sessions, ${h.started} started, ${h.submitted} RFQs`}>
                      <div className={css.hourBar} style={{ height: `${(h.sessions / hourMax) * 100}%`, position: 'relative' }}>
                        <div className={css.hourSub} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: h.sessions ? `${(h.submitted / h.sessions) * 100}%` : 0 }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className={css.hourAxis} aria-hidden="true">{data.hour.map((h) => <span key={h.hour}>{h.hour % 3 === 0 ? h.hour : ''}</span>)}</div>
                <div className={css.legend}><span><i className={css.sw} style={{ background: 'var(--bar)' }} />Sessions</span><span><i className={css.sw} style={{ background: 'var(--accent)' }} />Share that submitted an RFQ</span><span>Hours in the business time zone</span></div>
              </div>
            )}
          </section>

          <section className={css.card} aria-labelledby="feed-h">
            <h2 id="feed-h" className="hd">Live activity</h2>
            <p className={css.sub}>The last 20 sessions.</p>
            <div className={css.tableWrap}>
              <table className={css.table}>
                <thead><tr><th>Source</th><th>When</th><th>Device</th><th>Furthest step</th><th>Outcome</th></tr></thead>
                <tbody>
                  {data.feed.length === 0 && <tr><td colSpan={5}>No sessions in this range yet.</td></tr>}
                  {data.feed.map((f) => (
                    <tr key={f.id + f.at}>
                      <td>{f.source}</td>
                      <td>{ago(now - f.at)}</td>
                      <td style={{ textTransform: 'capitalize' }}>{f.device}</td>
                      <td>{f.furthest ? `Step ${f.furthest}` : 'Not started'}</td>
                      <td><span className={`${css.chip} ${css[f.tone]}`}>{f.outcome}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className={css.card}>
        <details className={css.settings}>
          <summary>Thresholds and benchmarks</summary>
          <form action={saveAction}>
            <div className={css.setGrid}>
              {SETTING_FIELDS.map((f, i) => (
                <div key={f.key} style={{ display: 'contents' }}>
                  {(i === 0 || SETTING_FIELDS[i - 1].group !== f.group) && <h3 className={css.setGroup}>{f.group}</h3>}
                  <label className={css.field}>
                    {f.label}
                    <input className={css.setInput} name={f.key} type="number" step="any" min="0" defaultValue={settings[f.key]} />
                  </label>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className={`${css.btn} ${css.btnOn}`} type="submit" disabled={saving}>{saving ? 'Saving' : 'Save thresholds'}</button>
              <button className={css.btn} type="submit" disabled={saving} formAction={(fd: FormData) => { fd.set('reset', '1'); saveAction(fd); }}>Reset to defaults</button>
              {saveMsg && <span role="status" className={css.muted}>{saveMsg}</span>}
            </div>
          </form>
        </details>
      </section>
      <footer className={css.foot}>
        <img src={withBase('/assets/madvert/icon.webp')} alt="" width={28} height={28} />
        <span>Built by Madvert Labs. Beyond advertising, we build growth systems.</span>
      </footer>
    </div>
    </div>
  );
}

function GroupTable({ rows, name }: { rows: Report['device']; name: string }) {
  const max = Math.max(1, ...rows.map((r) => r.sessions));
  return (
    <div className={css.tableWrap}>
      <table className={css.table}>
        <thead><tr><th>{name}</th><th>Sessions</th><th>Bounce</th><th>Started</th><th>Start rate</th><th>RFQs</th><th>Start to RFQ</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={7}>No data for this range.</td></tr>}
          {rows.map((r) => (
            <tr key={r.key}>
              <td style={{ textTransform: name === 'Device' ? 'capitalize' : undefined }}>{r.key}</td>
              <td><i className={css.cellBar} style={{ width: `${(r.sessions / max) * 60}px` }} />{int(r.sessions)}</td>
              <td>{pct(r.bounce, 0)}</td><td>{int(r.started)}</td><td>{pct(r.startRate, 0)}</td><td>{int(r.submitted)}</td><td>{pct(r.submitRate, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
