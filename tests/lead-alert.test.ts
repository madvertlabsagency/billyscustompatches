import { describe, expect, it } from 'vitest';
import { alertTexts, toLeadAlert } from '../lib/lead-alert';

const lead = { id: 'l1', first_name: 'Jayme', last_name: 'Saragenovich', quantity: '100 to 249', patch_type: 'Embroidered', lead_grade: 'High', lead_score: 62, tags: [] as string[] };

describe('new RFQ alert', () => {
  it('celebrates and shows the estimated value when the account set one', () => {
    const t = alertTexts(toLeadAlert(lead, { name: 'Billys Custom Patches', est_rfq_value: '250' }));
    expect(t.title).toBe('🎉 New RFQ received, $250 est.');
    expect(t.body).toBe('Jayme Saragenovich, 100 to 249 Embroidered\nEst. $250 · High lead (score 62)\nBillys Custom Patches');
  });

  it('never shows a dollar amount the account did not set', () => {
    const a = toLeadAlert(lead, { name: 'Billys Custom Patches', est_rfq_value: null });
    expect(a.est).toBeNull();
    expect(alertTexts(a).title).toBe('🎉 New RFQ received, congratulations!');
    expect(alertTexts(a).body).not.toContain('$');
  });

  it('marks rush and very high leads urgent', () => {
    const a = toLeadAlert({ ...lead, tags: ['RUSH ORDER'] }, { name: 'B' });
    expect(a.urgent).toBe(true);
    expect(alertTexts(a).body).toContain('URGENT, High lead (score 62), rush order');
    expect(toLeadAlert({ ...lead, lead_grade: 'Very high' }, { name: 'B' }).urgent).toBe(true);
  });
});
