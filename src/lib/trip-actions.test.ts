import { describe, expect, it } from 'vitest';
import { findPlace } from '../data/places';
import type { Place, TripDay, TripSettings } from '../types';
import { findAlternatives, lightenDay, moveStopToDay, moveStopUpDown, replaceStop, saveTripSettings } from './trip-actions';

const settings: TripSettings = { days: 2, stayArea: 'sultanahmet', pace: 'balanced', startDate: '2026-10-05', startTime: '09:00', coffeeStops: true, routeMode: 'keep', interests: ['history', 'food'] };

function place(id: string): Place {
  const result = findPlace(id);
  if (!result) throw new Error(`Missing test place ${id}`);
  return result;
}

function trip(): TripDay[] {
  return [
    { id: 1, title: 'My historic route', subtitle: 'Manually arranged', delayMinutes: 15,
      stops: [
        { placeId: 'blue-mosque', status: 'visited', transportMode: 'walk' },
        { placeId: 'hagia-sophia', status: 'skipped', transportMode: 'tram' },
        { placeId: 'basilica-cistern', status: 'pending', transportMode: 'walk' },
        { placeId: 'topkapi-palace', status: 'pending', added: true, transportMode: 'taxi' },
        { placeId: 'grand-bazaar', status: 'pending', transportMode: 'bus' },
      ], coffeeBreaks: [{ afterPlaceId: 'topkapi-palace', duration: 25 }, { afterPlaceId: 'blue-mosque', duration: 20 }] },
    { id: 2, title: 'My Galata route', subtitle: 'Saved order', continuation: { startTime: '11:30', origin: { lat: 41.0256, lng: 28.9742 } },
      stops: [
        { placeId: 'galata-tower', status: 'pending', transportMode: 'ferry' },
        { placeId: 'karakoy', status: 'pending', transportMode: 'walk' },
        { placeId: 'istiklal', status: 'pending', transportMode: 'metro' },
      ], coffeeBreaks: [{ afterPlaceId: 'galata-tower', duration: 20 }] },
  ];
}

function ids(days: TripDay[]): string[] { return days.flatMap((day) => day.stops.map((stop) => stop.placeId)); }
function stop(days: TripDay[], id: string) { return days.flatMap((day) => day.stops).find((candidate) => candidate.placeId === id); }
function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

describe('saving preferences without replacing an existing trip', () => {
  it('keeps completed history, added stops, chosen modes, coffee, manual order and continuation', () => {
    const days = freezeDeep(trip());
    const before = structuredClone(days);
    const next: TripSettings = { ...settings, startTime: '14:00', startDate: '2026-10-11', pace: 'relaxed', routeMode: 'optimize', interests: ['art'], coffeeStops: false };
    const result = saveTripSettings(days, freezeDeep({ ...settings }), freezeDeep(next));
    expect(result.changed).toBe(true);
    expect(result.settings).toEqual(next);
    expect(result.days).toEqual(before);
    expect(days).toEqual(before);
    expect(result.days).not.toBe(days);
    expect(result.days[0].stops).not.toBe(days[0].stops);
  });

  it('rejects shortening occupied days, including completed or skipped history', () => {
    for (const status of ['pending', 'visited', 'skipped'] as const) {
      const days = trip();
      days[1].stops = [{ placeId: 'galata-tower', status }];
      const result = saveTripSettings(days, settings, { ...settings, days: 1 });
      expect(result.changed).toBe(false);
      expect(result.settings).toEqual(settings);
      expect(result.days).toBe(days);
      expect(result.message).toMatch(/kept/i);
    }
  });

  it('can remove an empty trailing day without affecting the populated day', () => {
    const days = trip();
    days[1].stops = [];
    days[1].coffeeBreaks = [];
    const result = saveTripSettings(days, settings, { ...settings, days: 1 });
    expect(result.settings.days).toBe(1);
    expect(result.days).toEqual([days[0]]);
    expect(days).toHaveLength(2);
  });

  it('appends additional days without repeating any current or newly generated destination', () => {
    const days = freezeDeep(trip());
    const result = saveTripSettings(days, settings, { ...settings, days: 4 });
    expect(result.days).toHaveLength(4);
    expect(result.dayCount).toBe(4);
    expect(result.days.slice(0, 2)).toEqual(days);
    expect(new Set(ids(result.days)).size).toBe(ids(result.days).length);
    expect(result.days.slice(2).every((day) => day.stops.length > 0)).toBe(true);
  });

  it('retains historical modes and unaffected legs when accommodation changes', () => {
    const days = trip();
    days[1].continuation = undefined;
    const result = saveTripSettings(days, settings, { ...settings, stayArea: 'kadikoy' });
    expect(stop(result.days, 'blue-mosque')?.transportMode).toBe('walk');
    expect(stop(result.days, 'topkapi-palace')?.transportMode).toBe('taxi');
    expect(stop(result.days, 'galata-tower')?.transportMode).toBeUndefined();
    expect(stop(result.days, 'karakoy')?.transportMode).toBe('walk');
  });

  it('rejects an unsupported day count without mutating settings', () => {
    expect(saveTripSettings(trip(), settings, { ...settings, days: 8 }).changed).toBe(false);
  });
});

