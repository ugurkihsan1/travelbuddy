import test from 'node:test';
import assert from 'node:assert/strict';
import { createHoursService, hoursSources, parseOfficialHours } from './opening-hours.mjs';

const modern = '<title>Istanbul Modern</title><h2>Museum Hours</h2><p>Tuesday, Wednesday, Thursday, Saturday, Sunday 10.00–18.00</p><p>Friday, 10.00–20.00</p><p>Monday Closed</p><p>Entry to the museum ends 30 minutes before closing time.</p>';
const pera = '<title>Pera Museum</title><h5>VISITING HOURS</h5><p>Tuesday - Saturday 10:00 - 19:00</p><p>Friday 10:00 - 22:00</p><p>Sunday 12:00 - 18:00</p><p>The museum is closed on Mondays.</p>';

test('parses named Modern museum windows and keeps last admission separate', () => {
  assert.deepEqual(parseOfficialHours(modern, hoursSources['istanbul-modern']), [
    { weekdays: [2, 3, 4, 6, 0], open: '10:00', close: '18:00' },
    { weekdays: [5], open: '10:00', close: '20:00' },
  ]);
});

test('Pera Friday override does not overlap with the weekday range', () => {
  const windows = parseOfficialHours(pera, hoursSources['pera-museum']);
  assert.deepEqual(windows, [
    { weekdays: [2, 3, 4, 6], open: '10:00', close: '19:00' },
    { weekdays: [5], open: '10:00', close: '22:00' },
    { weekdays: [0], open: '12:00', close: '18:00' },
  ]);
  assert.equal(new Set(windows.flatMap(window => window.weekdays)).size, 6);
});

test('rejects unrelated hours, missing venue or closure labels, and invalid time ranges', () => {
  assert.throws(() => parseOfficialHours('<title>Pera Museum</title>Airport Hours 09:00 - 22:00', hoursSources['pera-museum']));
  assert.throws(() => parseOfficialHours(pera.replace('Pera Museum', 'Other Museum'), hoursSources['pera-museum']));
  assert.throws(() => parseOfficialHours(modern.replace('Monday Closed', 'Monday 10.00–18.00'), hoursSources['istanbul-modern']));
  assert.throws(() => parseOfficialHours(modern.replace('10.00–18.00', '10.70–18.00'), hoursSources['istanbul-modern']));
  assert.throws(() => parseOfficialHours(pera.replace('10:00 - 19:00', '19:00 - 10:00'), hoursSources['pera-museum']));
  assert.throws(() => parseOfficialHours('Gişe Açılış Saati09:00 Gişe Kapanış Saati17:00', { parser: 'palace' }));
});

test('deduplicates concurrent daily source checks and caches failures for24h', async () => {
  let now = Date.parse('2027-01-01T09:00:00Z'), calls = 0, fail = false;
  const service = createHoursService({ now: () => now, fetchImpl: async url => {
    calls++;
    if (fail) throw new Error('Offline');
    return { ok: true, text: async () => url.includes('istanbulmodern') ? modern : pera };
  } });
  const [first, second] = await Promise.all([service.all(), service.all()]);
  assert.equal(calls, 2);
  assert.equal(first['istanbul-modern'].status, 'verified');
  assert.deepEqual(first['pera-museum'], second['pera-museum']);
  await service.all(); assert.equal(calls, 2);
  now += 24 * 60 * 60 * 1000; fail = true;
  const failed = await service.all(); assert.equal(calls, 4);
  assert.equal(failed['pera-museum'].status, 'unverified');
  assert.equal(failed['pera-museum'].windows, undefined);
  assert.equal(failed['istanbul-modern'].status, 'unverified');
  await service.all(); assert.equal(calls, 4);
});

test('unverified and unknown venues never imply closed visiting windows', async () => {
  const service = createHoursService({ now: () => Date.parse('2027-01-01T09:00:00Z'), fetchImpl: async () => ({ ok: false }) });
  const results = await service.all();
  assert.equal(results['topkapi-palace'].status, 'unverified');
  assert.equal(results['topkapi-palace'].windows, undefined);
  assert.equal(results['pera-museum'].status, 'unverified');
});

test('returned schedules cannot mutate the daily cache', async () => {
  const service = createHoursService({ now: () => Date.parse('2027-01-01T09:00:00Z'), fetchImpl: async url => ({ ok: true, text: async () => url.includes('istanbulmodern') ? modern : pera }) });
  const first = await service.all(); first['pera-museum'].windows[0].weekdays.push(1);
  const second = await service.all(); assert.equal(second['pera-museum'].windows[0].weekdays.includes(1), false);
});
