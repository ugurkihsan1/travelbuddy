import { findPlace, places, stayAreas } from '../data/places';
import { createTrip, distanceKm } from './planner';
import type { Place, PlannedStop, TripDay, TripSettings } from '../types';

export type TripActionResult = {
  days: TripDay[];
  message: string;
  changed: boolean;
  selectedDay?: number;
  dayCount?: number;
};

export type SettingsActionResult = TripActionResult & { settings: TripSettings };

function copyDays(days: TripDay[]): TripDay[] {
  return days.map((day) => ({
    ...day,
    stops: day.stops.map((stop) => ({ ...stop })),
    ...(day.coffeeBreaks ? { coffeeBreaks: day.coffeeBreaks.map((coffee) => ({ ...coffee })) } : {}),
    ...(day.continuation ? { continuation: { ...day.continuation, origin: { ...day.continuation.origin } } } : {}),
  }));
}

function copySettings(settings: TripSettings): TripSettings {
  return { ...settings,
    ...(settings.interests ? { interests: [...settings.interests] } : {}),
    ...(settings.accommodation ? { accommodation: { ...settings.accommodation, coordinate: { ...settings.accommodation.coordinate } } } : {}),
  };
}

function unchanged(days: TripDay[], message: string): TripActionResult {
  return { days, message, changed: false };
}

function predecessors(days: TripDay[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const day of days) {
    let previous = `day-origin:${day.id}`;
    for (const stop of day.stops) {
      if (stop.status === 'skipped') continue;
      result.set(stop.placeId, previous);
      previous = stop.placeId;
    }
  }
  return result;
}

/** A mode belongs to the incoming leg. Keep choices for legs that stay the same. */
function invalidateChangedLegs(before: TripDay[], after: TripDay[]): void {
  const oldPredecessors = predecessors(before);
  const newPredecessors = predecessors(after);
  for (const day of after) {
    for (const stop of day.stops) {
      if (stop.status === 'pending' && oldPredecessors.get(stop.placeId) !== newPredecessors.get(stop.placeId)) {
        delete stop.transportMode;
      }
    }
  }
}

function moveCoffee(source: TripDay, destination: TripDay, movedIds: Set<string>): void {
  const moved = (source.coffeeBreaks ?? []).filter((coffee) => movedIds.has(coffee.afterPlaceId));
  if (source.coffeeBreaks) source.coffeeBreaks = source.coffeeBreaks.filter((coffee) => !movedIds.has(coffee.afterPlaceId));
  if (moved.length) destination.coffeeBreaks = [...(destination.coffeeBreaks ?? []), ...moved.map((coffee) => ({ ...coffee }))];
}

/** Save preferences without treating them as permission to regenerate an existing trip. */
export function saveTripSettings(days: TripDay[], oldSettings: TripSettings, newSettings: TripSettings): SettingsActionResult {
  if (!Number.isInteger(newSettings.days) || newSettings.days < 1 || newSettings.days > 7) {
    return { ...unchanged(days, 'Choose between one and seven days.'), settings: oldSettings };
  }
  const overflow = days.filter((day) => day.id > newSettings.days);
  if (overflow.some((day) => day.stops.length > 0)) {
    return { ...unchanged(days, 'These later days contain saved stops or travel history. Move their stops first, or preview a separate new plan; your current trip was kept.'), settings: oldSettings };
  }
  const result = copyDays(days.filter((day) => day.id <= newSettings.days));
  const used = new Set(result.flatMap((day) => day.stops.map((stop) => stop.placeId)));
  const missing = Array.from({ length: newSettings.days }, (_, index) => index + 1).filter((id) => !result.some((day) => day.id === id));
  if (missing.length) {
    const proposed = createTrip(newSettings);
    for (const id of missing) {
      const candidate = proposed.find((day) => day.id === id) ?? { id, title: 'Room to explore', subtitle: 'Add places to shape this day.', stops: [] };
      const stops = candidate.stops.filter((stop) => !used.has(stop.placeId)).map((stop) => ({ ...stop }));
      stops.forEach((stop) => used.add(stop.placeId));
      const day: TripDay = { ...candidate, stops };
      if (candidate.coffeeBreaks) day.coffeeBreaks = candidate.coffeeBreaks.filter((coffee) => stops.some((stop) => stop.placeId === coffee.afterPlaceId)).map((coffee) => ({ ...coffee }));
      result.push(day);
    }
    result.sort((a, b) => a.id - b.id);
  }
  // A different accommodation changes only the first uncompleted incoming leg.
  // Time/date/pace/preferences retain the user's chosen transport and manual order.
  const oldOrigin = oldSettings.accommodation?.coordinate ?? stayAreas.find((area) => area.id === oldSettings.stayArea)?.coordinate;
  const newOrigin = newSettings.accommodation?.coordinate ?? stayAreas.find((area) => area.id === newSettings.stayArea)?.coordinate;
  if (oldOrigin && newOrigin && distanceKm(oldOrigin, newOrigin) > 0.01) {
    for (const day of result) {
      if (day.continuation) continue;
      const firstActive = day.stops.find((stop) => stop.status !== 'skipped');
      if (firstActive?.status === 'pending') delete firstActive.transportMode;
    }
  }
  return {
    settings: copySettings(newSettings), days: result, changed: true, dayCount: result.length,
    message: 'Settings saved. Your visits, added stops, coffee breaks and manual route were kept.',
  };
}

