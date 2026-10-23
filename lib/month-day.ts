/**
 * Cap dates (a team cap's reset date, a plan's Cap Year Start) repeat every year: the cap calculations read only
 * their month and day (anniversaryStart, capYearFor). They are still stored as full dates; these helpers show them
 * as "Nov 1" and write a picked month and day back as a full date.
 */

export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Days a month can have, with February at 29 so Feb 29 can be picked. */
export const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function monthDayParts(value: unknown): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > MONTH_DAYS[month - 1]) return null;
  return { year, month, day };
}

/** "2025-11-01" → "Nov 1". Anything that is not a date is shown as it is. */
export function formatMonthDay(value: unknown): string {
  const parts = monthDayParts(value);
  if (!parts) return String(value ?? '').trim();
  return `${MONTHS_SHORT[parts.month - 1]} ${parts.day}`;
}

/** "2025-11-01" → "11-01", so cap dates sort January to December whatever year they were saved with. */
export function monthDaySortKey(value: unknown): string {
  const parts = monthDayParts(value);
  if (!parts) return String(value ?? '').trim();
  return `${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/** "Nov 1" → "11-01", to order filter options shown as month and day. */
export function monthDayLabelSortKey(label: string): string {
  const match = /^([A-Za-z]{3}) (\d{1,2})$/.exec(label.trim());
  const month = match ? MONTHS_SHORT.indexOf(match[1]) + 1 : 0;
  if (!match || month === 0) return label;
  return `${String(month).padStart(2, '0')}-${match[2].padStart(2, '0')}`;
}

const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/**
 * The stored date for a picked month and day. It keeps the year already saved (the calculations ignore it) or uses
 * this year; Feb 29 takes the latest leap year so the date is real.
 */
export function composeMonthDay(month: number, day: number, previous: unknown): string {
  let year = monthDayParts(previous)?.year ?? new Date().getFullYear();
  const safeDay = Math.min(day, MONTH_DAYS[month - 1]);
  if (month === 2 && safeDay === 29) {
    while (!isLeapYear(year)) year -= 1;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}
