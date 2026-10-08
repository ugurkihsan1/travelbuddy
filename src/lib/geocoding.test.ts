import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasAddressSearch, searchAccommodation } from './geocoding';

const ADDRESS = { label: '  Example hotel, Beyoğlu  ', coordinate: { lat: 41.033, lng: 28.977 } };

function mockResponse(payload: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function mockPendingRequest() {
  const fetchMock = vi.fn().mockImplementation((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('accommodation address search', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('location', { protocol: 'https:' });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('searches only when explicitly called and safely encodes the trimmed query', async () => {
    const fetchMock = mockResponse({ results: [ADDRESS] });
    expect(hasAddressSearch()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    const result = await searchAccommodation('  Şişli hotel & café  ');
    expect(result).toEqual({ status: 'available', results: [{ ...ADDRESS, label: ADDRESS.label.trim() }] });
    const [url, options] = fetchMock.mock.calls[0];
    const endpoint = new URL(url, 'https://travelbuddy.test');
    expect(endpoint.pathname).toBe('/api/geocode');
    expect(endpoint.searchParams.get('q')).toBe('Şişli hotel & café');
    expect(options.cache).toBe('no-store');
    expect(options.headers).toEqual({ Accept: 'application/json' });
  });

  it('does not make requests in a standalone file', async () => {
    vi.stubGlobal('location', { protocol: 'file:' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(hasAddressSearch()).toBe(false);
    expect(await searchAccommodation('hotel')).toMatchObject({ status: 'unavailable', results: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('supports window-only runtime detection and node tests without browser globals', () => {
    vi.stubGlobal('location', undefined);
    vi.stubGlobal('window', { location: { protocol: 'file:' } });
    expect(hasAddressSearch()).toBe(false);
    vi.stubGlobal('window', undefined);
    expect(hasAddressSearch()).toBe(true);
  });

  it.each(['', '  ', ' ab '])('rejects a short query without fetching: %j', async query => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await searchAccommodation(query)).toMatchObject({ status: 'error', results: [], message: expect.stringContaining('at least 3') });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns at most five addresses and does not invent results', async () => {
    mockResponse({ results: Array.from({ length: 7 }, (_, index) => ({ ...ADDRESS, label: `Hotel ${index}` })) });
    expect((await searchAccommodation('hotel')).results).toHaveLength(5);
    mockResponse({ results: [] });
    expect(await searchAccommodation('missing hotel')).toMatchObject({ status: 'available', results: [], message: expect.stringContaining('No matching') });
  });

  it.each([
    null,
    {},
    { results: 'invalid' },
    { results: [null] },
    { results: [{ ...ADDRESS, label: '  ' }] },
    { results: [{ ...ADDRESS, coordinate: null }] },
    { results: [{ ...ADDRESS, coordinate: { lat: '41', lng: 29 } }] },
    { results: [{ ...ADDRESS, coordinate: { lat: 40.749, lng: 29 } }] },
    { results: [{ ...ADDRESS, coordinate: { lat: 41.401, lng: 29 } }] },
    { results: [{ ...ADDRESS, coordinate: { lat: 41, lng: 28.399 } }] },
    { results: [{ ...ADDRESS, coordinate: { lat: 41, lng: 29.501 } }] },
    { results: [ADDRESS, { ...ADDRESS, coordinate: { lat: null, lng: 29 } }] },
  ])('rejects malformed or out-of-city address results: %j', async payload => {
    mockResponse(payload);
    expect(await searchAccommodation('hotel')).toMatchObject({ status: 'error', results: [], message: expect.stringContaining('invalid address data') });
  });

  it('rejects nonfinite coordinates even when provided by a custom response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{ ...ADDRESS, coordinate: { lat: NaN, lng: Infinity } }] }) }));
    expect((await searchAccommodation('hotel')).status).toBe('error');
  });

  it('accepts the inclusive Istanbul coordinate bounds', async () => {
    mockResponse({ results: [{ label: 'West', coordinate: { lat: 40.75, lng: 28.4 } }, { label: 'East', coordinate: { lat: 41.4, lng: 29.5 } }] });
    expect((await searchAccommodation('hotel')).status).toBe('available');
  });

  it('reports invalid JSON and HTTP or network failure visibly', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('not JSON'))
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await searchAccommodation('hotel')).toMatchObject({ status: 'error', message: expect.stringContaining('invalid address data') });
    expect(await searchAccommodation('hotel')).toMatchObject({ status: 'error', message: expect.stringContaining('unavailable') });
    expect(await searchAccommodation('hotel')).toMatchObject({ status: 'error', message: expect.stringContaining('Could not reach') });
  });

  it('does not request an already cancelled search', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await searchAccommodation('hotel', controller.signal)).toMatchObject({ status: 'error', message: 'Address search cancelled.' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts an in-flight request when the caller cancels', async () => {
    const fetchMock = mockPendingRequest();
    const controller = new AbortController();
    const pending = searchAccommodation('hotel', controller.signal);
    controller.abort();
    expect(await pending).toMatchObject({ status: 'error', message: 'Address search cancelled.' });
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out after ten seconds and cleans up the request timer', async () => {
    const fetchMock = mockPendingRequest();
    const pending = searchAccommodation('hotel');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toMatchObject({ status: 'error', message: expect.stringContaining('took too long') });
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
