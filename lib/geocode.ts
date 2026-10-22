/**
 * Turning property addresses into map coordinates with the free US Census geocoder
 * (https://geocoding.geo.census.gov). No key is needed; it covers US street addresses.
 * Used by /api/geocode/addresses for the Transaction Map report. Server only.
 */

export type GeocodeResult = {
  key: string;
  address: string;
  matched: boolean;
  latitude: number | null;
  longitude: number | null;
  matchedAddress: string | null;
};

const CENSUS_BATCH_URL = 'https://geocoding.geo.census.gov/geocoder/locations/addressbatch';
const CENSUS_ONE_LINE_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const BENCHMARK = 'Public_AR_Current';

/** How deals match a saved lookup: trimmed, single-spaced, lower case. */
export function addressKey(address: string): string {
  return address.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * "1911 Ginger Blossom Avenue, North Las Vegas, NV 89031" → street, city, state, ZIP. The last part holds the state
 * and ZIP, the one before it the city; the rest is the street. Null when the address does not read that way.
 */
export function splitUsAddress(address: string): { street: string; city: string; state: string; zip: string } | null {
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const tail = parts[parts.length - 1].match(/^([A-Za-z]{2})\s*(\d{5})(?:-\d{4})?$/);
  if (!tail) return null;
  return {
    street: parts.slice(0, -2).join(', '),
    city: parts[parts.length - 2],
    state: tail[1].toUpperCase(),
    zip: tail[2],
  };
}

/** One CSV line, honoring quoted fields. */
function csvFields(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') { current += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else current += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { fields.push(current); current = ''; }
    else current += char;
  }
  fields.push(current);
  return fields;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function point(text: string | undefined): { latitude: number; longitude: number } | null {
  const [lon, lat] = String(text || '').split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { latitude: lat, longitude: lon };
}

/** Looks up addresses that split into street, city, state and ZIP, up to 1,000 at a time, in one request. */
async function censusBatch(addresses: { key: string; address: string }[]): Promise<Map<string, GeocodeResult>> {
  const results = new Map<string, GeocodeResult>();
  const rows: string[] = [];
  addresses.forEach(({ address }, index) => {
    const parts = splitUsAddress(address);
    if (!parts) return;
    rows.push([String(index), parts.street, parts.city, parts.state, parts.zip].map(csvCell).join(','));
  });
  if (rows.length === 0) return results;

  const form = new FormData();
  form.append('addressFile', new Blob([rows.join('\n')], { type: 'text/csv' }), 'addresses.csv');
  form.append('benchmark', BENCHMARK);
  const response = await fetch(CENSUS_BATCH_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(55_000) });
  if (!response.ok) throw new Error(`The address lookup service answered ${response.status}.`);
  const text = await response.text();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [id, , status, , matchedAddress, coordinates] = csvFields(line);
    const source = addresses[Number(id)];
    if (!source) continue;
    const location = status === 'Match' ? point(coordinates) : null;
    results.set(source.key, {
      key: source.key,
      address: source.address,
      matched: Boolean(location),
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      matchedAddress: location ? matchedAddress || null : null,
    });
  }
  return results;
}

/** Looks up one address written any way, for those the batch could not split or match. */
async function censusOneLine(key: string, address: string): Promise<GeocodeResult> {
  const url = `${CENSUS_ONE_LINE_URL}?${new URLSearchParams({ address, benchmark: BENCHMARK, format: 'json' })}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`The address lookup service answered ${response.status}.`);
  const body = await response.json() as { result?: { addressMatches?: { matchedAddress?: string; coordinates?: { x?: number; y?: number } }[] } };
  const match = body.result?.addressMatches?.[0];
  const latitude = Number(match?.coordinates?.y);
  const longitude = Number(match?.coordinates?.x);
  const found = Number.isFinite(latitude) && Number.isFinite(longitude);
  return {
    key,
    address,
    matched: found,
    latitude: found ? latitude : null,
    longitude: found ? longitude : null,
    matchedAddress: found ? match?.matchedAddress || null : null,
  };
}

/**
 * Coordinates for each address: a batch lookup first, then one by one (a few at a time) for those the batch left
 * unmatched. An address the service cannot place comes back with matched = false.
 */
export async function geocodeUsAddresses(addresses: { key: string; address: string }[]): Promise<GeocodeResult[]> {
  const found = await censusBatch(addresses);
  const remaining = addresses.filter(({ key }) => !found.get(key)?.matched);
  for (let start = 0; start < remaining.length; start += 5) {
    const slice = remaining.slice(start, start + 5);
    const settled = await Promise.allSettled(slice.map(({ key, address }) => censusOneLine(key, address)));
    settled.forEach((outcome, index) => {
      const { key, address } = slice[index];
      found.set(key, outcome.status === 'fulfilled'
        ? outcome.value
        : { key, address, matched: false, latitude: null, longitude: null, matchedAddress: null });
    });
  }
  return addresses.map(({ key, address }) => found.get(key)
    ?? { key, address, matched: false, latitude: null, longitude: null, matchedAddress: null });
}
