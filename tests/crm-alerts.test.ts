import { describe, expect, it } from 'vitest';
import { actionCount, computeAlerts, type AlertLead } from '../lib/crm-alerts';

const NOW = Date.parse('2026-11-10T15:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3600000).toISOString();
const lead = (p: Partial<AlertLead>): AlertLead => ({
  id: 'x', first_name: 'Ana', last_name: 'Kim', quantity: '100', patch_type: 'PVC', created_at: hoursAgo(1),
  lead_status: 'new', assignee_id: 'm1', lead_grade: 'Medium', lead_score: 40, tags: [], ...p,
});

describe('CRM notifications', () => {
  it('announces new leads and marks rush or very high ones urgent', () => {
    const a = computeAlerts({ leads: [lead({ id: 'a' }), lead({ id: 'b', tags: ['RUSH ORDER'] })], lastTouch: new Map(), tasks: [], now: NOW, today: '2026-11-10' });
    expect(a.find((x) => x.id === 'new-a')!.level).toBe('info');
    expect(a.find((x) => x.id === 'new-b')!.level).toBe('urgent');
  });

  it('flags a New RFQ untouched for a day, and stops once the team acts', () => {
    const l = lead({ id: 'c', created_at: hoursAgo(30) });
    expect(computeAlerts({ leads: [l], lastTouch: new Map(), tasks: [], now: NOW, today: '2026-11-10' }).some((x) => x.id === 'wait-c')).toBe(true);
    expect(computeAlerts({ leads: [l], lastTouch: new Map([['c', hoursAgo(2)]]), tasks: [], now: NOW, today: '2026-11-10' }).some((x) => x.id === 'wait-c')).toBe(false);
  });

  it('nudges idle contacted and quoted leads, and leads with no owner', () => {
    const a = computeAlerts({
      leads: [lead({ id: 'd', lead_status: 'contacted', created_at: hoursAgo(100) }), lead({ id: 'e', lead_status: 'quoted', created_at: hoursAgo(100) }), lead({ id: 'f', assignee_id: null, created_at: hoursAgo(3) })],
      lastTouch: new Map([['d', hoursAgo(60)], ['e', hoursAgo(80)]]),
      tasks: [],
      now: NOW,
      today: '2026-11-10',
    });
    expect(a.some((x) => x.id === 'idle-d')).toBe(true);
    expect(a.some((x) => x.id === 'quote-e')).toBe(true);
    expect(a.some((x) => x.id === 'owner-f')).toBe(true);
  });

  it('lists overdue and due today tasks, urgent first, and counts only actions', () => {
    const a = computeAlerts({
      leads: [lead({ id: 'g', created_at: hoursAgo(1) })],
      lastTouch: new Map(),
      tasks: [
        { id: 't1', lead_id: 'g', title: 'Send mockup', due_on: '2026-11-08', done_at: null },
        { id: 't2', lead_id: 'g', title: 'Call', due_on: '2026-11-10', done_at: null },
        { id: 't3', lead_id: 'g', title: 'Done one', due_on: '2026-11-01', done_at: hoursAgo(5) },
      ],
      now: NOW,
      today: '2026-11-10',
    });
    expect(a[0].id).toBe('task-t1');
    expect(a.some((x) => x.id === 'task-t3')).toBe(false);
    expect(actionCount(a)).toBe(2);
  });
});
