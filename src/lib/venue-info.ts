import { venuePrices } from '../data/venue-prices';
import venueHours from '../data/venue-hours.json';
import type { VenueInfo, VenuePrice, VenueHours } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const runtimeCache = new Map<string, VenueInfo>();
function validHours(value: unknown): VenueHours {
  if (!value || typeof value !== 'object') return {status:'unverified'};
  const h = value as VenueHours;
  if (h.status !== 'verified' || !h.checkedAt || !Number.isFinite(Date.parse(h.checkedAt)) || Date.parse(h.checkedAt) > Date.now() || Date.now()-Date.parse(h.checkedAt)>=DAY_MS || !h.sourceUrl?.startsWith('https://') || !Array.isArray(h.windows)) return {status:'unverified'};
  const clock = (v:unknown) => typeof v === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
  if (h.windows.some(w => !Array.isArray(w.weekdays) || w.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6) || !clock(w.open) || !clock(w.close) || w.open>=w.close)) return {status:'unverified'};
  return h;
}

function agedPrice(price: VenuePrice): VenuePrice {
  const timestamp = Date.parse(price.verifiedAt ?? '');
  return price.status === 'verified' && (!Number.isFinite(timestamp) || Date.now() - timestamp >= DAY_MS)
    ? { ...price, status: 'stale', error: 'This saved price was last verified more than 24 hours ago.' }
    : { ...price };
}

export function getCachedVenueInfo(placeId: string): VenueInfo {
  const saved = runtimeCache.get(placeId);
  const price = saved?.price ?? venuePrices[placeId] ?? {
    status: 'unavailable' as const, label: 'Official adult entry price not yet verified', sourceUrl: 'https://muze.gov.tr/',
  };
  return { placeId, price: agedPrice(price), hours:validHours(saved?.hours ?? (venueHours as Record<string,unknown>)[placeId]), ...(saved?.photo ? { photo: saved.photo } : {}) };
}

function endpoint(): string {
  const configured: unknown = import.meta.env.VITE_VENUE_API_URL;
  if (typeof configured === 'string' && configured.trim()) return configured.trim().replace(/\/$/, '');
  return location.protocol === 'file:' || document.querySelector('meta[name="travelbuddy-preview"]') ? '' : '/api/venues';
}

function validateVenue(value: unknown): VenueInfo {
  if (!value || typeof value !== 'object') throw new Error('Invalid venue response.');
  const venue = value as VenueInfo;
  const price = venue.price;
  if (typeof venue.placeId !== 'string' || !price || typeof price !== 'object' || !['verified', 'unavailable', 'free', 'stale'].includes(price.status) || typeof price.label !== 'string' || typeof price.sourceUrl !== 'string') throw new Error('Invalid venue response.');
  if (price.amount !== undefined && (!Number.isFinite(price.amount) || price.amount < 0 || !price.currency || !['TRY', 'EUR', 'USD'].includes(price.currency))) throw new Error('Invalid venue amount.');
  if (price.status === 'verified' && (price.amount === undefined || !Number.isFinite(Date.parse(price.verifiedAt ?? '')))) throw new Error('A verified price needs an amount and verification time.');
  if (!/^https:\/\//.test(price.sourceUrl)) throw new Error('Invalid official source URL.');
  const photo = venue.photo;
  const validPhoto = photo && typeof photo.url === 'string' && /^https:\/\/(?:upload|thumb)\.wikimedia\.org\//.test(photo.url) && ['title','author','license','sourceUrl'].every(key => typeof photo[key as keyof typeof photo] === 'string') && /^https:\/\/commons\.wikimedia\.org\//.test(photo.sourceUrl);
  return { placeId: venue.placeId, price: agedPrice(price), hours:validHours(venue.hours), ...(validPhoto ? { photo } : {}) };
}

function fallback(placeId: string, reason: string): VenueInfo {
  const venue = getCachedVenueInfo(placeId);
  if (venue.price.status === 'free') return venue;
  return { ...venue, price: { ...venue.price, error: reason } };
}

export async function loadAllVenueInfo(signal?: AbortSignal): Promise<VenueInfo[]> {
  const api = endpoint();
  if (!api) return Object.keys(venuePrices).map(id => fallback(id, 'Saved official-source price. Daily refresh requires the venue information service.'));
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 45_000);
  try {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const response = await fetch(api, { signal: controller.signal, cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('The venue information service could not be reached.');
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || !('venues' in payload) || !Array.isArray(payload.venues)) throw new Error('Invalid venue information response.');
    const venues = payload.venues.map(validateVenue);
    const received = new Map(venues.map(venue => [venue.placeId, venue]));
    return Object.keys(venuePrices).map(id => {
      const venue = received.get(id);
      if (!venue) return fallback(id, 'The current official price is unavailable.');
      runtimeCache.set(id, venue);
      return venue;
    });
  } catch {
    return Object.keys(venuePrices).map(id => fallback(id, 'Daily price refresh is unavailable. Showing the last saved official-source information.'));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export async function loadVenueInfo(placeId: string, signal?: AbortSignal): Promise<VenueInfo> {
  const venues = await loadAllVenueInfo(signal);
  return venues.find(venue => venue.placeId === placeId) ?? getCachedVenueInfo(placeId);
}
