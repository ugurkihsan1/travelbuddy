import type { Coordinate } from '../types';

export type AccommodationResult = { label: string; coordinate: Coordinate };
export type AccommodationSearch = {
  status: 'available' | 'unavailable' | 'error';
  results: AccommodationResult[];
  message?: string;
};

const INVALID_RESPONSE = 'The address service returned invalid address data. Please try again.';

export function hasAddressSearch(): boolean {
  const protocol = globalThis.location?.protocol ?? globalThis.window?.location?.protocol ?? 'http:';
  return (protocol === 'http:' || protocol === 'https:') && !(typeof document !== 'undefined' && document.querySelector('meta[name="travelbuddy-preview"]'));
}

function validateResults(payload: unknown): AccommodationResult[] {
  if (!payload || typeof payload !== 'object' || !('results' in payload) || !Array.isArray(payload.results)) {
    throw new Error(INVALID_RESPONSE);
  }
  return payload.results.map((value: unknown) => {
    if (!value || typeof value !== 'object' || !('label' in value) || typeof value.label !== 'string' || !value.label.trim() || !('coordinate' in value)) {
      throw new Error(INVALID_RESPONSE);
    }
    const coordinate = value.coordinate;
    if (!coordinate || typeof coordinate !== 'object' || !('lat' in coordinate) || !('lng' in coordinate)
      || typeof coordinate.lat !== 'number' || typeof coordinate.lng !== 'number'
      || !Number.isFinite(coordinate.lat) || !Number.isFinite(coordinate.lng)
      || coordinate.lat < 40.75 || coordinate.lat > 41.4 || coordinate.lng < 28.4 || coordinate.lng > 29.5) {
      throw new Error(INVALID_RESPONSE);
    }
    return { label: value.label.trim(), coordinate: { lat: coordinate.lat, lng: coordinate.lng } };
  }).slice(0, 5);
}

export async function searchAccommodation(query: string, signal?: AbortSignal): Promise<AccommodationSearch> {
  if (!hasAddressSearch()) {
    return { status: 'unavailable', results: [], message: 'Address search requires the online app. Choose an area or use your location instead.' };
  }
  const trimmed = query.trim();
  if (trimmed.length < 3) {
    return { status: 'error', results: [], message: 'Enter at least 3 characters to search for an address.' };
  }
  if (signal?.aborted) {
    return { status: 'error', results: [], message: 'Address search cancelled.' };
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  let timedOut = false;
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 10_000);
  try {
    const response = await fetch(`/api/geocode?${new URLSearchParams({ q: trimmed })}`, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('Address search is unavailable right now. Please try again.');
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new Error(INVALID_RESPONSE);
    }
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const results = validateResults(payload);
    return { status: 'available', results, ...(results.length === 0 ? { message: 'No matching addresses in Istanbul. Try a hotel name or a more complete address.' } : {}) };
  } catch (error) {
    const message = signal?.aborted ? 'Address search cancelled.'
      : timedOut ? 'Address search took too long. Please try again.'
      : error instanceof Error && (error.message === INVALID_RESPONSE || error.message.startsWith('Address search is unavailable'))
        ? error.message : 'Could not reach address search. Please try again.';
    return { status: 'error', results: [], message };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
