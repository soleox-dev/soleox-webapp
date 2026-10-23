'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Map as LeafletMap, LayerGroup, TileLayer } from 'leaflet';
import { Maximize2, Minimize2 } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import type { ReportDeal } from '@/lib/owner-reports';
import type { AddressPoint } from '@/app/api/geocode/addresses/route';

/** Bubble colors by status: emerald closed, amber pending, rose cancelled (CLAUDE.md color roles). */
const STATUS_COLORS: Record<string, string> = {
  Closed: '#10b981',
  Pending: '#f59e0b',
  Cancelled: '#f43f5e',
};
const OTHER_COLOR = '#64748b';
/** Colors for Side and Agent, given out by how many deals each has; the rest share Other. */
const PALETTE = ['#0ea5e9', '#8b5cf6', '#f97316', '#14b8a6', '#ec4899', '#84cc16', '#6366f1', '#eab308'];
const MIN_RADIUS = 5;
const MAX_RADIUS = 22;

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

type ColorBy = 'status' | 'side' | 'agent';
const COLOR_BY: Array<{ id: ColorBy; label: string }> = [
  { id: 'status', label: 'Status' },
  { id: 'side', label: 'Side' },
  { id: 'agent', label: 'Agent' },
];

type Placed = { deal: ReportDeal; latitude: number; longitude: number };
type Category = { key: string; color: string; count: number };

function addressKey(address: string): string {
  return address.trim().replace(/\s+/g, ' ').toLowerCase();
}

function statusLabel(status: string): string {
  const key = status.trim().toLowerCase();
  return key === 'closed' ? 'Closed' : key === 'pending' ? 'Pending' : key === 'cancelled' ? 'Cancelled' : 'Other';
}

/** "84 Aliso Creek Rd, Laguna Niguel, CA 92677" → "Laguna Niguel, CA". */
function cityOf(address: string): string {
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 3) return '';
  const state = parts[parts.length - 1].match(/^[A-Za-z]{2}/)?.[0]?.toUpperCase();
  return state ? `${parts[parts.length - 2]}, ${state}` : parts[parts.length - 2];
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

/**
 * Stadia Maps' Alidade Smooth tiles: muted, so the bubbles stand out, with a matching dark style for dark mode.
 * Local development needs no key. Deployed sites are allowed by domain in the Stadia dashboard, or with
 * NEXT_PUBLIC_STADIA_API_KEY.
 */
function basemapUrl(dark: boolean): string {
  const key = process.env.NEXT_PUBLIC_STADIA_API_KEY;
  return `https://tiles.stadiamaps.com/tiles/${dark ? 'alidade_smooth_dark' : 'alidade_smooth'}/{z}/{x}/{y}{r}.png${key ? `?api_key=${encodeURIComponent(key)}` : ''}`;
}

