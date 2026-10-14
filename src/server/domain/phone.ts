/**
 * Digits-only phone form used for duplicate detection.
 * "+1 (555) 010-2000", "1-555-010-2000" and "00 1 555 010 2000" all normalise to "15550102000".
 * Returns null for values too short to identify anyone.
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits.length >= 7 ? digits : null;
}
