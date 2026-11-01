import { describe, expect, it } from 'vitest';
import { scoreLead, isRush, TAGS } from '@/lib/scoring';

const now = new Date('2026-10-11T12:00:00Z');

describe('scoreLead', () => {
  it('tags a large rush order with artwork as high intent', () => {
    const r = scoreLead({ quantity: '1,000+', patchType: 'PVC', hasArtwork: true, deadline: 'ASAP', business: 'Acme', notes: '', now });
    expect(r.grade).toBe('Very high');
    expect(r.tags).toEqual([TAGS.highIntent, TAGS.artwork, TAGS.q250, TAGS.q500, TAGS.q1000, TAGS.rush]);
  });

  it('gives a small exploring order without artwork a low grade', () => {
    const r = scoreLead({ quantity: '10 to 24', patchType: 'Not sure', hasArtwork: false, deadline: 'Just exploring', now });
    expect(r.grade).toBe('Low');
    expect(r.tags).toEqual([TAGS.noArtwork]);
  });

  it('applies quantity tags at the bracket boundaries', () => {
    expect(scoreLead({ quantity: '250 to 499', patchType: 'PVC', hasArtwork: false, deadline: 'Just exploring', now }).tags).toContain(TAGS.q250);
    expect(scoreLead({ quantity: '250 to 499', patchType: 'PVC', hasArtwork: false, deadline: 'Just exploring', now }).tags).not.toContain(TAGS.q500);
    expect(scoreLead({ quantity: '100 to 249', patchType: 'PVC', hasArtwork: false, deadline: 'Just exploring', now }).tags).not.toContain(TAGS.q250);
    expect(scoreLead({ quantity: 'Not sure yet', patchType: 'PVC', hasArtwork: false, deadline: 'Just exploring', now }).tags).not.toContain(TAGS.q250);
  });

  it('treats a specific deadline within 14 days as rush', () => {
    expect(isRush('Specific deadline', '2026-10-20', now)).toBe(true);
    expect(isRush('Specific deadline', '2026-12-20', now)).toBe(false);
    expect(isRush('Within 2 weeks', undefined, now)).toBe(true);
    expect(isRush('Within 1 month', undefined, now)).toBe(false);
  });
});
