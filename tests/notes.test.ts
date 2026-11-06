import { describe, expect, it } from 'vitest';
import { addNote, parseNotes, removeNote, MAX_NOTES } from '../lib/notes';

describe('owner notes timeline', () => {
  it('reads an empty value as no notes', () => {
    expect(parseNotes(null)).toEqual([]);
    expect(parseNotes('  ')).toEqual([]);
  });

  it('keeps an old plain text note as one note without a time', () => {
    expect(parseNotes('Price sent')).toEqual([{ at: null, text: 'Price sent' }]);
  });

  it('adds notes with their own time, keeping the old plain note first', () => {
    const one = addNote('Price sent', 'Customer approved', '2026-11-06T10:00:00.000Z');
    const two = addNote(one, 'Paid deposit', '2026-11-06T12:00:00.000Z');
    expect(parseNotes(two)).toEqual([
      { at: null, text: 'Price sent' },
      { at: '2026-11-06T10:00:00.000Z', text: 'Customer approved' },
      { at: '2026-11-06T12:00:00.000Z', text: 'Paid deposit' },
    ]);
  });

  it('ignores a blank note and caps the list', () => {
    expect(parseNotes(addNote(null, '   '))).toEqual([]);
    let raw: string | null = null;
    for (let i = 0; i < MAX_NOTES + 5; i++) raw = addNote(raw, `n${i}`);
    const list = parseNotes(raw);
    expect(list).toHaveLength(MAX_NOTES);
    expect(list[list.length - 1].text).toBe(`n${MAX_NOTES + 4}`);
  });

  it('removes one note and clears the field when none are left', () => {
    const raw = addNote(addNote(null, 'a', 't1'), 'b', 't2');
    expect(parseNotes(removeNote(raw, 0))).toEqual([{ at: 't2', text: 'b' }]);
    expect(removeNote(removeNote(raw, 0), 0)).toBeNull();
  });
});
