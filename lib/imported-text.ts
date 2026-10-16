/**
 * Spreadsheet text sometimes arrives with U+FFFD where an ñ was.
 * Every name in the ledger that lost a character is a Spanish ñ:
 * Peña, Ibáñez, Núñez.
 */
export function repairImportedText(value: string): string {
  return value.includes('\uFFFD') ? value.replaceAll('\uFFFD', 'ñ') : value;
}
