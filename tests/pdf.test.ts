import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildQuotePdf } from '@/lib/pdf';

describe('quote PDF', () => {
  it('builds a details page plus a page for each embeddable artwork', async () => {
    const art = await PDFDocument.create();
    art.addPage([200, 200]);
    const bytes = await buildQuotePdf({
      quoteNumber: 'BCP-123456', firstName: 'Jane', lastName: 'Doe', email: 'j@x.com', phone: '+15705550100',
      rows: [{ k: 'Patch type', v: 'PVC' }], notes: 'Navy and gold \u2014 please', submittedAt: new Date(),
      artwork: [{ name: 'a.pdf', ext: 'pdf', bytes: await art.save() }, { name: 'logo.ai', ext: 'ai', bytes: null }],
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
  });
});
