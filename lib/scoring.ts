// Lead scoring and tags.
// PROVISIONAL: RFQ-SPEC.md was not supplied, so the point values and thresholds below are
// placeholders kept in one place. Replace them with the spec's numbers when it arrives.

export type ScoreInput = {
  quantity: string;
  patchType: string;
  hasArtwork: boolean;
  deadline: string;
  deadlineDate?: string;
  business?: string;
  notes?: string;
  now?: Date;
};

export type Grade = 'Low' | 'Medium' | 'High' | 'Very high';

export const SCORE_RULES = {
  quantity: {
    '10 to 24': 5,
    '25 to 49': 10,
    '50 to 99': 15,
    '100 to 249': 25,
    '250 to 499': 35,
    '500 to 999': 45,
    '1,000+': 55,
    'Not sure yet': 5,
  } as Record<string, number>,
  artwork: 20,
  rush: 15,
  withinMonth: 10,
  oneToTwoMonths: 5,
  business: 5,
  knownType: 5,
  detailedNotes: 5,
  thresholds: { veryHigh: 70, high: 50, medium: 30 },
  rushDays: 14,
};

export const TAGS = {
  highIntent: 'HIGH INTENT RFQ',
  artwork: 'ARTWORK UPLOADED',
  noArtwork: 'NO ARTWORK',
  q250: '250 PLUS',
  q500: '500 PLUS',
  q1000: '1000 PLUS',
  rush: 'RUSH ORDER',
  newRfq: 'NEW RFQ',
  repeat: 'REPEAT RFQ',
  whatsappVerified: 'WHATSAPP VERIFIED',
  whatsappPending: 'WHATSAPP NOT VERIFIED',
} as const;

const QTY_FLOOR: Record<string, number> = {
  '10 to 24': 10,
  '25 to 49': 25,
  '50 to 99': 50,
  '100 to 249': 100,
  '250 to 499': 250,
  '500 to 999': 500,
  '1,000+': 1000,
};

export function isRush(deadline: string, deadlineDate: string | undefined, now: Date): boolean {
  if (deadline === 'ASAP' || deadline === 'Within 2 weeks') return true;
  if (deadline === 'Specific deadline' && deadlineDate) {
    const due = new Date(deadlineDate + 'T23:59:59');
    const days = (due.getTime() - now.getTime()) / 86400000;
    return days <= SCORE_RULES.rushDays;
  }
  return false;
}

export function scoreLead(input: ScoreInput): { score: number; grade: Grade; tags: string[] } {
  const now = input.now ?? new Date();
  const r = SCORE_RULES;
  let score = r.quantity[input.quantity] ?? 0;
  if (input.hasArtwork) score += r.artwork;
  const rush = isRush(input.deadline, input.deadlineDate, now);
  if (rush) score += r.rush;
  else if (input.deadline === 'Within 1 month' || input.deadline === 'Specific deadline') score += r.withinMonth;
  else if (input.deadline === '1 to 2 months') score += r.oneToTwoMonths;
  if (input.business && input.business.trim()) score += r.business;
  if (input.patchType && input.patchType !== 'Not sure') score += r.knownType;
  if (input.notes && input.notes.trim().length >= 20) score += r.detailedNotes;

  const grade: Grade =
    score >= r.thresholds.veryHigh ? 'Very high' : score >= r.thresholds.high ? 'High' : score >= r.thresholds.medium ? 'Medium' : 'Low';

  const tags: string[] = [];
  if (grade === 'High' || grade === 'Very high') tags.push(TAGS.highIntent);
  tags.push(input.hasArtwork ? TAGS.artwork : TAGS.noArtwork);
  const floor = QTY_FLOOR[input.quantity] ?? 0;
  if (floor >= 250) tags.push(TAGS.q250);
  if (floor >= 500) tags.push(TAGS.q500);
  if (floor >= 1000) tags.push(TAGS.q1000);
  if (rush) tags.push(TAGS.rush);
  return { score, grade, tags };
}

export function isQualified(grade: string | null | undefined): boolean {
  return grade === 'High' || grade === 'Very high';
}
