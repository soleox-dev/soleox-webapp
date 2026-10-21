/**
 * Standardized Unique ID & Name Utilities
 * Adheres to Supabase generate_prefixed_id convention:
 * Format: [PREFIX]_[12_UPPERCASE_HEX_DIGITS] (e.g. TXN_6C59DB33ADE8)
 */

export function generatePrefixedId(prefix: string): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    return `${prefix}_${hex}`;
  }
  const hex = Array.from({ length: 12 }, () => Math.floor(Math.random() * 16).toString(16).toUpperCase()).join('');
  return `${prefix}_${hex}`;
}

/**
 * Normalizes an agent's name from legacy "Last, First" format (e.g. "Devon, Brennan")
 * into standard human reading order "First Last" (e.g. "Brennan Devon").
 */
export function normalizeAgentName(rawName: string | null | undefined): string {
  if (!rawName) return '';
  const trimmed = rawName.trim();
  if (trimmed.includes(',')) {
    const [last, first] = trimmed.split(',').map((s) => s.trim());
    return `${first} ${last}`.trim();
  }
  return trimmed;
}

/**
 * Splits an agent name into firstName, lastName, and normalized fullName.
 */
export function parseAgentName(rawName: string | null | undefined): { firstName: string; lastName: string; fullName: string } {
  if (!rawName) return { firstName: '', lastName: '', fullName: '' };
  const trimmed = rawName.trim();
  if (trimmed.includes(',')) {
    const [last, first] = trimmed.split(',').map((s) => s.trim());
    return {
      firstName: first || '',
      lastName: last || '',
      fullName: `${first} ${last}`.trim(),
    };
  }
  const parts = trimmed.split(/\s+/);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
    fullName: trimmed,
  };
}

/**
 * The key for a copy of `key`: the same key with the first free number appended, so a copy of custom_stock is
 * custom_stock_1, then custom_stock_2. A key that already ends in a number keeps counting from it: a copy of
 * custom_stock_1 is custom_stock_2, not custom_stock_1_1. `taken` holds the keys already in use.
 */
export function copyKey(key: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((item) => item.toLowerCase()));
  const match = key.match(/^(.*)_(\d+)$/);
  const base = match ? match[1] : key;
  let next = match ? Number(match[2]) + 1 : 1;
  while (used.has(`${base}_${next}`.toLowerCase())) next += 1;
  return `${base}_${next}`;
}
