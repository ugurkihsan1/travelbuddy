import { describe, expect, it } from 'vitest';
import { findPlace } from '../data/places';
import { getDaySchedule } from './planner';
import { continueFromHere } from './continuation';
import type { TripDay, TripSettings } from '../types';

const blue = findPlace('blue-mosque')!;
const galata = findPlace('galata-tower')!;
const origin = { lat: 41.0227, lng: 28.9772 };
const settings: TripSettings = { days: 2, stayArea: 'sultanahmet', startDate: '2026-10-08', startTime: '09:00', pace: 'balanced', accommodation: { label: 'My exact hotel', coordinate: blue.coordinate } };

function tripDay(): TripDay {
  return { id: 1, title: 'My saved route', subtitle: 'A personal route', stops: [
    { placeId: blue.id, status: 'visited', transportMode: 'walk' },
    { placeId: 'hagia-sophia', status: 'skipped' },
    { placeId: galata.id, status: 'pending', added: true, transportMode: 'taxi' },
    { placeId: 'istiklal', status: 'pending', transportMode: 'walk' },
  ], coffeeBreaks: [{ afterPlaceId: blue.id, duration: 20 }, { afterPlaceId: galata.id, duration: 10 }] };
}

describe('continuing from a current location', () => {
  it('uses the actual Istanbul clock and retains all saved route history and choices', () => {
    const day = tripDay();
    const before = structuredClone(day);
    const result = continueFromHere(day, settings, origin, new Date('2026-10-08T11:07:00Z'));
    expect(result.continuation).toEqual({ startTime: '14:07', origin });
    expect(result.delayMinutes).toBe(0);
    expect(result.stops).toEqual(day.stops);
    expect(result.coffeeBreaks).toEqual(day.coffeeBreaks);
    expect(day).toEqual(before);
    expect(result.continuation?.origin).not.toBe(origin);
    const schedule = getDaySchedule(result, settings);
    expect(Object.keys(schedule.stopTimes)).toEqual([galata.id, 'istiklal']);
    expect(schedule.visitMinutes).toBe(galata.duration + findPlace('istiklal')!.duration);
  });

  it('uses the real clock for an explicit Continue request even when viewing a future day', () => {
    const result = continueFromHere(tripDay(), { ...settings, startDate: '2026-10-09' }, origin, new Date('2026-10-08T11:00:00Z'));
    expect(result.continuation?.startTime).toBe('14:00');
  });

  it('adds thirty minutes to the next planned departure rather than its arrival', () => {
    // 09:00 hotel departure + 45 min visited Blue Mosque + 20 min coffee = 10:05.
    // The incoming taxi ride to Galata is after this departure, never part of the delay.
    const result = continueFromHere(tripDay(), settings, origin, new Date('2026-10-08T07:20:00Z'), 30);
    expect(result.continuation?.startTime).toBe('10:35');
    expect(result.delayMinutes).toBe(0);
  });

  it('clamps an already-late departure to now without adding another thirty minutes to now', () => {
    const result = continueFromHere(tripDay(), settings, origin, new Date('2026-10-08T11:00:00Z'), 30);
    expect(result.continuation?.startTime).toBe('14:00');
    expect(result.continuation?.startTime).not.toBe('14:30');
  });

  it('uses the planned local departure for a future day instead of today’s later current time', () => {
    const result = continueFromHere(tripDay(), { ...settings, startDate: '2026-10-09' }, origin, new Date('2026-10-08T11:00:00Z'), 30);
    expect(result.continuation?.startTime).toBe('10:35');
  });

  it('detects today using Istanbul’s date and the itinerary day offset across a month boundary', () => {
    const day: TripDay = { id: 2, title: '', subtitle: '', stops: [{ placeId: blue.id, status: 'pending' }] };
    const prefs = { ...settings, startDate: '2026-10-31', startTime: '00:00' };
    // UTC still says October 31; Istanbul says November 1 at 02:00.
    const result = continueFromHere(day, prefs, blue.coordinate, new Date('2026-10-31T23:00:00Z'), 30);
    expect(result.continuation?.startTime).toBe('02:00');
  });

  it('consumes an existing continuation delay exactly once before adding the requested delay', () => {
    const day = tripDay();
    day.continuation = { startTime: '12:00', origin: galata.coordinate };
    day.delayMinutes = 15;
    const result = continueFromHere(day, { ...settings, startDate: '2026-10-09' }, origin, new Date('2026-10-08T08:00:00Z'), 30);
    expect(result.continuation?.startTime).toBe('12:45');
    expect(result.delayMinutes).toBe(0);
  });

  it('does not replace a completed day’s history with a phantom continuation', () => {
    const day = tripDay();
    day.stops = day.stops.map((stop) => stop.status === 'pending' ? { ...stop, status: 'visited' } : stop);
    expect(continueFromHere(day, settings, origin, new Date('2026-10-08T11:00:00Z'), 30)).toBe(day);
  });

  it('rejects a delay crossing midnight rather than silently restarting the same day in the morning', () => {
    const day: TripDay = { id: 1, title: '', subtitle: '', stops: [{ placeId: blue.id, status: 'pending' }] };
    expect(() => continueFromHere(day, { ...settings, startDate: '2026-10-09', startTime: '23:50' }, blue.coordinate, new Date('2026-10-08T11:00:00Z'), 30)).toThrow(/midnight/i);
  });
});
