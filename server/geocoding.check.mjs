import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeocoder } from './geocoding.mjs';

const result = { display_name: 'A hotel, Istanbul, Türkiye', lat: '41.01', lon: '28.98' };
const validResponse = (items = [result]) => ({ ok: true, json: async () => items });

test('geocoding uses a fixed official host, Istanbul bounds, and an encoded submitted query', async () => {
  let requested, options;
  const geocoder = createGeocoder({ fetchImpl: async (url, init) => { requested = new URL(url); options = init; return validResponse(); } });
  const results = await geocoder.search(' Hotel & Breakfast, İstanbul ');
  assert.equal(requested.origin, 'https://nominatim.openstreetmap.org');
  assert.equal(requested.pathname, '/search');
  assert.equal(requested.searchParams.get('q'), 'Hotel & Breakfast, İstanbul');
  assert.equal(requested.searchParams.get('viewbox'), '28.4,41.4,29.5,40.75');
  assert.equal(requested.searchParams.get('bounded'), '1');
  assert.equal(requested.searchParams.get('countrycodes'), 'tr');
  assert.equal(requested.searchParams.get('accept-language'), 'en');
  assert.equal(requested.searchParams.get('limit'), '5');
  assert.match(options.headers['User-Agent'], /TravelBuddy/);
  assert.equal(results[0].coordinate.lat, 41.01);
});

test('invalid or excessive queries fail before any request', async () => {
  let calls = 0;
  const geocoder = createGeocoder({ fetchImpl: async () => { calls++; return validResponse(); } });
  for (const query of [undefined, null, 123, '  ', 'ab', 'x'.repeat(201)]) await assert.rejects(geocoder.search(query), /between3 and200/);
  assert.equal(calls, 0);
});

test('filters invalid coordinates and foreign results, caps returned records and labels', async () => {
  const raw = [
    { ...result, lat: 'NaN' }, { ...result, lat: '51.5', lon: '-0.12' }, { ...result, display_name: '' },
    ...Array.from({ length: 8 }, (_, i) => ({ ...result, display_name: String(i) + 'x'.repeat(300) })),
  ];
  const geocoder = createGeocoder({ fetchImpl: async () => validResponse(raw) });
  const results = await geocoder.search('A hotel');
  assert.equal(results.length, 5);
  assert.equal(results.every(item => item.label.length === 200 && item.coordinate.lat === 41.01), true);
});

test('caches successful equivalent queries for an hour, then requests fresh results', async () => {
  let now = 1_000_000, calls = 0;
  const geocoder = createGeocoder({ now: () => now, fetchImpl: async () => { calls++; return validResponse(); } });
  await geocoder.search('A Hotel'); await geocoder.search(' a hotel ');
  assert.equal(calls, 1);
  now += 3_600_000;
  await geocoder.search('A Hotel'); assert.equal(calls, 2);
});

test('serializes searches with at least one second between upstream requests', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 1_000_000;
  const requestTimes = [];
  const geocoder = createGeocoder({ now: () => now, fetchImpl: async () => { requestTimes.push(now); return validResponse(); } });
  await geocoder.search('First hotel');
  const second = geocoder.search('Second hotel');
  await Promise.resolve(); await Promise.resolve();
  assert.equal(requestTimes.length, 1);
  now += 999; context.mock.timers.tick(999);
  await Promise.resolve(); assert.equal(requestTimes.length, 1);
  now += 1; context.mock.timers.tick(1);
  await second;
  assert.deepEqual(requestTimes, [1_000_000, 1_001_000]);
});

test('HTTP, malformed, and network failures do not poison the queue or become cached results', async () => {
  let now = 1_000_000, calls = 0;
  const geocoder = createGeocoder({ now: () => now, fetchImpl: async () => {
    calls++;
    if (calls === 1) return { ok: false };
    if (calls === 2) return validResponse({ results: [] });
    if (calls === 3) throw new Error('Network unavailable');
    return validResponse();
  } });
  await assert.rejects(geocoder.search('Same hotel'), /Address search is unavailable/);
  now += 1000;
  await assert.rejects(geocoder.search('Same hotel'), /Invalid address response/);
  now += 1000;
  await assert.rejects(geocoder.search('Same hotel'), /Network unavailable/);
  now += 1000;
  assert.equal((await geocoder.search('Same hotel')).length, 1);
  assert.equal(calls, 4);
});
