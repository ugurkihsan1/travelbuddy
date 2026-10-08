import { describe, expect, it } from 'vitest';
import { cafes } from '../data/amenities';
import { findPlace } from '../data/places';
import { discoveryOrigin, getCoffeeSuggestions, getNearbyDiscoveries, isIstanbulCoordinate } from './discovery';

describe('curated nearby discovery', () => {
  const kadikoy = { lat: 40.990, lng: 29.0254 };
  it('falls back to the stay when GPS is outside Istanbul or invalid', () => {
    expect(discoveryOrigin({ lat: 51.5, lng: -0.12 }, kadikoy)).toEqual(kadikoy);
    expect(discoveryOrigin({ lat: NaN, lng: 29 }, kadikoy)).toEqual(kadikoy);
    expect(discoveryOrigin(null, kadikoy)).toEqual(kadikoy);
    expect(discoveryOrigin({ lat: 41.03, lng: 28.97 }, kadikoy)).toEqual({ lat: 41.03, lng: 28.97 });
    expect(isIstanbulCoordinate({ lat: 40.86, lng: 29.12 })).toBe(true);
  });
  it('returns radius-limited, ordered results and real separate cafe records', () => {
    const results = getNearbyDiscoveries(kadikoy, 'cafe', 1);
    expect(results.length).toBeGreaterThan(1);
    expect(results.every(result => result.kind === 'cafe' && result.item.category === 'cafe' && result.distanceKm <= 1)).toBe(true);
    expect(results.map(result => result.distanceKm)).toEqual(results.map(result => result.distanceKm).sort((a, b) => a - b));
    expect(results.some(result => result.item.id === 'fazilbey-kadikoy')).toBe(true);
  });
  it('keeps free filters scoped to free public visits instead of paid cafes and museums', () => {
    const results = getNearbyDiscoveries({ lat: 41.0086, lng: 28.9802 }, 'free');
    expect(results.some(result => result.item.id === 'blue-mosque')).toBe(true);
    expect(results.some(result => result.item.id === 'hagia-sophia')).toBe(false);
    expect(results.every(result => result.kind === 'place')).toBe(true);
    expect(getNearbyDiscoveries(kadikoy, 'museum').every(result => result.item.category === 'museum')).toBe(true);
    expect(getNearbyDiscoveries({ lat: 51, lng: 0 })).toEqual([]);
  });
  it('uses distinct curated premises with source links and no invented live information', () => {
    expect(cafes.length).toBeGreaterThanOrEqual(15);
    expect(new Set(cafes.map(cafe => cafe.id)).size).toBe(cafes.length);
    expect(cafes.every(cafe => isIstanbulCoordinate(cafe.coordinate) && cafe.sourceUrl.startsWith('https://'))).toBe(true);
  });
});

describe('coffee along a walking leg', () => {
  it('suggests a small nearby detour on a real Kadikoy walking leg', () => {
    const suggestions = getCoffeeSuggestions(findPlace('kadikoy-market')!.coordinate, findPlace('bahariye-street')!.coordinate);
    expect(suggestions.length).toBeGreaterThanOrEqual(2);
    expect(suggestions.length).toBeLessThanOrEqual(3);
    expect(suggestions.every(suggestion => suggestion.extraMinutes >= 1 && suggestion.extraMinutes <= 12)).toBe(true);
    expect(suggestions.every(suggestion => suggestion.cafe.district === 'Kadıköy')).toBe(true);
  });
  it('does not suggest walkable coffee across the Bosphorus, Golden Horn or from overseas GPS', () => {
    expect(getCoffeeSuggestions(findPlace('karakoy')!.coordinate, findPlace('uskudar-waterfront')!.coordinate)).toEqual([]);
    expect(getCoffeeSuggestions(findPlace('balat')!.coordinate, findPlace('rahmi-koc-museum')!.coordinate)).toEqual([]);
    expect(getCoffeeSuggestions({ lat: 51, lng: 0 }, findPlace('moda')!.coordinate)).toEqual([]);
  });
  it('respects the result limit and rejects long or invalid legs', () => {
    expect(getCoffeeSuggestions(findPlace('kadikoy-market')!.coordinate, findPlace('bahariye-street')!.coordinate, 1)).toHaveLength(1);
    expect(getCoffeeSuggestions(findPlace('blue-mosque')!.coordinate, findPlace('bebek-park')!.coordinate)).toEqual([]);
    expect(getCoffeeSuggestions(findPlace('moda')!.coordinate, findPlace('kadikoy-market')!.coordinate, 0)).toEqual([]);
  });
});
