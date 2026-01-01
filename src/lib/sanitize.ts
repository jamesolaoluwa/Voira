// Small text normalization helpers used by the frontend UX layer.
export function normalizeEmail(email) {
  if (!email) return '';
  return String(email).trim().toLowerCase();
}

export function normalizeWord(word) {
  if (!word) return '';
  // Remove control characters and collapse whitespace
  return String(word).replace(/\p{Cc}/gu, '').trim();
}

export function normalizeFreeText(text) {
  if (!text) return '';
  return String(text).replace(/\p{Cc}/gu, '').trim();
}

export default { normalizeEmail, normalizeWord, normalizeFreeText };
