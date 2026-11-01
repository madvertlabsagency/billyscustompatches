import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { BUSINESS } from './options';

export type PdfArtwork = { name: string; ext: string; bytes: Uint8Array | null };

export type PdfInput = {
  quoteNumber: string;
  firstName: string;
  lastName: string;
  business?: string;
  email: string;
  phone: string;
  rows: { k: string; v: string }[];
  notes?: string;
  artwork: PdfArtwork[];
  logo?: Uint8Array | null;
  submittedAt: Date;
};

const NAVY = rgb(0x0b / 255, 0x1f / 255, 0x4d / 255);
const TEAL = rgb(0x0a / 255, 0x8b / 255, 0xd8 / 255);
const RED = rgb(0x12 / 255, 0x57 / 255, 0xe6 / 255);
const CREAM = rgb(0xf2 / 255, 0xf8 / 255, 0xff / 255);
const MUTED = rgb(0x4a / 255, 0x5a / 255, 0x78 / 255);

// Standard PDF fonts only cover WinAnsi; strip anything else so drawing never throws.
const safe = (s: string) => s.replace(/[\u2013\u2014]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '');

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const para of safe(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const test = line ? line + ' ' + word : word;
      if (font.widthOfTextAtSize(test, size) > width && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

export async function buildQuotePdf(input: PdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${BUSINESS.name} quote request ${input.quoteNumber}`);
  doc.setAuthor(BUSINESS.name);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 612;
  const H = 792;
  const M = 48;

  let page: PDFPage = doc.addPage([W, H]);
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: CREAM });
  page.drawRectangle({ x: 0, y: H - 110, width: W, height: 110, color: NAVY });
  let textX = M;
  if (input.logo) {
    try {
      const img = await doc.embedPng(input.logo);
      page.drawImage(img, { x: M, y: H - 95, width: 80, height: 80 });
      textX = M + 96;
    } catch {
      /* logo is optional */
    }
  }
  page.drawText(BUSINESS.nameUpper, { x: textX, y: H - 52, size: 22, font: bold, color: rgb(1, 1, 1) });
  page.drawText(BUSINESS.tagline.toUpperCase(), { x: textX, y: H - 72, size: 10, font: bold, color: rgb(0.18, 0.77, 1) });
  page.drawText(`Quote request ${input.quoteNumber}`, { x: textX, y: H - 92, size: 11, font, color: rgb(0.85, 0.88, 0.93) });

  let y = H - 150;
  page.drawText(safe(`Thanks ${input.firstName}, your quote request is in!`), { x: M, y, size: 18, font: bold, color: NAVY });
  y -= 22;
  for (const l of wrap('Our patch team will send your quote and free mockup within 24 hours. Reply on WhatsApp any time to talk to us.', font, 11, W - 2 * M)) {
    page.drawText(l, { x: M, y, size: 11, font, color: MUTED });
    y -= 15;
  }

  y -= 10;
  page.drawText('Your patch', { x: M, y, size: 14, font: bold, color: RED });
  y -= 8;
  const rows = [
    { k: 'Name', v: `${input.firstName} ${input.lastName}` },
    ...(input.business ? [{ k: 'Business', v: input.business }] : []),
    { k: 'Email', v: input.email },
    { k: 'WhatsApp', v: input.phone },
    ...input.rows,
    { k: 'Submitted', v: input.submittedAt.toUTCString() },
  ];
  for (const r of rows) {
    y -= 22;
    page.drawLine({ start: { x: M, y: y - 6 }, end: { x: W - M, y: y - 6 }, thickness: 1, color: rgb(0.84, 0.9, 0.98), dashArray: [4, 3] });
    page.drawText(safe(r.k), { x: M, y, size: 11, font, color: MUTED });
    const v = safe(r.v).slice(0, 80);
    page.drawText(v, { x: W - M - bold.widthOfTextAtSize(v, 11), y, size: 11, font: bold, color: NAVY });
  }

  if (input.notes && input.notes.trim()) {
    y -= 34;
    page.drawText('Project notes', { x: M, y, size: 14, font: bold, color: RED });
    y -= 18;
    for (const l of wrap(input.notes, font, 11, W - 2 * M).slice(0, 14)) {
      page.drawText(l, { x: M, y, size: 11, font, color: NAVY });
      y -= 15;
    }
  }

  y -= 20;
  page.drawText('Included free: design, mockup within 24 hours, unlimited design revisions and shipping. Money back guarantee.', {
    x: M, y, size: 9.5, font: bold, color: TEAL,
  });
  page.drawText([BUSINESS.phoneDisplay, BUSINESS.email, BUSINESS.address].filter(Boolean).join('  |  ') || BUSINESS.name, { x: M, y: 30, size: 9, font, color: MUTED });

  // Artwork pages: images embedded, PDFs copied in, other formats listed by name.
  const listed: string[] = [];
  for (const a of input.artwork) {
    if (!a.bytes) {
      listed.push(a.name);
      continue;
    }
    try {
      if (a.ext === 'png' || a.ext === 'jpg' || a.ext === 'jpeg') {
        const img = a.ext === 'png' ? await doc.embedPng(a.bytes) : await doc.embedJpg(a.bytes);
        page = doc.addPage([W, H]);
        page.drawText(safe(`Your artwork: ${a.name}`).slice(0, 90), { x: M, y: H - M, size: 13, font: bold, color: NAVY });
        const maxW = W - 2 * M;
        const maxH = H - 2 * M - 30;
        const s = Math.min(maxW / img.width, maxH / img.height, 1);
        page.drawImage(img, { x: (W - img.width * s) / 2, y: (H - 30 - img.height * s) / 2, width: img.width * s, height: img.height * s });
      } else if (a.ext === 'pdf') {
        const src = await PDFDocument.load(a.bytes, { ignoreEncryption: true });
        const idx = src.getPageIndices().slice(0, 3);
        const copied = await doc.copyPages(src, idx);
        copied.forEach((p) => doc.addPage(p));
      } else listed.push(a.name);
    } catch {
      listed.push(a.name);
    }
  }
  if (listed.length) {
    page = doc.getPage(0);
    page.drawText(safe(`Also received: ${listed.join(', ')}`).slice(0, 110), { x: M, y: 50, size: 9.5, font, color: NAVY });
  }
  return doc.save();
}