describe('editing only the chosen part of the route', () => {
  it('moves a pending stop within a day and invalidates only changed incoming legs', () => {
    const days = freezeDeep(trip());
    const result = moveStopUpDown(days, 1, 'grand-bazaar', 'up');
    expect(result.changed).toBe(true);
    expect(result.days[0].stops.map((candidate) => candidate.placeId)).toEqual(['blue-mosque', 'hagia-sophia', 'basilica-cistern', 'grand-bazaar', 'topkapi-palace']);
    expect(result.days[0].stops.slice(0, 2)).toEqual(days[0].stops.slice(0, 2));
    expect(stop(result.days, 'basilica-cistern')?.transportMode).toBe('walk');
    expect(stop(result.days, 'grand-bazaar')?.transportMode).toBeUndefined();
    expect(stop(result.days, 'topkapi-palace')?.transportMode).toBeUndefined();
    expect(result.days[0].coffeeBreaks).toEqual(days[0].coffeeBreaks);
    expect(result.days[1]).toEqual(days[1]);
  });

  it('keeps visited/skipped records immovable and handles first/last pending boundaries', () => {
    const days = trip();
    expect(moveStopUpDown(days, 1, 'blue-mosque', 'down').changed).toBe(false);
    expect(moveStopUpDown(days, 1, 'hagia-sophia', 'up').changed).toBe(false);
    expect(moveStopUpDown(days, 1, 'basilica-cistern', -1).changed).toBe(false);
    expect(moveStopUpDown(days, 1, 'grand-bazaar', 1).changed).toBe(false);
  });

  it('moves a pending added stop and its coffee to another day without losing history', () => {
    const days = freezeDeep(trip());
    const result = moveStopToDay(days, 1, 2, 'topkapi-palace');
    expect(result.changed).toBe(true);
    expect(result.selectedDay).toBe(2);
    expect(ids(result.days).sort()).toEqual(ids(days).sort());
    expect(new Set(ids(result.days)).size).toBe(ids(result.days).length);
    expect(result.days[0].stops.slice(0, 2)).toEqual(days[0].stops.slice(0, 2));
    expect(stop(result.days, 'topkapi-palace')).toMatchObject({ status: 'pending', added: true });
    expect(stop(result.days, 'topkapi-palace')?.transportMode).toBeUndefined();
    expect(stop(result.days, 'grand-bazaar')?.transportMode).toBeUndefined();
    expect(stop(result.days, 'karakoy')?.transportMode).toBe('walk');
    expect(result.days[0].coffeeBreaks).toEqual([{ afterPlaceId: 'blue-mosque', duration: 20 }]);
    expect(result.days[1].coffeeBreaks).toContainEqual({ afterPlaceId: 'topkapi-palace', duration: 25 });
  });

  it('explicitly reschedules a skipped place as pending while preserving real visited history', () => {
    const days = freezeDeep(trip());
    const result = moveStopToDay(days, 1, 2, 'hagia-sophia');
    expect(result.changed).toBe(true);
    expect(result.days[0].stops.some((candidate) => candidate.placeId === 'hagia-sophia')).toBe(false);
    expect(result.days[1].stops.at(-1)).toEqual({ placeId: 'hagia-sophia', status: 'pending' });
    expect(stop(result.days, 'blue-mosque')).toEqual(stop(days, 'blue-mosque'));
    expect(moveStopToDay(days, 1, 2, 'blue-mosque').changed).toBe(false);
  });

  it('does not move to a missing day or create an already duplicated place', () => {
    const days = trip();
    expect(moveStopToDay(days, 1, 7, 'topkapi-palace').changed).toBe(false);
    expect(moveStopToDay(days, 1, 1, 'topkapi-palace').changed).toBe(false);
    days[1].stops.push({ placeId: 'topkapi-palace', status: 'pending' });
    expect(moveStopToDay(days, 1, 2, 'topkapi-palace').changed).toBe(false);
  });

  it('replaces a pending place, retaining its added flag and coffee position', () => {
    const days = freezeDeep(trip());
    const result = replaceStop(days, 1, 'topkapi-palace', place('archaeology-museums'));
    expect(result.changed).toBe(true);
    expect(result.days[0].stops[3]).toEqual({ placeId: 'archaeology-museums', status: 'pending', added: true });
    expect(result.days[0].coffeeBreaks).toContainEqual({ afterPlaceId: 'archaeology-museums', duration: 25 });
    expect(stop(result.days, 'grand-bazaar')?.transportMode).toBeUndefined();
    expect(stop(result.days, 'basilica-cistern')?.transportMode).toBe('walk');
    expect(result.days[1]).toEqual(days[1]);
  });

  it('rejects replacing history or adding a destination already elsewhere in the trip', () => {
    const days = trip();
    expect(replaceStop(days, 1, 'blue-mosque', place('archaeology-museums')).changed).toBe(false);
    expect(replaceStop(days, 1, 'topkapi-palace', place('galata-tower')).changed).toBe(false);
    expect(replaceStop(days, 1, 'topkapi-palace', place('topkapi-palace')).changed).toBe(false);
  });
});

