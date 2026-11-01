// Rule based insights. Every rule checks its minimum sample first and otherwise reports
// "Not enough data yet". To add a rule, append an entry to RULES (see docs/FUNNEL-ANALYTICS.md).
import { STEP_LABELS } from './events';
import { changePct, cost, ratio, type AdRow, type Counts, type MetaSums, type SpeedRow, type StepRow } from './metrics';
import type { Settings } from './settings';

export type Severity = 'critical' | 'warning' | 'good';
export type Insight = { id: string; severity: Severity; title: string; evidence: string; meaning: string; actions: string[] };
export type Pending = { id: string; title: string; needed: string };
type RuleOutput = Insight[] | { needed: string };

export type InsightContext = {
  s: Settings;
  meta: MetaSums | null;
  prevMeta: MetaSums | null;
  counts: Counts;
  prevCounts: Counts;
  bounce: number | null;
  prevBounce: number | null;
  steps: StepRow[];
  prevSteps: StepRow[];
  speed: SpeedRow[];
  ads: AdRow[];
  uploads: { ok: string[]; failed: string[] };
};

export type Rule = { id: string; title: string; run: (c: InsightContext) => RuleOutput };

export const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? 'n/a' : `${v.toFixed(d)}%`);
export const usd = (v: number | null | undefined) => (v === null || v === undefined ? 'n/a' : `$${v.toFixed(2)}`);
const int = (v: number) => Math.round(v).toLocaleString('en-US');
const sev = (value: number, good: number, poor: number): Severity | null => {
  const higherBetter = good >= poor;
  if (higherBetter ? value >= good : value <= good) return null;
  return (higherBetter ? value < poor : value > poor) ? 'critical' : 'warning';
};
const need = (have: number, min: number, what: string) => ({ needed: `${int(have)} of ${int(min)} ${what}` });
const noMeta = { needed: 'Meta ad data (add META_SYSTEM_USER_TOKEN)' };

// What to try when a specific form step loses people.
export const STEP_ADVICE: Record<number, string[]> = {
  1: ['Show the patch type cards with photos so the choice is instant', 'Keep the Not sure option visible as the last card', 'Pre select the type when visitors come from a patch style card'],
  2: ['Keep quantity as tap ranges, never a typing box', 'Show "No minimum order" right above the options', 'Make Not sure yet the default suggestion'],
  3: ["Make I'm not sure yet, please recommend a size a big option instead of a small checkbox", 'Offer common sizes (2, 3, 4 inches) as one tap buttons', 'Consider making size optional'],
  4: ['Add a short picture or one line under each backing', 'Move Not sure to the first row', 'Consider making backing optional and asking on WhatsApp'],
  5: ['Make "I need design help" as prominent as the upload box', 'Let people continue and send artwork later on WhatsApp', 'Move the email field to step 7 so this step is only about artwork'],
  6: ['Default to the most common deadline', 'Keep notes clearly optional', 'Remove the date picker unless Specific deadline is chosen'],
  7: ['Cut optional fields (business name) or move them below the button', 'Reassure next to the phone field that WhatsApp is only for the quote', 'Check the country code picker and phone errors on mobile'],
};

const rateRule = (o: {
  id: string;
  title: string;
  value: (c: InsightContext) => number | null;
  sample: (c: InsightContext) => { have: number; min: number; what: string } | null;
  good: keyof Settings;
  poor: keyof Settings;
  evidence: (c: InsightContext, v: number) => string;
  meaning: string;
  actions: string[];
}): Rule => ({
  id: o.id,
  title: o.title,
  run: (c) => {
    const smp = o.sample(c);
    if (!smp) return noMeta;
    if (smp.have < smp.min) return need(smp.have, smp.min, smp.what);
    const v = o.value(c);
    if (v === null) return [];
    const level = sev(v, c.s[o.good], c.s[o.poor]);
    if (!level) return [];
    return [{ id: o.id, severity: level, title: o.title, evidence: o.evidence(c, v), meaning: o.meaning, actions: o.actions }];
  },
});

