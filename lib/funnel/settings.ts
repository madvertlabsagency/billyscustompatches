// Dashboard thresholds. Defaults live here; the owner can override any of them on
// /admin/funnel (saved in app_state under 'funnel_settings'). Percent values are 0 to 100.

export type SettingKey = keyof typeof DEFAULT_SETTINGS;
export type Settings = Record<SettingKey, number>;

export const DEFAULT_SETTINGS = {
  // Bounce: a session with a page view and no engagement. Engaged = this many seconds,
  // a scroll past 50% or any click.
  engagedSeconds: 10,

  // Rate benchmarks (percent). For "lower is better" metrics good < poor.
  ctrGood: 1.5,
  ctrPoor: 0.8,
  clickToLpvGood: 80,
  clickToLpvPoor: 65,
  bounceGood: 45,
  bouncePoor: 65,
  lpvToStartGood: 35,
  lpvToStartPoor: 20,
  startToSubmitGood: 40,
  startToSubmitPoor: 25,

  // Cost benchmarks in USD (lower is better). Starting points; adjust to your margins.
  costPerLpvGood: 1,
  costPerLpvPoor: 2.5,
  costPerRfqGood: 30,
  costPerRfqPoor: 75,
  costPerQualifiedGood: 60,
  costPerQualifiedPoor: 150,

  // Page speed (milliseconds, 75th percentile LCP).
  lcpGoodMs: 2500,
  lcpPoorMs: 4000,

  // Minimum sample sizes before a rule is allowed to fire.
  minImpressions: 100,
  minClicks: 30,
  minSessions: 20,
  minStarts: 15,
  minStepReach: 20,
  minUploads: 10,
  minLcpSamples: 20,
  minAdSpend: 20,
  minFrequencyImpressions: 1000,

  // Rule thresholds.
  stepDropPct: 35,
  stepDropMultiple: 2,
  uploadFailPct: 5,
  frequencyMax: 2.5,
  cpmRisePct: 10,
  adCostMultiple: 2,
  winnerShareOfAvg: 50,
  minWinnerRfqs: 3,
  improvePct: 15,
} as const satisfies Record<string, number>;

export type SettingField = { key: SettingKey; label: string; group: string };

export const SETTING_FIELDS: SettingField[] = [
  { key: 'engagedSeconds', label: 'Engaged after (seconds on page)', group: 'Bounce' },
  { key: 'ctrGood', label: 'CTR good above (%)', group: 'Benchmarks' },
  { key: 'ctrPoor', label: 'CTR poor below (%)', group: 'Benchmarks' },
  { key: 'clickToLpvGood', label: 'Click to landing page view good above (%)', group: 'Benchmarks' },
  { key: 'clickToLpvPoor', label: 'Click to landing page view poor below (%)', group: 'Benchmarks' },
  { key: 'bounceGood', label: 'Bounce rate good below (%)', group: 'Benchmarks' },
  { key: 'bouncePoor', label: 'Bounce rate poor above (%)', group: 'Benchmarks' },
  { key: 'lpvToStartGood', label: 'Visit to quote start good above (%)', group: 'Benchmarks' },
  { key: 'lpvToStartPoor', label: 'Visit to quote start poor below (%)', group: 'Benchmarks' },
  { key: 'startToSubmitGood', label: 'Quote start to submit good above (%)', group: 'Benchmarks' },
  { key: 'startToSubmitPoor', label: 'Quote start to submit poor below (%)', group: 'Benchmarks' },
  { key: 'costPerLpvGood', label: 'Cost per landing page view good below ($)', group: 'Costs' },
  { key: 'costPerLpvPoor', label: 'Cost per landing page view poor above ($)', group: 'Costs' },
  { key: 'costPerRfqGood', label: 'Cost per RFQ good below ($)', group: 'Costs' },
  { key: 'costPerRfqPoor', label: 'Cost per RFQ poor above ($)', group: 'Costs' },
  { key: 'costPerQualifiedGood', label: 'Cost per qualified RFQ good below ($)', group: 'Costs' },
  { key: 'costPerQualifiedPoor', label: 'Cost per qualified RFQ poor above ($)', group: 'Costs' },
  { key: 'lcpGoodMs', label: 'LCP good below (ms)', group: 'Page speed' },
  { key: 'lcpPoorMs', label: 'LCP poor above (ms)', group: 'Page speed' },
  { key: 'minImpressions', label: 'Minimum impressions', group: 'Minimum sample' },
  { key: 'minClicks', label: 'Minimum link clicks', group: 'Minimum sample' },
  { key: 'minSessions', label: 'Minimum sessions', group: 'Minimum sample' },
  { key: 'minStarts', label: 'Minimum quote starts', group: 'Minimum sample' },
  { key: 'minStepReach', label: 'Minimum visitors on a step', group: 'Minimum sample' },
  { key: 'minUploads', label: 'Minimum upload attempts', group: 'Minimum sample' },
  { key: 'minLcpSamples', label: 'Minimum page speed samples', group: 'Minimum sample' },
  { key: 'minAdSpend', label: 'Minimum spend per ad ($)', group: 'Minimum sample' },
  { key: 'minFrequencyImpressions', label: 'Minimum impressions for fatigue check', group: 'Minimum sample' },
  { key: 'stepDropPct', label: 'Step drop off alert above (%)', group: 'Rules' },
  { key: 'stepDropMultiple', label: 'Or above this multiple of the average step drop off', group: 'Rules' },
  { key: 'uploadFailPct', label: 'Upload failures alert above (%)', group: 'Rules' },
  { key: 'frequencyMax', label: 'Frequency alert above', group: 'Rules' },
  { key: 'cpmRisePct', label: 'CPM rise that counts as rising (%)', group: 'Rules' },
  { key: 'adCostMultiple', label: 'Pause ad when cost per RFQ is this multiple of the best ad', group: 'Rules' },
  { key: 'winnerShareOfAvg', label: 'Winning ad: cost per RFQ at most this % of the others', group: 'Rules' },
  { key: 'minWinnerRfqs', label: 'Winning ad: minimum RFQs', group: 'Rules' },
  { key: 'improvePct', label: 'Good news when a rate improves by (%)', group: 'Rules' },
];

export function mergeSettings(saved: unknown): Settings {
  const out = { ...DEFAULT_SETTINGS } as Settings;
  if (saved && typeof saved === 'object') {
    for (const k of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) {
      const v = Number((saved as Record<string, unknown>)[k]);
      if (Number.isFinite(v) && v >= 0) out[k] = v;
    }
  }
  return out;
}
