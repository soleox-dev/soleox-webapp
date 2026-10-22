'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Map as LeafletMap, LayerGroup } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ReportDeal } from '@/lib/owner-reports';
import type { AddressPoint } from '@/app/api/geocode/addresses/route';

/** Bubble colors by status: emerald closed, amber pending, rose cancelled (CLAUDE.md color roles). */
const STATUS_COLORS: Record<string, string> = {
  closed: '#10b981',
  pending: '#f59e0b',
  cancelled: '#f43f5e',
};
const OTHER_COLOR = '#64748b';
const MIN_RADIUS = 5;
const MAX_RADIUS = 22;

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function addressKey(address: string): string {
  return address.trim().replace(/\s+/g, ' ').toLowerCase();
}

function statusColor(status: string): string {
  return STATUS_COLORS[status.trim().toLowerCase()] ?? OTHER_COLOR;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

/** CARTO's light or dark basemap (OpenStreetMap data), matching the app theme. No key needed. */
function basemapUrl(dark: boolean): string {
  return `https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`;
}

/**
 * Transaction Map (Owner Reports): one bubble per deal at its property address, sized by sales price and colored by
 * status. Coordinates come from /api/geocode/addresses, which looks up addresses it has not seen with the free US
 * Census geocoder and saves them, so each address is looked up once.
 */
export function TransactionMapReport({ deals, names }: { deals: ReportDeal[]; names: Map<string, string> }) {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const bubblesRef = useRef<LayerGroup | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const [ready, setReady] = useState(false);
  const [points, setPoints] = useState<Map<string, AddressPoint>>(() => new Map());
  const [lookup, setLookup] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [showUnplaced, setShowUnplaced] = useState(false);

  const withAddress = useMemo(() => deals.filter((deal) => deal.address.trim()), [deals]);
  const addresses = useMemo(() => [...new Set(withAddress.map((deal) => deal.address.trim()))], [withAddress]);

  // Saved coordinates first, then any addresses never seen, a chunk at a time, so the map fills in as it goes.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setError('');
      const call = async (lookupNew: boolean) => {
        const response = await fetch('/api/geocode/addresses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addresses, lookup: lookupNew }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) throw new Error(data.error || 'The addresses could not be placed on the map.');
        return data as { points: AddressPoint[]; remaining: number };
      };
      const absorb = (found: AddressPoint[]) => setPoints((current) => {
        const next = new Map(current);
        found.forEach((point) => next.set(point.key, point));
        return next;
      });
      try {
        let result = await call(false);
        if (cancelled) return;
        absorb(result.points);
        const total = result.remaining;
        while (result.remaining > 0 && !cancelled) {
          setLookup({ done: total - result.remaining, total });
          const before = result.remaining;
          result = await call(true);
          if (cancelled) return;
          absorb(result.points);
          if (result.remaining >= before) break;
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'The addresses could not be placed on the map.');
      } finally {
        if (!cancelled) setLookup(null);
      }
    };
    if (addresses.length > 0) void run();
    return () => { cancelled = true; };
  }, [addresses]);

  // The map, once: Leaflet needs the browser, so it loads here.
  useEffect(() => {
    let disposed = false;
    let themeObserver: MutationObserver | null = null;
    void import('leaflet').then((module) => {
      const leaflet = ((module as unknown as { default?: typeof import('leaflet') }).default ?? module) as typeof import('leaflet');
      if (disposed || !mapNode.current || mapRef.current) return;
      leafletRef.current = leaflet;
      const map = leaflet.map(mapNode.current, { zoomControl: true, scrollWheelZoom: true, worldCopyJump: true }).setView([37.5, -98.5], 4);
      const isDark = () => document.documentElement.classList.contains('dark');
      const tiles = leaflet.tileLayer(basemapUrl(isDark()), {
        maxZoom: 19,
        subdomains: 'abcd',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }).addTo(map);
      themeObserver = new MutationObserver(() => tiles.setUrl(basemapUrl(isDark())));
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      mapRef.current = map;
      bubblesRef.current = leaflet.layerGroup().addTo(map);
      setReady(true);
    });
    return () => {
      disposed = true;
      themeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  const placed = useMemo(() => withAddress.flatMap((deal) => {
    const point = points.get(addressKey(deal.address));
    return point?.matched && point.latitude != null && point.longitude != null
      ? [{ deal, latitude: point.latitude, longitude: point.longitude }]
      : [];
  }), [withAddress, points]);
  const unplaced = useMemo(() => withAddress.filter((deal) => points.get(addressKey(deal.address))?.matched === false), [withAddress, points]);
  const prices = placed.map(({ deal }) => deal.salesPrice).filter((price) => price > 0);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;

  // Bubbles: area grows with sales price. Biggest drawn first, so small ones stay clickable on top.
  const fittedFor = useRef('');
  useEffect(() => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    const group = bubblesRef.current;
    if (!ready || !leaflet || !map || !group) return;
    group.clearLayers();
    const radius = (price: number) => {
      if (maxPrice <= minPrice || price <= 0) return (MIN_RADIUS + MAX_RADIUS) / 2;
      const share = (Math.sqrt(price) - Math.sqrt(minPrice)) / (Math.sqrt(maxPrice) - Math.sqrt(minPrice));
      return MIN_RADIUS + share * (MAX_RADIUS - MIN_RADIUS);
    };
    [...placed].sort((a, b) => b.deal.salesPrice - a.deal.salesPrice).forEach(({ deal, latitude, longitude }) => {
      const color = statusColor(deal.status);
      const agents = deal.agentSplits.length
        ? deal.agentSplits.map((split) => split.name).join(', ')
        : names.get(deal.agentId) ?? '';
      const lines = [
        `<div style="font-weight:600;margin-bottom:2px">${escapeHtml(deal.address)}</div>`,
        `<div><span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${color};margin-right:6px"></span>${escapeHtml(deal.status || 'No status')}${deal.side ? ` · ${escapeHtml(deal.side)}` : ''}</div>`,
        deal.salesPrice ? `<div>Sales price ${money.format(deal.salesPrice)}</div>` : '',
        deal.closingDate ? `<div>Closing ${day.format(deal.closingDate)}</div>` : '',
        agents ? `<div>${escapeHtml(agents)}</div>` : '',
        `<a href="/commission-tracker/transactions/${encodeURIComponent(deal.id)}" style="display:inline-block;margin-top:4px;font-weight:600">Open Transaction</a>`,
      ].filter(Boolean).join('');
      leaflet.circleMarker([latitude, longitude], {
        radius: radius(deal.salesPrice),
        color,
        weight: 1,
        opacity: 0.9,
        fillColor: color,
        fillOpacity: 0.35,
      }).bindPopup(`<div style="font-size:12px;line-height:1.45">${lines}</div>`).addTo(group);
    });
    // Frame the deals when the set changes, not every time a few more addresses come in.
    const signature = `${deals.length}:${placed.length > 0}`;
    if (placed.length > 0 && fittedFor.current !== signature) {
      fittedFor.current = signature;
      map.fitBounds(leaflet.latLngBounds(placed.map(({ latitude, longitude }) => [latitude, longitude])), { padding: [32, 32], maxZoom: 13 });
    }
  }, [ready, placed, minPrice, maxPrice, names, deals.length]);

  const counts = useMemo(() => {
    const totals = { closed: 0, pending: 0, cancelled: 0, other: 0 };
    placed.forEach(({ deal }) => {
      const status = deal.status.trim().toLowerCase();
      if (status === 'closed' || status === 'pending' || status === 'cancelled') totals[status] += 1;
      else totals.other += 1;
    });
    return totals;
  }, [placed]);

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>
      ) : null}
      <div className="relative overflow-clip rounded-xl border border-slate-200 dark:border-slate-700">
        <div ref={mapNode} className="z-0 h-[min(70vh,720px)] min-h-[360px] w-full bg-slate-100 dark:bg-slate-900" aria-label="Map of transactions" />
        {lookup ? (
          <div className="pointer-events-none absolute left-1/2 top-3 z-[500] -translate-x-1/2 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-md dark:bg-slate-800/95 dark:text-slate-200">
            Placing addresses on the map… {lookup.done.toLocaleString()} of {lookup.total.toLocaleString()}
          </div>
        ) : null}
        {deals.length > 0 && withAddress.length === 0 ? (
          <div className="absolute inset-0 z-[500] flex items-center justify-center text-sm text-slate-500">These transactions have no property address.</div>
        ) : null}
        {deals.length === 0 ? (
          <div className="absolute inset-0 z-[500] flex items-center justify-center text-sm text-slate-500">No transactions match these filters.</div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-start gap-x-10 gap-y-3 px-1 text-xs text-slate-600 dark:text-slate-300">
        {prices.length > 0 ? (
          <div>
            <p className="mb-1 font-semibold text-slate-800 dark:text-slate-100">Sales Price</p>
            <div className="flex items-center gap-2 tabular-nums">
              <span>{money.format(minPrice)}</span>
              {[MIN_RADIUS, (MIN_RADIUS + MAX_RADIUS) / 2, MAX_RADIUS].map((size) => (
                <span key={size} aria-hidden className="inline-block rounded-full bg-slate-400/50 dark:bg-slate-500/60" style={{ width: size * 1.4, height: size * 1.4 }} />
              ))}
              <span>{money.format(maxPrice)}</span>
            </div>
          </div>
        ) : null}
        <div>
          <p className="mb-1 font-semibold text-slate-800 dark:text-slate-100">Status</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {([['Closed', 'closed'], ['Pending', 'pending'], ['Cancelled', 'cancelled']] as const).map(([label, key]) => (
              <span key={key} className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[key] }} />
                {label} <span className="tabular-nums text-slate-400">{counts[key].toLocaleString()}</span>
              </span>
            ))}
            {counts.other > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: OTHER_COLOR }} />
                Other <span className="tabular-nums text-slate-400">{counts.other.toLocaleString()}</span>
              </span>
            ) : null}
          </div>
        </div>
        {unplaced.length > 0 ? (
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => setShowUnplaced((open) => !open)}
              aria-expanded={showUnplaced}
              className="font-semibold text-amber-700 hover:underline dark:text-amber-400 cursor-pointer"
            >
              {unplaced.length.toLocaleString()} {unplaced.length === 1 ? 'address' : 'addresses'} could not be placed
            </button>
            {showUnplaced ? (
              <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto pr-2">
                {unplaced.map((deal) => (
                  <li key={deal.id}>
                    <a href={`/commission-tracker/transactions/${encodeURIComponent(deal.id)}`} className="hover:text-brand-700 hover:underline dark:hover:text-brand-400">
                      {deal.address}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className="px-1 text-2xs text-slate-500 dark:text-slate-400">
        Each bubble is a transaction at its property address, sized by sales price and colored by status. Click one for its details.
      </p>
    </div>
  );
}