export function moveStopUpDown(days: TripDay[], dayId: number, placeId: string, direction: 'up' | 'down' | -1 | 1): TripActionResult {
  const original = days.find((day) => day.id === dayId);
  const index = original?.stops.findIndex((stop) => stop.placeId === placeId) ?? -1;
  if (!original || index < 0) return unchanged(days, 'That stop is no longer in this day.');
  if (original.stops[index].status !== 'pending') return unchanged(days, 'Visited and skipped stops stay in your travel history.');
  const step = direction === 'up' || direction === -1 ? -1 : 1;
  let target = index + step;
  while (target >= 0 && target < original.stops.length && original.stops[target].status !== 'pending') target += step;
  if (target < 0 || target >= original.stops.length) return unchanged(days, `This is already the ${step < 0 ? 'first' : 'last'} remaining stop.`);
  const result = copyDays(days);
  const day = result.find((candidate) => candidate.id === dayId)!;
  const [stop] = day.stops.splice(index, 1);
  day.stops.splice(target, 0, stop);
  invalidateChangedLegs(days, result);
  return { days: result, changed: true, selectedDay: dayId, message: 'Stop moved. Check transport choices for the changed legs.' };
}

export function moveStopToDay(days: TripDay[], fromDay: number, toDay: number, placeId: string): TripActionResult {
  if (fromDay === toDay) return unchanged(days, 'This stop is already in that day.');
  const source = days.find((day) => day.id === fromDay);
  const destination = days.find((day) => day.id === toDay);
  const stop = source?.stops.find((candidate) => candidate.placeId === placeId);
  if (!source || !destination || !stop) return unchanged(days, 'Choose a stop and an existing destination day.');
  if (stop.status === 'visited') return unchanged(days, 'Visited stops stay in the day you actually visited them.');
  if (days.some((day) => day.id !== fromDay && day.stops.some((candidate) => candidate.placeId === placeId))) return unchanged(days, 'That place is already saved in another day.');
  const result = copyDays(days);
  const copiedSource = result.find((day) => day.id === fromDay)!;
  const copiedDestination = result.find((day) => day.id === toDay)!;
  const index = copiedSource.stops.findIndex((candidate) => candidate.placeId === placeId);
  const [movedStop] = copiedSource.stops.splice(index, 1);
  // Explicitly rescheduling a skip makes it an upcoming visit again.
  if (movedStop.status === 'skipped') movedStop.status = 'pending';
  copiedDestination.stops.push(movedStop);
  moveCoffee(copiedSource, copiedDestination, new Set([placeId]));
  invalidateChangedLegs(days, result);
  return { days: result, changed: true, selectedDay: toDay, message: `Stop saved in Day ${toDay}. Your travel history was kept.` };
}

