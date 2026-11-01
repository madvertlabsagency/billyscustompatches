import { describe, expect, it } from 'vitest';
import { joinPhone, toE164 } from '@/lib/phone';

describe('phone numbers', () => {
  it('joins the country code and drops the leading 0', () => {
    expect(toE164(joinPhone('+92', '0335 3572711'))).toBe('+923353572711');
    expect(toE164(joinPhone('+1', '(570) 664-9975'))).toBe('+15706649975');
    expect(toE164(joinPhone('+44', '07700 900123'))).toBe('+447700900123');
  });
  it('keeps a number typed with its own +', () => {
    expect(toE164(joinPhone('+1', '+92 335 3572711'))).toBe('+923353572711');
  });
  it('rejects a local number with no country code instead of guessing', () => {
    expect(toE164('03353572711')).toBeNull();
    expect(toE164('+03353572711')).toBeNull();
  });
  it('treats a bare 10 digit number as US', () => {
    expect(toE164('5706649975')).toBe('+15706649975');
  });
});
