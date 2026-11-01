// Country calling codes offered next to the WhatsApp field. US first (the business serves the USA).
export const DIAL_CODES = [
  { code: '+1', label: 'US +1', name: 'United States or Canada' },
  { code: '+44', label: 'UK +44' },
  { code: '+61', label: 'AU +61' },
  { code: '+92', label: 'PK +92' },
  { code: '+91', label: 'IN +91' },
  { code: '+971', label: 'AE +971' },
  { code: '+966', label: 'SA +966' },
  { code: '+49', label: 'DE +49' },
  { code: '+52', label: 'MX +52' },
] as const;

// Joins a country code and a local number: "+92" + "0335 3572711" -> "+923353572711".
// A number typed with its own leading + is used as is.
export function joinPhone(dialCode: string, local: string): string {
  const t = local.trim();
  if (t.startsWith('+')) return '+' + t.replace(/\D/g, '');
  return dialCode + t.replace(/\D/g, '').replace(/^0+/, '');
}

// Normalizes a phone number to E.164, or null when it cannot be a valid number.
// Bare 10 digit numbers are treated as US (+1). A local number starting with 0 has no
// country code, so it is rejected instead of guessed.
export function toE164(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    return digits.length >= 8 && digits.length <= 15 && !digits.startsWith('0') ? '+' + digits : null;
  }
  if (digits.startsWith('0')) return null;
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return null;
}

export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}
