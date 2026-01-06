// Small text normalization helpers used by the frontend UX layer.
export function normalizeEmail(email) {
  if (!email) return '';
  return String(email).trim().toLowerCase();
}

export function normalizeWord(word) {
  if (!word) return '';
  // Remove control characters and collapse whitespace
  // Control characters (C0 and C1): U+0000..U+001F, U+007F..U+009F
  return String(word).replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
}

export function normalizeFreeText(text) {
  if (!text) return '';
  // Remove ASCII and C1 control characters
  return String(text).replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
}

export default { normalizeEmail, normalizeWord, normalizeFreeText };