export function replaceStop(days: TripDay[], dayId: number, oldId: string, newPlace: Place): TripActionResult {
  const original = days.find((day) => day.id === dayId);
  const index = original?.stops.findIndex((stop) => stop.placeId === oldId) ?? -1;
  if (!original || index < 0 || !findPlace(newPlace.id)) return unchanged(days, 'Choose an available place to replace this stop.');
  if (oldId === newPlace.id) return unchanged(days, 'This is already the selected place.');
  if (original.stops[index].status !== 'pending') return unchanged(days, 'Visited and skipped stops stay in your travel history.');
  if (days.some((day) => day.stops.some((stop) => stop.placeId === newPlace.id))) return unchanged(days, 'That place is already included in your trip.');
  const result = copyDays(days);
  const day = result.find((candidate) => candidate.id === dayId)!;
  const replacement: PlannedStop = { ...day.stops[index], placeId: newPlace.id };
  delete replacement.transportMode;
  day.stops[index] = replacement;
  if (day.coffeeBreaks) day.coffeeBreaks = day.coffeeBreaks.map((coffee) => coffee.afterPlaceId === oldId ? { ...coffee, afterPlaceId: newPlace.id } : coffee);
  invalidateChangedLegs(days, result);
  return { days: result, changed: true, selectedDay: dayId, message: `${newPlace.name} added in place of the original stop. Coffee breaks and the rest of your route were kept.` };
}

export function lightenDay(days: TripDay[], dayId: number): TripActionResult {
  const original = days.find((day) => day.id === dayId);
  if (!original) return unchanged(days, 'Choose an existing day.');
  const pending = original.stops.filter((stop) => stop.status === 'pending');
  if (pending.length <= 2) return unchanged(days, 'This day already has two or fewer remaining stops.');
  const next = [...days].sort((a, b) => a.id - b.id).find((day) => day.id > dayId);
  if (!next && Math.max(...days.map((day) => day.id)) >= 7) {
    return unchanged(days, 'There is no later day within your seven-day trip. No stops were removed; move a stop to another day manually to make room.');
  }
  const result = copyDays(days);
  const source = result.find((day) => day.id === dayId)!;
  const destination = next ? result.find((day) => day.id === next.id)!
    : { id: Math.max(...result.map((day) => day.id)) + 1, title: 'A little more breathing room', subtitle: 'Stops saved from your fuller day.', stops: [] } as TripDay;
  if (!next) result.push(destination);
  const keepCount = Math.max(2, Math.ceil(pending.length / 2));
  const movedIds = new Set(pending.slice(keepCount).map((stop) => stop.placeId));
  const moved = source.stops.filter((stop) => movedIds.has(stop.placeId));
  source.stops = source.stops.filter((stop) => !movedIds.has(stop.placeId));
  destination.stops.push(...moved);
  moveCoffee(source, destination, movedIds);
  invalidateChangedLegs(days, result);
  return { days: result, changed: true, selectedDay: dayId, dayCount: result.length,
    message: `${moved.length} ${moved.length === 1 ? 'stop' : 'stops'} saved for Day ${destination.id}. Nothing was removed from your trip.` };
}

export function findAlternatives(place: Place, _day: TripDay, days: TripDay[], max = 3, weekday?: number): Place[] {
  const included = new Set(days.flatMap((day) => day.stops.map((stop) => stop.placeId)));
  const historic = new Set(['museum', 'landmark']);
  const outdoor = new Set(['park', 'viewpoint', 'neighborhood']);
  const compatible = (candidate: Place) => candidate.category === place.category
    || historic.has(candidate.category) && historic.has(place.category)
    || outdoor.has(candidate.category) && outdoor.has(place.category)
    || ['food', 'market'].includes(candidate.category) && ['food', 'market'].includes(place.category);
  const score = (candidate: Place) => (candidate.area === place.area ? 0 : candidate.district === place.district ? 1 : 3)
    + distanceKm(place.coordinate, candidate.coordinate) * 0.7
    + Math.abs(candidate.duration - place.duration) / 60
    + (candidate.category === place.category ? 0 : 0.5);
  return places.filter((candidate) => candidate.id !== place.id && !included.has(candidate.id)
    && candidate.side === place.side && compatible(candidate)
    && (candidate.district === place.district || distanceKm(place.coordinate, candidate.coordinate) <= 3)
    && (weekday === undefined || !candidate.closedDays?.includes(weekday)))
    .sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, Math.min(10, Math.trunc(max) || 0)));
}