export const RULES: Rule[] = [
  rateRule({
    id: 'ctr_low',
    title: 'The ad is not stopping the scroll',
    value: (c) => (c.meta ? ratio(c.meta.linkClicks, c.meta.impressions) : null),
    sample: (c) => (c.meta ? { have: c.meta.impressions, min: c.s.minImpressions, what: 'impressions' } : null),
    good: 'ctrGood',
    poor: 'ctrPoor',
    evidence: (c, v) => `Link CTR is ${pct(v, 2)} (${int(c.meta!.linkClicks)} clicks from ${int(c.meta!.impressions)} impressions). Good is above ${c.s.ctrGood}%.`,
    meaning: 'People see the ad but few tap it, so every visitor costs more.',
    actions: ['Test a new hook in the first 3 seconds of the video', 'Put the strongest offer in the first line: $0 setup and a free mockup in 24 hours', 'Test a new thumbnail showing a finished patch up close'],
  }),
  rateRule({
    id: 'click_to_lpv_low',
    title: 'People click but the page does not load for them',
    value: (c) => (c.meta ? ratio(c.meta.lpv, c.meta.linkClicks) : null),
    sample: (c) => (c.meta ? { have: c.meta.linkClicks, min: c.s.minClicks, what: 'link clicks' } : null),
    good: 'clickToLpvGood',
    poor: 'clickToLpvPoor',
    evidence: (c, v) => `Only ${pct(v)} of ${int(c.meta!.linkClicks)} link clicks became landing page views (${int(c.meta!.lpv)}). Good is above ${c.s.clickToLpvGood}%.`,
    meaning: 'Visitors leave before the page finishes loading, or the pixel does not fire on load.',
    actions: ['Check mobile LCP in the page speed panel below', 'Compress the hero image and video poster', 'Confirm the Meta Pixel PageView fires on load and that the ad URL has no redirects'],
  }),
  rateRule({
    id: 'bounce_high',
    title: 'Many visitors leave right away',
    value: (c) => c.bounce,
    sample: (c) => ({ have: c.counts.sessions, min: c.s.minSessions, what: 'sessions' }),
    good: 'bounceGood',
    poor: 'bouncePoor',
    evidence: (c, v) => `Bounce rate is ${pct(v)}: ${int(c.counts.bounced)} of ${int(c.counts.sessions)} sessions left without scrolling, clicking or staying ${c.s.engagedSeconds} seconds. Good is below ${c.s.bounceGood}%.`,
    meaning: 'The page does not feel like a match for the ad they tapped.',
    actions: ["Repeat the ad's exact offer in the hero headline", 'Move customer reviews or a guarantee higher, next to the headline', 'Make the quote button visible without scrolling on mobile'],
  }),
  rateRule({
    id: 'visit_to_start_low',
    title: 'Visitors are not convinced to start a quote',
    value: (c) => ratio(c.counts.started, c.counts.sessions),
    sample: (c) => ({ have: c.counts.sessions, min: c.s.minSessions, what: 'sessions' }),
    good: 'lpvToStartGood',
    poor: 'lpvToStartPoor',
    evidence: (c, v) => `${pct(v)} of sessions started a quote (${int(c.counts.started)} of ${int(c.counts.sessions)}). Good is above ${c.s.lpvToStartGood}%.`,
    meaning: 'People read the page but the first step does not pull them in.',
    actions: ['Strengthen the hero button, for example "See my free mockup"', 'Put real patch photos above the fold', 'Test a shorter headline'],
  }),
  rateRule({
    id: 'start_to_submit_low',
    title: 'Started quotes are not being finished',
    value: (c) => ratio(c.counts.submitted, c.counts.started),
    sample: (c) => ({ have: c.counts.started, min: c.s.minStarts, what: 'quote starts' }),
    good: 'startToSubmitGood',
    poor: 'startToSubmitPoor',
    evidence: (c, v) => `${pct(v)} of started quotes were submitted (${int(c.counts.submitted)} of ${int(c.counts.started)}). Good is above ${c.s.startToSubmitGood}%.`,
    meaning: 'The form loses people part way. The step chart shows where.',
    actions: ['Fix the step named in the step drop off insight first', 'Remind people the quote is free and takes a minute', 'Check the form end to end on a phone'],
  }),
  {
    id: 'step_drop',
    title: 'One step loses too many people',
    run: (c) => {
      const eligible = c.steps.filter((r) => r.reached >= c.s.minStepReach && r.lostPct !== null);
      if (!eligible.length) return need(c.steps[0]?.reached ?? 0, c.s.minStepReach, 'visitors on step 1');
      const avg = eligible.reduce((t, r) => t + (r.lostPct as number), 0) / eligible.length;
      return eligible
        .filter((r) => (r.lostPct as number) > c.s.stepDropPct || (avg > 0 && (r.lostPct as number) > c.s.stepDropMultiple * avg))
        .map((r) => {
          const lost = r.lostPct as number;
          const errs = r.errors.length ? ` Most common problem: ${r.errors.map((e) => `${e.label} (${e.count})`).join(', ')}.` : '';
          const time = r.medianSec !== null ? ` Median time on the step: ${r.medianSec.toFixed(0)} seconds.` : '';
          return {
            id: `step_drop_${r.step}`,
            severity: (lost > c.s.stepDropPct * 1.5 ? 'critical' : 'warning') as Severity,
            title: `${r.label} loses ${pct(lost, 0)} of visitors`,
            evidence: `${int(r.reached)} reached ${r.label.toLowerCase()}, ${int(r.next)} went on. The average step loses ${pct(avg, 0)}.${errs}${time}`,
            meaning: 'This question is harder, slower or less clear than the others.',
            actions: STEP_ADVICE[r.step] ?? ['Simplify the step', 'Add a Not sure option', 'Make it optional'],
          };
        });
    },
  },
  {
    id: 'upload_fail',
    title: 'Artwork uploads are failing',
    run: (c) => {
      const total = c.uploads.ok.length + c.uploads.failed.length;
      if (total < c.s.minUploads) return need(total, c.s.minUploads, 'upload attempts');
      const rate = (c.uploads.failed.length / total) * 100;
      if (rate <= c.s.uploadFailPct) return [];
      const byExt = new Map<string, { ok: number; fail: number }>();
      const bump = (ext: string, k: 'ok' | 'fail') => {
        const v = byExt.get(ext) || { ok: 0, fail: 0 };
        v[k]++;
        byExt.set(ext, v);
      };
      c.uploads.ok.forEach((e) => bump(e, 'ok'));
      c.uploads.failed.forEach((e) => bump(e, 'fail'));
      const failing = [...byExt.entries()]
        .filter(([, v]) => v.fail > 0)
        .sort((a, b) => b[1].fail - a[1].fail)
        .map(([ext, v]) => `${ext.toUpperCase()} ${v.fail} of ${v.ok + v.fail} failed`);
      return [
        {
          id: 'upload_fail',
          severity: rate > c.s.uploadFailPct * 3 ? 'critical' : 'warning',
          title: `${pct(rate, 0)} of artwork uploads fail`,
          evidence: `${c.uploads.failed.length} of ${total} uploads failed. By file type: ${failing.join('; ')}.`,
          meaning: 'Customers with artwork ready are getting stuck at step 5, the step that matters most for quoting.',
          actions: ['Check the failing file types are allowed in the Supabase bucket settings', 'Test an upload of that file type on a phone with mobile data', 'Tell customers they can send the file on WhatsApp instead'],
        },
      ];
    },
  },
  {
    id: 'lcp_slow',
    title: 'The page is slow on phones',
    run: (c) => {
      const m = c.speed.find((r) => r.device === 'mobile');
      if (!m || m.samples < c.s.minLcpSamples) return need(m?.samples ?? 0, c.s.minLcpSamples, 'mobile page speed samples');
      if (m.lcpP75 === null || m.lcpP75 <= c.s.lcpGoodMs) return [];
      return [
        {
          id: 'lcp_slow',
          severity: m.lcpP75 > c.s.lcpPoorMs ? 'critical' : 'warning',
          title: `Mobile LCP is ${(m.lcpP75 / 1000).toFixed(1)} seconds`,
          evidence: `75% of mobile visits see the main content within ${(m.lcpP75 / 1000).toFixed(1)} s (median ${((m.lcpMedian ?? 0) / 1000).toFixed(1)} s, ${m.samples} visits). Good is under ${(c.s.lcpGoodMs / 1000).toFixed(1)} s.`,
          meaning: 'Slow pages lose paid clicks before visitors see the offer.',
          actions: ['Compress or resize the hero image', 'Delay the video and widgets until after load', 'Check for new heavy scripts or tracking tags'],
        },
      ];
    },
  },
  {
    id: 'ad_cost_outlier',
    title: 'An ad costs far more per RFQ than the best ad',
    run: (c) => {
      if (!c.meta) return noMeta;
      const spenders = c.ads.filter((a) => a.spend >= c.s.minAdSpend);
      const withRfq = spenders.filter((a) => a.submitted > 0 && a.costPerRfq !== null);
      if (spenders.length < 2 || !withRfq.length) return need(spenders.length, 2, `ads with ${usd(c.s.minAdSpend)} spend and at least one RFQ`);
      const best = withRfq.reduce((a, b) => ((a.costPerRfq as number) <= (b.costPerRfq as number) ? a : b));
      const limit = (best.costPerRfq as number) * c.s.adCostMultiple;
      return spenders
        .filter((a) => a.adId !== best.adId && (a.costPerRfq === null ? a.spend >= limit : a.costPerRfq > limit))
        .map((a) => ({
          id: `ad_cost_${a.adId}`,
          severity: 'warning' as Severity,
          title: `Consider pausing "${a.name}"`,
          evidence:
            a.costPerRfq === null
              ? `${usd(a.spend)} spent with no RFQ, while "${best.name}" gets RFQs at ${usd(best.costPerRfq)} each.`
              : `${usd(a.costPerRfq)} per RFQ (${a.submitted} RFQs from ${usd(a.spend)}) against ${usd(best.costPerRfq)} for "${best.name}".`,
          meaning: `This ad costs more than ${c.s.adCostMultiple} times the best ad for the same result.`,
          actions: [`Pause "${a.name}" or cut its budget`, `Move that budget to "${best.name}"`, 'Reuse the winning hook in a new version of this creative'],
        }));
    },
  },
  {
    id: 'ad_winner',
    title: 'One ad is clearly winning',
    run: (c) => {
      if (!c.meta) return noMeta;
      const spenders = c.ads.filter((a) => a.spend >= c.s.minAdSpend);
      const winners = spenders.filter((a) => a.submitted >= c.s.minWinnerRfqs && a.costPerRfq !== null);
      if (!winners.length || spenders.length < 2) return need(winners.length, 1, `ad with ${c.s.minWinnerRfqs}+ RFQs and another ad to compare`);
      const best = winners.reduce((a, b) => ((a.costPerRfq as number) <= (b.costPerRfq as number) ? a : b));
      const others = spenders.filter((a) => a.adId !== best.adId);
      const othersCost = cost(others.reduce((t, a) => t + a.spend, 0), others.reduce((t, a) => t + a.submitted, 0));
      const othersSpend = others.reduce((t, a) => t + a.spend, 0);
      const winning = othersCost === null ? othersSpend >= (best.costPerRfq as number) * 2 : (best.costPerRfq as number) <= (othersCost * c.s.winnerShareOfAvg) / 100;
      if (!winning) return [];
      return [
        {
          id: 'ad_winner',
          severity: 'good',
          title: `"${best.name}" is your best ad`,
          evidence: `${usd(best.costPerRfq)} per RFQ from ${best.submitted} RFQs, against ${othersCost === null ? 'no RFQs' : usd(othersCost)} for the other ads combined.`,
          meaning: 'Budget on this ad buys RFQs at a much lower cost.',
          actions: [`Move budget to "${best.name}" in steps of about 20% a day`, 'Make 2 new versions of it with a different first line', 'Keep it running until frequency passes the fatigue limit'],
        },
      ];
    },
  },
  {
    id: 'fatigue',
    title: 'Audience fatigue',
    run: (c) => {
      if (!c.meta) return noMeta;
      if (c.meta.impressions < c.s.minFrequencyImpressions) return need(c.meta.impressions, c.s.minFrequencyImpressions, 'impressions');
      const cpm = c.meta.impressions ? (c.meta.spend / c.meta.impressions) * 1000 : null;
      const prevCpm = c.prevMeta && c.prevMeta.impressions ? (c.prevMeta.spend / c.prevMeta.impressions) * 1000 : null;
      const rise = changePct(cpm, prevCpm);
      if (c.meta.frequency <= c.s.frequencyMax || rise === null || rise <= c.s.cpmRisePct) return [];
      return [
        {
          id: 'fatigue',
          severity: 'warning',
          title: 'The same people are seeing the ads too often',
          evidence: `Frequency is ${c.meta.frequency.toFixed(2)} (limit ${c.s.frequencyMax}) and CPM rose ${pct(rise, 0)} to ${usd(cpm)} versus the previous period.`,
          meaning: 'The audience is tired of these creatives, so Meta charges more to reach them.',
          actions: ['Add 2 or 3 fresh creatives with new hooks', 'Widen the audience or add a lookalike of past RFQs', 'Pause the oldest creative'],
        },
      ];
    },
  },
  {
    id: 'improvements',
    title: 'Good news',
    run: (c) => {
      const out: Insight[] = [];
      const min = c.s.minStepReach;
      for (const r of c.steps) {
        const p = c.prevSteps.find((x) => x.step === r.step);
        if (!p || r.reached < min || p.reached < min) continue;
        const now = r.reached ? (r.next / r.reached) * 100 : null;
        const before = p.reached ? (p.next / p.reached) * 100 : null;
        const ch = changePct(now, before);
        if (ch !== null && ch >= c.s.improvePct)
          out.push({
            id: `improve_step_${r.step}`,
            severity: 'good',
            title: `${STEP_LABELS[r.step]} completion improved ${pct(ch, 0)}`,
            evidence: `${pct(now, 0)} of visitors completed it, up from ${pct(before, 0)} in the previous period.`,
            meaning: 'Whatever changed on this step is working.',
            actions: ['Keep the change', 'Apply the same idea to the weakest step'],
          });
      }
      if (c.counts.started >= c.s.minStarts && c.prevCounts.started >= c.s.minStarts) {
        const now = ratio(c.counts.submitted, c.counts.started);
        const before = ratio(c.prevCounts.submitted, c.prevCounts.started);
        const ch = changePct(now, before);
        if (ch !== null && ch >= c.s.improvePct)
          out.push({
            id: 'improve_submit',
            severity: 'good',
            title: `Quote completion improved ${pct(ch, 0)}`,
            evidence: `${pct(now, 0)} of started quotes were submitted, up from ${pct(before, 0)}.`,
            meaning: 'More of the people who start the form now finish it.',
            actions: ['Keep the current form', 'Spend more on the ads sending these visitors'],
          });
      }
      if (c.meta && c.prevMeta && c.counts.submitted >= c.s.minWinnerRfqs && c.prevCounts.submitted >= c.s.minWinnerRfqs) {
        const now = cost(c.meta.spend, c.counts.submitted);
        const before = cost(c.prevMeta.spend, c.prevCounts.submitted);
        const ch = changePct(now, before);
        if (ch !== null && -ch >= c.s.improvePct)
          out.push({
            id: 'improve_cost',
            severity: 'good',
            title: `Cost per RFQ dropped ${pct(-ch, 0)}`,
            evidence: `${usd(now)} per RFQ, down from ${usd(before)} in the previous period.`,
            meaning: 'The same budget is buying more quote requests.',
            actions: ['Raise the budget of the best ad gradually', 'Do not change the winning ads for now'],
          });
      }
      return out;
    },
  },
];

const ORDER: Record<Severity, number> = { critical: 0, warning: 1, good: 2 };

export function runInsights(c: InsightContext, rules: Rule[] = RULES): { insights: Insight[]; pending: Pending[] } {
  const insights: Insight[] = [];
  const pending: Pending[] = [];
  for (const r of rules) {
    const out = r.run(c);
    if (Array.isArray(out)) insights.push(...out);
    else pending.push({ id: r.id, title: r.title, needed: out.needed });
  }
  insights.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  return { insights, pending };
}
