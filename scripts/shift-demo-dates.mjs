// Moves the DEMO client's dates forward so the data looks current before a demo.
//
//   npm run demo:shift                 preview: how many days, and the date ranges before and after
//   npm run demo:shift -- --apply      shift by the suggested days
//   npm run demo:shift -- --days 21 --apply
//
// Without --days, the shift moves the latest Acceptance Date exactly to today.
// Run it again before each demo; once current it suggests 0.
// The shift itself is public.shift_demo_dates (db/migrations/080_shift_demo_dates.sql), all in one go.
import { createClient } from '@supabase/supabase-js';

const CLIENT_ID = 'DEMO';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const daysArg = args.includes('--days') ? Number(args[args.indexOf('--days') + 1]) : null;
if (daysArg !== null && !Number.isInteger(daysArg)) {
  console.error('--days needs a whole number, e.g. --days 14');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
const DAY = 86_400_000;
const today = new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD

async function readAll(table, columns) {
  let rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).eq('client_id', CLIENT_ID).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows = rows.concat(data);
    if (data.length < 1000) return rows;
  }
}

function range(rows, column) {
  const values = rows.map((row) => row[column]).filter(Boolean).map((value) => String(value).slice(0, 10)).sort();
  return values.length ? { first: values[0], last: values[values.length - 1], count: values.length } : null;
}

const addDays = (day, days) => new Date(Date.parse(day) + days * DAY).toISOString().slice(0, 10);

const [transactions, payments] = await Promise.all([
  readAll('transactions', 'acceptance_date, closing_date, list_date'),
  readAll('payments', 'payment_date'),
]);

const latestAcceptance = range(transactions, 'acceptance_date')?.last;
if (!latestAcceptance && daysArg === null) {
  console.error('No acceptance dates on DEMO to measure from; pass --days.');
  process.exit(1);
}
const days = daysArg ?? Math.round((Date.parse(today) - Date.parse(latestAcceptance)) / DAY);

console.log(`DEMO, today ${today}. Latest acceptance date: ${latestAcceptance ?? 'none'}.`);
console.log(`Shift: ${days >= 0 ? '+' : ''}${days} days${daysArg === null ? ' (suggested)' : ''}.\n`);
for (const [label, rows, column] of [
  ['List Date', transactions, 'list_date'],
  ['Acceptance Date', transactions, 'acceptance_date'],
  ['Closing Date', transactions, 'closing_date'],
  ['Payment Date', payments, 'payment_date'],
]) {
  const r = range(rows, column);
  if (r) console.log(`${label.padEnd(16)} ${r.first} → ${r.last}   becomes ${addDays(r.first, days)} → ${addDays(r.last, days)}   (${r.count})`);
}
console.log('Cap Year Start and team cap periods move with them; plan version start dates too.');

if (days === 0) {
  console.log('\nNothing to shift.');
} else if (!apply) {
  console.log('\nPreview only. Add --apply to shift.');
} else {
  const { data, error } = await supabase.rpc('shift_demo_dates', { p_client_id: CLIENT_ID, p_days: days });
  if (error) {
    console.error(`Shift failed, nothing changed: ${error.message}`);
    process.exit(1);
  }
  console.log('\nShifted rows:', data);
}
