// Owner notes on a lead, kept like a CRM timeline: each note has its own time.
// Stored as JSON in quote_requests.owner_notes. Older leads hold a plain text note, which is read as one note.
export type OwnerNote = { at: string | null; text: string };

export const MAX_NOTES = 60;
export const MAX_NOTE_LENGTH = 1000;

export function parseNotes(raw: string | null | undefined): OwnerNote[] {
  const s = (raw || '').trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const list = JSON.parse(s);
      if (Array.isArray(list)) {
        return list
          .filter((n) => n && typeof n.text === 'string' && n.text.trim())
          .map((n) => ({ at: typeof n.at === 'string' ? n.at : null, text: String(n.text) }));
      }
    } catch {
      /* not JSON: fall through and keep it as one plain note */
    }
  }
  return [{ at: null, text: s }];
}

export function addNote(raw: string | null | undefined, text: string, at = new Date().toISOString()): string {
  const clean = text.trim().slice(0, MAX_NOTE_LENGTH);
  const list = parseNotes(raw);
  if (clean) list.push({ at, text: clean });
  return JSON.stringify(list.slice(-MAX_NOTES));
}

export function removeNote(raw: string | null | undefined, index: number): string | null {
  const list = parseNotes(raw).filter((_, i) => i !== index);
  return list.length ? JSON.stringify(list) : null;
}
