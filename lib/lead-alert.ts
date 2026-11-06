// The "new RFQ received" alert, Shopify style: one shape for the phone notification and the in-app popup.
// Pure, so the browser, the server and the tests share it.
export type LeadAlert = {
  kind: 'new-lead';
  leadId: string;
  name: string;
  product: string;
  grade: string | null;
  score: number | null;
  urgent: boolean;
  rush: boolean;
  est: number | null; // estimated value of a new RFQ for this account, when the account set one
  account: string;
  url: string;
  at: string;
};

export type AlertLead = { id: string; first_name: string; last_name: string; quantity: string; patch_type: string; lead_grade: string | null; lead_score: number | null; tags: string[] | null; created_at?: string };

export function toLeadAlert(l: AlertLead, account: { name: string; est_rfq_value?: number | string | null }): LeadAlert {
  const rush = (l.tags || []).includes('RUSH ORDER');
  const est = Number(account.est_rfq_value);
  return {
    kind: 'new-lead',
    leadId: l.id,
    name: `${l.first_name} ${l.last_name}`.trim() || 'New customer',
    product: `${l.quantity} ${l.patch_type}`.trim(),
    grade: l.lead_grade,
    score: l.lead_score,
    urgent: rush || l.lead_grade === 'Very high',
    rush,
    est: Number.isFinite(est) && est > 0 ? est : null,
    account: account.name,
    url: `/patches/lead/${l.id}`,
    at: l.created_at || new Date().toISOString(),
  };
}

export const money = (v: number) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export function gradeLine(a: Pick<LeadAlert, 'grade' | 'score' | 'urgent' | 'rush'>): string {
  if (!a.grade) return '';
  return `${a.urgent ? 'URGENT, ' : ''}${a.grade} lead${a.score !== null ? ` (score ${a.score})` : ''}${a.rush ? ', rush order' : ''}`;
}

// Text for the system notification.
export function alertTexts(a: LeadAlert): { title: string; body: string } {
  const lines = [`${a.name}, ${a.product}`, [a.est ? `Est. ${money(a.est)}` : '', gradeLine(a)].filter(Boolean).join(' · '), a.account].filter(Boolean);
  return { title: a.est ? `🎉 New RFQ received, ${money(a.est)} est.` : '🎉 New RFQ received, congratulations!', body: lines.join('\n') };
}
