import { cafes, type Cafe } from '../data/amenities';
import { places } from '../data/places';
import { distanceKm, getTransport } from './planner';
import type { Coordinate, Place } from '../types';

export type DiscoveryFilter = 'all' | 'cafe' | 'food' | 'museum' | 'views' | 'free';
export type Discovery = { kind: 'place'; item: Place; distanceKm: number } | { kind: 'cafe'; item: Cafe; distanceKm: number };
export type CoffeeSuggestion = { cafe: Cafe; extraMinutes: number; distanceKm: number };

export function isIstanbulCoordinate(coordinate: Coordinate | null | undefined): coordinate is Coordinate {
  return !!coordinate && Number.isFinite(coordinate.lat) && Number.isFinite(coordinate.lng) && coordinate.lat >= 40.75 && coordinate.lat <= 41.4 && coordinate.lng >= 28.4 && coordinate.lng <= 29.5;
}

export function discoveryOrigin(currentLocation: Coordinate | null | undefined, accommodation: Coordinate): Coordinate {
  return isIstanbulCoordinate(currentLocation) ? currentLocation : accommodation;
}

function matchesPlace(place: Place, filter: DiscoveryFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'cafe') return false;
  if (filter === 'food') return place.category === 'food';
  if (filter === 'museum') return place.category === 'museum';
  if (filter === 'views') return place.category === 'viewpoint';
  return /^Free\b/i.test(place.entry);
}

/** Straight-line distances are suitable for discovery, not walking directions. */
export function getNearbyDiscoveries(origin: Coordinate, filter: DiscoveryFilter = 'all', radiusKm = 3): Discovery[] {
  if (!isIstanbulCoordinate(origin) || !Number.isFinite(radiusKm) || radiusKm <= 0) return [];
  const discoveries: Discovery[] = places.filter(place => matchesPlace(place, filter)).map(item => ({ kind: 'place', item, distanceKm: distanceKm(origin, item.coordinate) }));
  if (['all', 'cafe', 'food'].includes(filter)) {
    discoveries.push(...cafes.filter(cafe => filter === 'all' || cafe.category === filter).map(item => ({ kind: 'cafe' as const, item, distanceKm: distanceKm(origin, item.coordinate) })));
  }
  return discoveries.filter(item => item.distanceKm <= radiusKm).sort((a, b) => a.distanceKm - b.distanceKm || a.item.name.localeCompare(b.item.name));
}

function placeAt(coordinate: Coordinate): Place {
  const nearest = places.reduce((best, place) => distanceKm(coordinate, place.coordinate) < distanceKm(coordinate, best.coordinate) ? place : best, places[0]);
  return { ...nearest, coordinate };
}

/** Walking detour estimates use 1.3× straight-line distance and a 4.5 km/h pace. */
export function getCoffeeSuggestions(from: Coordinate, to: Coordinate, max = 3): CoffeeSuggestion[] {
  if (!isIstanbulCoordinate(from) || !isIstanbulCoordinate(to) || !Number.isFinite(max) || max <= 0) return [];
  const direct = distanceKm(from, to);
  if (direct > 3 || getTransport(from, placeAt(to)).recommended.mode !== 'walk') return [];
  return cafes.flatMap(cafe => {
    const first = distanceKm(from, cafe.coordinate);
    const second = distanceKm(cafe.coordinate, to);
    const extraKm = Math.max(0, (first + second - direct) * 1.3);
    if (extraKm > 0.85 || Math.min(first, second) > 1 || getTransport(from, placeAt(cafe.coordinate)).recommended.mode !== 'walk' || getTransport(cafe.coordinate, placeAt(to)).recommended.mode !== 'walk') return [];
    return [{ cafe, extraMinutes: Math.max(1, Math.ceil(extraKm / 4.5 * 60)), distanceKm: Math.round((first + second) * 1.3 * 100) / 100 }];
  }).sort((a, b) => a.extraMinutes - b.extraMinutes || a.distanceKm - b.distanceKm).slice(0, Math.min(3, Math.floor(max)));
}