function useDarkTheme(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setDark(root.classList.contains('dark'));
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

/**
 * Transaction Map (Owner Reports): one bubble per deal at its property address, sized by sales price and colored by
 * status, side or agent. Coordinates come from /api/geocode/addresses, which looks up addresses it has not seen with
 * the free US Census geocoder and saves them, so each address is looked up once.
 */
export function TransactionMapReport({ deals, names }: { deals: ReportDeal[]; names: Map<string, string> }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const tilesRef = useRef<TileLayer | null>(null);
  const bubblesRef = useRef<LayerGroup | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const dark = useDarkTheme();
  const [ready, setReady] = useState(false);
  const [points, setPoints] = useState<Map<string, AddressPoint>>(() => new Map());
  const [lookup, setLookup] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [showUnplaced, setShowUnplaced] = useState(false);
  // False: frame the densest group of deals. True: frame every bubble.
  const [showAll, setShowAll] = useState(false);
  const [colorBy, setColorBy] = useState<ColorBy>('status');
  // Legend entries switched off; they come back when Color By changes.
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [activeArea, setActiveArea] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

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
    void import('leaflet').then((module) => {
      const leaflet = ((module as unknown as { default?: typeof import('leaflet') }).default ?? module) as typeof import('leaflet');
      if (disposed || !mapNode.current || mapRef.current) return;
      leafletRef.current = leaflet;
      const map = leaflet.map(mapNode.current, { zoomControl: true, scrollWheelZoom: true, worldCopyJump: true }).setView([37.5, -98.5], 4);
      tilesRef.current = leaflet.tileLayer(basemapUrl(document.documentElement.classList.contains('dark')), {
        maxZoom: 20,
        attribution: '&copy; <a href="https://stadiamaps.com/" target="_blank" rel="noreferrer">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).addTo(map);
      map.attributionControl.setPrefix(false);
      mapRef.current = map;
      bubblesRef.current = leaflet.layerGroup().addTo(map);
      setReady(true);
    });
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Light or dark tiles with the app theme.
  useEffect(() => {
    tilesRef.current?.setUrl(basemapUrl(dark));
  }, [dark, ready]);

  // Full screen: the map frame covers the window (CSS, not the browser's element full screen, which leaves the tiles
  // undrawn in some browsers and does not exist for non-video elements on iPhone). Where the browser allows it, the
  // whole page also goes full screen so the map fills the display. Esc, or leaving the browser's full screen, closes it.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false);
    };
    const onChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    const html = document.documentElement;
    const previousOverflow = html.style.overflow;
    html.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      html.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [fullscreen]);
  // Leaflet re-measures whenever the map's box changes size: opening or closing full screen, turning the phone,
  // resizing the window.
  useEffect(() => {
    const node = mapNode.current;
    if (!node || !ready) return;
    const observer = new ResizeObserver(() => mapRef.current?.invalidateSize());
    observer.observe(node);
    return () => observer.disconnect();
  }, [ready]);
  const toggleFullscreen = () => {
    if (fullscreen) {
      setFullscreen(false);
      return;
    }
    setFullscreen(true);
    // Optional: not every browser allows it (iPhone), and the map still covers the window without it.
    document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const placed = useMemo<Placed[]>(() => withAddress.flatMap((deal) => {
    const point = points.get(addressKey(deal.address));
    return point?.matched && point.latitude != null && point.longitude != null
      ? [{ deal, latitude: point.latitude, longitude: point.longitude }]
      : [];
  }), [withAddress, points]);
  const unplaced = useMemo(() => withAddress.filter((deal) => points.get(addressKey(deal.address))?.matched === false), [withAddress, points]);
  const prices = placed.map(({ deal }) => deal.salesPrice).filter((price) => price > 0);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;

  // Legend groups for the Color By choice, largest first; Status keeps its fixed order and colors.
  const rawCategory = (deal: ReportDeal): string => (
    colorBy === 'status' ? statusLabel(deal.status)
      : colorBy === 'side' ? deal.side.trim() || 'No Side'
        : names.get(deal.agentId) || 'No Agent'
  );
  const categories = useMemo<Category[]>(() => {
    const counts = new Map<string, number>();
    placed.forEach(({ deal }) => counts.set(rawCategory(deal), (counts.get(rawCategory(deal)) || 0) + 1));
    if (colorBy === 'status') {
      return ['Closed', 'Pending', 'Cancelled', 'Other']
        .filter((key) => key !== 'Other' || counts.has('Other'))
        .map((key) => ({ key, color: STATUS_COLORS[key] ?? OTHER_COLOR, count: counts.get(key) || 0 }));
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const named = ranked.slice(0, PALETTE.length).map(([key, count], index) => ({ key, color: PALETTE[index], count }));
    const rest = ranked.slice(PALETTE.length).reduce((total, [, count]) => total + count, 0);
    return rest > 0 ? [...named, { key: 'Other', color: OTHER_COLOR, count: rest }] : named;
  }, [placed, colorBy, names]);
  const categoryOf = (deal: ReportDeal): Category => {
    const key = rawCategory(deal);
    return categories.find((item) => item.key === key) ?? categories.find((item) => item.key === 'Other') ?? { key: 'Other', color: OTHER_COLOR, count: 0 };
  };
  useEffect(() => setHidden(new Set()), [colorBy]);
  const visible = useMemo(() => placed.filter(({ deal }) => !hidden.has(categoryOf(deal).key)),
    [placed, hidden, categories]);

  // Bubbles: area grows with sales price. Biggest drawn first, so small ones stay clickable on top.
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
    [...visible].sort((a, b) => b.deal.salesPrice - a.deal.salesPrice).forEach(({ deal, latitude, longitude }) => {
      const { color } = categoryOf(deal);
      const status = statusLabel(deal.status);
      const statusColor = STATUS_COLORS[status] ?? OTHER_COLOR;
      const agents = deal.agentSplits.length
        ? deal.agentSplits.map((split) => split.name).join(', ')
        : names.get(deal.agentId) ?? '';
      const fact = (label: string, value: string) => `<div style="display:flex;justify-content:space-between;gap:12px"><span style="opacity:.65">${label}</span><span style="font-weight:500">${value}</span></div>`;
      const card = [
        `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><span style="display:inline-flex;align-items:center;gap:5px;border-radius:9999px;padding:1px 8px;font-size:11px;font-weight:600;background:${statusColor}22;color:${statusColor}"><span style="width:6px;height:6px;border-radius:9999px;background:${statusColor}"></span>${escapeHtml(deal.status || 'No Status')}</span>${deal.side ? `<span style="font-size:11px;opacity:.65">${escapeHtml(deal.side)}</span>` : ''}</div>`,
        `<div style="font-weight:600;font-size:13px;line-height:1.35;margin-bottom:4px">${escapeHtml(deal.address)}</div>`,
        deal.salesPrice ? `<div style="font-size:20px;font-weight:700;margin-bottom:6px">${money.format(deal.salesPrice)}</div>` : '',
        `<div style="display:grid;gap:2px;font-size:12px">`,
        deal.gciAmount ? fact('GCI', money.format(deal.gciAmount)) : '',
        deal.closingDate ? fact('Closing', day.format(deal.closingDate)) : '',
        agents ? fact('Agent', escapeHtml(agents)) : '',
        deal.clientName ? fact('Client', escapeHtml(deal.clientName)) : '',
        `</div>`,
        `<a href="/commission-tracker/transactions/${encodeURIComponent(deal.id)}" style="display:block;margin-top:10px;border-radius:8px;padding:6px 0;text-align:center;font-size:12px;font-weight:600;background:#0284c7;color:#fff;text-decoration:none">Open Transaction</a>`,
      ].filter(Boolean).join('');
      const marker = leaflet.circleMarker([latitude, longitude], {
        radius: radius(deal.salesPrice),
        color,
        weight: 1.5,
        opacity: 0.95,
        fillColor: color,
        fillOpacity: 0.4,
        className: status === 'Pending' ? 'map-bubble-pulse' : undefined,
      });
      marker
        .bindPopup(`<div style="font-size:12px;line-height:1.45">${card}</div>`, { closeButton: false, offset: [0, -4] })
        .bindTooltip(`<div style="font-size:12px"><span style="font-weight:600">${deal.salesPrice ? compact.format(deal.salesPrice) : '—'}</span> · ${escapeHtml(deal.address.split(',')[0])}</div>`, { direction: 'top', offset: [0, -6], opacity: 1 })
        .on('mouseover', () => { marker.setStyle({ weight: 3, fillOpacity: 0.7 }); marker.bringToFront(); })
        .on('mouseout', () => marker.setStyle({ weight: 1.5, fillOpacity: 0.4 }))
        .addTo(group);
    });
  }, [ready, visible, minPrice, maxPrice, names, categories]);

  // The densest group of deals: the 1°-square grid cell (about 100 km) holding the most, with its eight neighbors.
  // The map opens on it so a few far-off deals do not zoom it out; Show All frames every bubble.
  const focused = useMemo(() => {
    if (placed.length === 0) return placed;
    const cellOf = (latitude: number, longitude: number) => `${Math.floor(latitude)}:${Math.floor(longitude)}`;
    const perCell = new Map<string, number>();
    placed.forEach(({ latitude, longitude }) => {
      const cell = cellOf(latitude, longitude);
      perCell.set(cell, (perCell.get(cell) || 0) + 1);
    });
    const [best] = [...perCell.entries()].sort((a, b) => b[1] - a[1])[0];
    const [bestLat, bestLng] = best.split(':').map(Number);
    return placed.filter(({ latitude, longitude }) => (
      Math.abs(Math.floor(latitude) - bestLat) <= 1 && Math.abs(Math.floor(longitude) - bestLng) <= 1
    ));
  }, [placed]);
  const outsideFocus = placed.length - focused.length;

  const frame = (rows: Placed[], animate: boolean) => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    if (!leaflet || !map || rows.length === 0) return;
    const bounds = leaflet.latLngBounds(rows.map(({ latitude, longitude }) => [latitude, longitude]));
    // Room above for the Color By and Show All controls, and below for the legend.
    const options = { paddingTopLeft: [40, 64] as [number, number], paddingBottomRight: [40, 120] as [number, number], maxZoom: 14 };
    if (animate) map.flyToBounds(bounds, { ...options, duration: 0.8 });
    else map.fitBounds(bounds, options);
  };

  // Frames the view when the deals change, when the lookups finish, or when the view mode changes; not each time a
  // few more addresses come in. The first framing jumps; later ones glide.
  const fittedFor = useRef('');
  useEffect(() => {
    if (!ready) return;
    const shown = showAll ? placed : focused;
    const signature = `${deals.length}:${showAll}:${lookup === null}:${shown.length > 0}`;
    if (shown.length === 0 || fittedFor.current === signature) return;
    const first = fittedFor.current === '';
    fittedFor.current = signature;
    setActiveArea(null);
    frame(shown, !first);
  }, [ready, placed, focused, showAll, lookup, deals.length]);

  // Top Areas: cities by deal count, with their volume. Clicking one glides the map to it.
  const areas = useMemo(() => {
    const byCity = new Map<string, { rows: Placed[]; volume: number }>();
    visible.forEach((row) => {
      const city = cityOf(row.deal.address);
      if (!city) return;
      const entry = byCity.get(city) ?? { rows: [], volume: 0 };
      entry.rows.push(row);
      entry.volume += row.deal.salesPrice;
      byCity.set(city, entry);
    });
    return [...byCity.entries()]
      .map(([city, entry]) => ({ city, ...entry }))
      .sort((a, b) => b.rows.length - a.rows.length || b.volume - a.volume)
      .slice(0, 10);
  }, [visible]);
  const topCount = areas[0]?.rows.length || 1;

  const volume = visible.reduce((total, { deal }) => total + deal.salesPrice, 0);
  const gci = visible.reduce((total, { deal }) => total + deal.gciAmount, 0);
  const pricedCount = visible.filter(({ deal }) => deal.salesPrice > 0).length;

  const overlayButton = 'press inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:bg-white dark:border-slate-600 dark:bg-slate-800/95 dark:text-slate-200 dark:hover:bg-slate-700';
  const showAllButton = placed.length > 0 && (outsideFocus > 0 || showAll) ? (
    <button type="button" onClick={() => setShowAll((current) => !current)} aria-pressed={showAll} className={overlayButton}>
      {showAll ? 'Focus on Most Deals' : 'Show All'}
    </button>
  ) : null;

  return (
    <div className="transaction-map space-y-3">
      {error ? (
        <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        {[
          { label: 'On the Map', value: visible.length.toLocaleString(), hint: placed.length !== withAddress.length ? `of ${withAddress.length.toLocaleString()} with an address` : 'Every address placed' },
          { label: 'Sales Volume', value: money.format(volume), hint: 'Deals on the map' },
          { label: 'Avg. Sales Price', value: pricedCount ? money.format(volume / pricedCount) : '—', hint: 'Deals with a price' },
          { label: 'GCI', value: money.format(gci), hint: 'Deals on the map' },
        ].map((tile) => (
          <div key={tile.label} className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{tile.label}</p>
            <p className="mt-0.5 truncate text-xl font-bold tabular-nums">{tile.value}</p>
            <p className="truncate text-2xs text-slate-400">{tile.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div ref={frameRef} className={`isolate overflow-clip bg-slate-100 dark:bg-slate-900 ${fullscreen ? 'fixed inset-0 z-[200]' : 'relative rounded-xl border border-slate-200 dark:border-slate-700'}`}>
          {/* The height lives on this wrapper: Leaflet adds its own classes to the map element, and React would wipe them
              (and with them the tiles) if that element's className ever changed. */}
          <div className={`relative z-0 w-full ${fullscreen ? 'h-dvh' : 'h-[min(70vh,720px)] min-h-[360px]'}`}>
            <div ref={mapNode} className="absolute inset-0" aria-label="Map of transactions" />
          </div>

          <div className="absolute left-14 top-3 z-[500] flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white/95 p-0.5 shadow-sm backdrop-blur dark:border-slate-600 dark:bg-slate-800/95" role="group" aria-label="Color By">
            {/* Phones drop the label (the group keeps it for screen readers) so Full Screen fits on the same row. */}
            <span className="px-2 text-2xs font-medium text-slate-500 max-sm:hidden dark:text-slate-400">Color By</span>
            {COLOR_BY.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={colorBy === option.id}
                onClick={() => setColorBy(option.id)}
                className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-semibold transition ${colorBy === option.id ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'}`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Top right: Full Screen, with Show All and the outside count beside it from md. Phones have no Show All
              (their map frames where most deals are), so Full Screen stays in the corner on the Color By row. */}
          <div className="absolute right-3 top-3 z-[500] flex items-center gap-2">
            {placed.length > 0 && !showAll && outsideFocus > 0 ? (
              <span className="hidden rounded-full bg-white/95 px-2.5 py-1 text-2xs md:inline font-medium text-slate-600 shadow-sm dark:bg-slate-800/95 dark:text-slate-300">
                {outsideFocus.toLocaleString()} outside this view
              </span>
            ) : null}
            {showAllButton ? <span className="max-md:hidden">{showAllButton}</span> : null}
            <button type="button" onClick={toggleFullscreen} className={overlayButton} aria-label={fullscreen ? 'Exit Full Screen' : 'Full Screen'} title={fullscreen ? 'Exit Full Screen' : 'Full Screen'}>
              {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          </div>

          {categories.length > 0 ? (
            <div className="absolute bottom-6 left-3 z-[500] max-w-[calc(100%-1.5rem)] rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur dark:border-slate-600 dark:bg-slate-800/95">
              <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
                {categories.map((item) => {
                  const off = hidden.has(item.key);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      aria-pressed={!off}
                      title={off ? `Show ${item.key}` : `Hide ${item.key}`}
                      onClick={() => setHidden((current) => {
                        const next = new Set(current);
                        if (next.has(item.key)) next.delete(item.key);
                        else next.add(item.key);
                        return next;
                      })}
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-0.5 text-xs transition hover:bg-slate-100 dark:hover:bg-slate-700 ${off ? 'opacity-40 line-through' : 'text-slate-700 dark:text-slate-200'}`}
                    >
                      <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                      {item.key}
                      <span className="tabular-nums text-slate-400">{item.count.toLocaleString()}</span>
                    </button>
                  );
                })}
              </div>
              {prices.length > 0 ? (
                <div className="mt-1.5 flex items-center gap-2 border-t border-slate-100 pt-1.5 text-2xs tabular-nums text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <span>{compact.format(minPrice)}</span>
                  {[MIN_RADIUS, (MIN_RADIUS + MAX_RADIUS) / 2, MAX_RADIUS].map((size) => (
                    <span key={size} aria-hidden className="inline-block rounded-full border border-slate-400/70 bg-slate-400/25" style={{ width: size * 1.2, height: size * 1.2 }} />
                  ))}
                  <span>{compact.format(maxPrice)}</span>
                  <span className="ml-1">Sales Price</span>
                </div>
              ) : null}
            </div>
          ) : null}

          {lookup ? (
            <div className="pointer-events-none absolute bottom-6 right-3 z-[500] rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-md dark:bg-slate-800/95 dark:text-slate-200">
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

        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <p className="rounded-t-xl border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold dark:border-slate-800 dark:bg-slate-800/60">Top Areas</p>
          {areas.length === 0 ? (
            <p className="px-4 py-6 text-xs text-slate-500">No deals on the map yet.</p>
          ) : (
            <ol className="p-1.5">
              {areas.map((area, index) => (
                <li key={area.city}>
                  <button
                    type="button"
                    onClick={() => { setActiveArea(area.city); frame(area.rows, true); }}
                    className={`group w-full cursor-pointer rounded-lg px-2.5 py-2 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800 ${activeArea === area.city ? 'bg-brand-50 ring-1 ring-brand-200 dark:bg-brand-950/40 dark:ring-brand-800' : ''}`}
                  >
                    <span className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate font-medium text-slate-800 dark:text-slate-100">
                        <span className="mr-1.5 tabular-nums text-slate-400">{index + 1}.</span>{area.city}
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">{area.rows.length.toLocaleString()} · {compact.format(area.volume)}</span>
                    </span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <span className="block h-full rounded-full bg-brand-500/80" style={{ width: `${Math.max(6, (area.rows.length / topCount) * 100)}%` }} />
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {unplaced.length > 0 ? (
        <div className="min-w-0 px-1 text-xs">
          <button
            type="button"
            onClick={() => setShowUnplaced((open) => !open)}
            aria-expanded={showUnplaced}
            className="cursor-pointer font-semibold text-amber-700 hover:underline dark:text-amber-400"
          >
            {unplaced.length.toLocaleString()} {unplaced.length === 1 ? 'address' : 'addresses'} could not be placed
          </button>
          {showUnplaced ? (
            <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto pr-2 text-slate-600 dark:text-slate-300">
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
  );
}