describe('creating breathing room without deleting visits', () => {
  it('saves excess pending stops and their coffee on the next day', () => {
    const days = trip();
    days[0].coffeeBreaks!.push({ afterPlaceId: 'grand-bazaar', duration: 15 });
    freezeDeep(days);
    const result = lightenDay(days, 1);
    expect(result.changed).toBe(true);
    expect(result.days[0].stops.filter((candidate) => candidate.status === 'pending')).toHaveLength(2);
    expect(ids(result.days).sort()).toEqual(ids(days).sort());
    expect(result.days[0].stops.slice(0, 2)).toEqual(days[0].stops.slice(0, 2));
    expect(result.days[1].coffeeBreaks).toContainEqual({ afterPlaceId: 'grand-bazaar', duration: 15 });
    expect(stop(result.days, 'topkapi-palace')?.transportMode).toBe('taxi');
  });

  it('creates a later day and reports its count if the trip can grow', () => {
    const days = freezeDeep(trip());
    const result = lightenDay(days, 2);
    expect(result.changed).toBe(true);
    expect(result.dayCount).toBe(3);
    expect(result.days[2].stops.map((candidate) => candidate.placeId)).toEqual(['istiklal']);
    expect(ids(result.days).sort()).toEqual(ids(days).sort());
    expect(result.days[1].continuation).toEqual(days[1].continuation);
  });

  it('keeps the chosen mode within a transferred block when that leg stays identical', () => {
    const days = trip();
    days[0].stops.push(
      { placeId: 'archaeology-museums', status: 'pending', added: true, transportMode: 'taxi' },
      { placeId: 'hippodrome', status: 'pending', added: true, transportMode: 'walk' },
    );
    const result = lightenDay(freezeDeep(days), 1);
    expect(result.days[1].stops.slice(-2).map((candidate) => candidate.placeId)).toEqual(['archaeology-museums', 'hippodrome']);
    expect(stop(result.days, 'archaeology-museums')?.transportMode).toBeUndefined();
    expect(stop(result.days, 'hippodrome')?.transportMode).toBe('walk');
    expect(stop(result.days, 'hippodrome')?.added).toBe(true);
  });

  it('refuses to discard stops from day seven when there is no later day', () => {
    const days = Array.from({ length: 7 }, (_, index): TripDay => ({ id: index + 1, title: `Day ${index + 1}`, subtitle: '', stops: index === 6 ? trip()[1].stops : [] }));
    freezeDeep(days);
    const result = lightenDay(days, 7);
    expect(result.changed).toBe(false);
    expect(result.days).toBe(days);
    expect(result.message).toMatch(/no stops were removed/i);
  });

  it('leaves an already light day alone', () => {
    const days = trip();
    days[1].stops = days[1].stops.slice(0, 2);
    expect(lightenDay(days, 2).changed).toBe(false);
  });
});

describe('nearby alternatives', () => {
  it('excludes every current stop and favours nearby compatible places deterministically', () => {
    const days = trip();
    const alternatives = findAlternatives(place('topkapi-palace'), days[0], days, 3, 1);
    expect(alternatives.length).toBeGreaterThan(0);
    expect(alternatives[0].id).toBe('archaeology-museums');
    expect(alternatives.length).toBeLessThanOrEqual(3);
    expect(alternatives.every((candidate) => candidate.side === 'europe' && !ids(days).includes(candidate.id))).toBe(true);
    expect(alternatives).toEqual(findAlternatives(place('topkapi-palace'), days[0], days, 3, 1));
  });

  it('filters known weekly closures for the actual target weekday', () => {
    const day: TripDay = { id: 1, title: '', subtitle: '', stops: [{ placeId: 'blue-mosque', status: 'pending' }] };
    const tuesday = findAlternatives(place('blue-mosque'), day, [day], 10, 2);
    const monday = findAlternatives(place('blue-mosque'), day, [day], 10, 1);
    expect(tuesday.some((candidate) => candidate.id === 'topkapi-palace')).toBe(false);
    expect(monday.some((candidate) => candidate.id === 'topkapi-palace')).toBe(true);
    expect(tuesday.every((candidate) => !candidate.closedDays?.includes(2))).toBe(true);
  });
});
