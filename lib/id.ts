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
