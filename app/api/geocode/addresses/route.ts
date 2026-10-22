// app/api/geocode/addresses/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSessionClient, apiError } from '@/lib/session';
import { addressKey, geocodeUsAddresses } from '@/lib/geocode';

/** At most this many new addresses are looked up per request, so one request stays well under a minute. */
const LOOKUP_LIMIT = 250;

const body = z.object({
  addresses: z.array(z.string().trim().min(1).max(300)).max(5000),
  /** False only reads saved coordinates; true also looks up the ones never seen (up to LOOKUP_LIMIT). */
  lookup: z.boolean().optional(),
});

export type AddressPoint = {
  key: string;
  matched: boolean;
  latitude: number | null;
  longitude: number | null;
  matchedAddress: string | null;
};

type GeocodeRow = {
  address_key: string;
  matched: boolean;
  latitude: number | null;
  longitude: number | null;
  matched_address: string | null;
};

// POST: Map coordinates for property addresses (Transaction Map report). Saved ones are read back; with lookup, up to
// LOOKUP_LIMIT addresses not seen before are looked up with the US Census geocoder and saved for every member of the
// client. `remaining` says how many unseen addresses are left for the next request.
export async function POST(request: Request) {
  try {
    const parsed = body.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    const { clientId, supabase } = await requireSessionClient();

    const byKey = new Map<string, string>();
    for (const address of parsed.data.addresses) {
      const key = addressKey(address);
      if (key && !byKey.has(key)) byKey.set(key, address.trim().replace(/\s+/g, ' '));
    }
    const keys = [...byKey.keys()];

    const saved: GeocodeRow[] = [];
    // Addresses travel in the request URL, so they are read 50 at a time to keep it short.
    for (let start = 0; start < keys.length; start += 50) {
      const { data, error } = await supabase
        .from('address_geocodes')
        .select('address_key, matched, latitude, longitude, matched_address')
        .eq('client_id', clientId)
        .in('address_key', keys.slice(start, start + 50));
      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') {
          return NextResponse.json(
            { error: 'The Transaction Map needs database migration 069 (address_geocodes). Run it in Supabase, then reload.' },
            { status: 501 },
          );
        }
        throw error;
      }
      saved.push(...((data || []) as GeocodeRow[]));
    }
    const known = new Map(saved.map((row) => [row.address_key, row]));
    const unseen = keys.filter((key) => !known.has(key));

    if (parsed.data.lookup && unseen.length > 0) {
      const batch = unseen.slice(0, LOOKUP_LIMIT).map((key) => ({ key, address: byKey.get(key)! }));
      const found = await geocodeUsAddresses(batch);
      const rows = found.map((result) => ({
        client_id: clientId,
        address_key: result.key,
        address: result.address,
        matched: result.matched,
        latitude: result.latitude,
        longitude: result.longitude,
        matched_address: result.matchedAddress,
        source: 'us_census',
        geocoded_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from('address_geocodes').upsert(rows, { onConflict: 'client_id,address_key' });
      if (error) throw error;
      rows.forEach((row) => known.set(row.address_key, row));
    }

    const points: AddressPoint[] = [...known.values()].map((row) => ({
      key: row.address_key,
      matched: row.matched,
      latitude: row.latitude,
      longitude: row.longitude,
      matchedAddress: row.matched_address,
    }));
    return NextResponse.json({
      success: true,
      points,
      remaining: keys.filter((key) => !known.has(key)).length,
    });
  } catch (error) {
    return apiError(error, 'The addresses could not be placed on the map.');
  }
}
