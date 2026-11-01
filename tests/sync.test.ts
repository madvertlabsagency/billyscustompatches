import { describe, expect, it, vi } from 'vitest';
import { syncToGhl, nextAttemptAt, opportunityName, type QuoteRow, type GhlApi, type SyncDeps } from '@/lib/sync';
import { GhlError, GhlSetupError } from '@/lib/ghl';
import { TAGS } from '@/lib/scoring';

function row(over: Partial<QuoteRow> = {}): QuoteRow {
  return {
    id: 'r1', created_at: '2026-10-11T12:00:00Z', status: 'pending', attempts: 0,
    ghl_contact_id: null, ghl_opportunity_id: null, ghl_note_done: false, ghl_assigned_user_id: null, is_repeat: null,
    verify_code: 'BCP-123456', whatsapp_verified_at: null, pdf_path: null,
    first_name: 'Jane', last_name: 'Doe', business: 'Acme', email: 'jane@acme.com', phone_e164: '+15705550100', contact_method: 'WhatsApp',
    patch_type: 'PVC', quantity: '500 to 999', width: '3', height: '3', size_unsure: false, backing: 'Velcro',
    deadline: 'ASAP', deadline_date: null, notes: null,
    files: [{ path: 'rfq/a/b.png', name: 'logo.png', size: 10, ext: 'png' }], no_artwork: false,
    lead_score: 80, lead_grade: 'Very high', tags: [TAGS.highIntent, TAGS.artwork, TAGS.q250, TAGS.q500, TAGS.rush],
    tracking: { utm_source: 'facebook' },
    ...over,
  };
}

function fakeGhl(existing: { id: string } | null = null): GhlApi & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    findContact: vi.fn(async () => { calls.push('find'); return existing; }),
    createContact: vi.fn(async () => { calls.push('create'); return 'new-contact'; }),
    updateContact: vi.fn(async () => { calls.push('update'); }),
    addTags: vi.fn(async () => { calls.push('tags'); }),
    addNote: vi.fn(async () => { calls.push('note'); }),
    ensureFields: vi.fn(async () => new Map([['RFQ Patch Type', 'f1']])),
    findPipeline: vi.fn(async () => ({ pipelineId: 'p1', stageId: 's1' })),
    createOpportunity: vi.fn(async () => { calls.push('opp'); return 'opp1'; }),
  };
}

function deps(ghl: GhlApi, store = { update: vi.fn(async (_id: string, _p: Record<string, unknown>) => undefined) }): SyncDeps {
  return {
    ghl, store, pipelineName: 'Custom Patch Lab Sales Pipeline', stageName: 'New RFQ',
    userIds: ['u1', 'u2'], nextRoundRobin: vi.fn(async () => 1),
    links: { artwork: (p) => `https://x/a/${p}`, pdf: (p) => `https://x/a/${p}` },
    alert: vi.fn(async () => undefined), now: () => new Date('2026-10-11T12:00:00Z'),
  };
}

describe('duplicate handling', () => {
  it('creates a contact when none exists and tags NEW RFQ only', async () => {
    const ghl = fakeGhl(null);
    const d = deps(ghl);
    expect(await syncToGhl(row(), d)).toBe('synced');
    expect(ghl.createContact).toHaveBeenCalledTimes(1);
    const tags = (ghl.addTags as any).mock.calls[0][1];
    expect(tags).toContain(TAGS.newRfq);
    expect(tags).not.toContain(TAGS.repeat);
  });

  it('updates an existing contact instead of creating a duplicate, and tags REPEAT RFQ', async () => {
    const ghl = fakeGhl({ id: 'existing' });
    expect(await syncToGhl(row(), deps(ghl))).toBe('synced');
    expect(ghl.createContact).not.toHaveBeenCalled();
    expect((ghl.updateContact as any).mock.calls[0][0]).toBe('existing');
    expect((ghl.addTags as any).mock.calls[0][1]).toContain(TAGS.repeat);
  });

  it('assigns the round robin owner to contact and opportunity', async () => {
    const ghl = fakeGhl(null);
    await syncToGhl(row(), deps(ghl));
    expect((ghl.updateContact as any).mock.calls[0][1].assignedTo).toBe('u2');
    expect((ghl.createOpportunity as any).mock.calls[0][0]).toMatchObject({ assignedTo: 'u2', name: 'Jane Doe | 500 to 999 PVC | Artwork Uploaded' });
  });

  it('names the opportunity No Artwork when nothing was uploaded', () => {
    expect(opportunityName(row({ files: [] }))).toBe('Jane Doe | 500 to 999 PVC | No Artwork');
  });
});

describe('retry', () => {
  it('marks failed with backoff and alerts once on the first failure', async () => {
    const ghl = fakeGhl(null);
    ghl.findPipeline = vi.fn(async () => { throw new GhlError('GHL down', 503, true); });
    const store = { update: vi.fn(async (_id: string, _p: Record<string, unknown>) => undefined) };
    const d = deps(ghl, store);
    expect(await syncToGhl(row(), d)).toBe('failed');
    const last = store.update.mock.calls.at(-1)![1];
    expect(last).toMatchObject({ status: 'failed', attempts: 1, next_attempt_at: '2026-10-11T12:01:00.000Z' });
    expect(d.alert).toHaveBeenCalledTimes(1);
  });

  it('resumes from checkpoints without duplicating contact, note or opportunity', async () => {
    const ghl = fakeGhl(null);
    const r = row({ ghl_contact_id: 'c1', is_repeat: false, ghl_note_done: true, ghl_assigned_user_id: 'u1', attempts: 2, status: 'failed' });
    expect(await syncToGhl(r, deps(ghl))).toBe('synced');
    expect(ghl.findContact).not.toHaveBeenCalled();
    expect(ghl.createContact).not.toHaveBeenCalled();
    expect(ghl.addNote).not.toHaveBeenCalled();
    expect(ghl.createOpportunity).toHaveBeenCalledTimes(1);
  });

  it('a completed request never creates a second opportunity', async () => {
    const ghl = fakeGhl(null);
    const r = row({ ghl_contact_id: 'c1', is_repeat: false, ghl_note_done: true, ghl_assigned_user_id: 'u1', ghl_opportunity_id: 'o1' });
    await syncToGhl(r, deps(ghl));
    expect(ghl.createOpportunity).not.toHaveBeenCalled();
  });

  it('missing pipeline stops with needs_setup and tells the admin what to create', async () => {
    const ghl = fakeGhl(null);
    ghl.findPipeline = vi.fn(async () => { throw new GhlSetupError('Create the pipeline "Custom Patch Lab Sales Pipeline" in GHL'); });
    const d = deps(ghl);
    expect(await syncToGhl(row(), d)).toBe('needs_setup');
    expect((d.alert as any).mock.calls[0][1]).toContain('Create the pipeline');
  });

  it('backoff grows 1, 5, 15, 60, 240 minutes then caps at 6 hours', () => {
    const t = new Date('2026-10-11T00:00:00Z');
    const mins = [1, 2, 3, 4, 5, 6, 9].map((a) => (nextAttemptAt(a, t).getTime() - t.getTime()) / 60000);
    expect(mins).toEqual([1, 5, 15, 60, 240, 360, 360]);
  });
});
