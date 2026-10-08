import { cafes } from "../data/amenities";
import { places, stayAreas } from "../data/places";
import type { TripDay, TripSettings } from "../types";

export type SavedTrip = {
  version: 1;
  settings: TripSettings;
  days: TripDay[];
  selectedDay: number;
};

export const TRIP_STORAGE_KEY = "travelbuddy.trip.v1";
const placeIds = new Set(places.map((place) => place.id));
const stayAreaIds = new Set(stayAreas.map((area) => area.id));
const paces = new Set(["relaxed", "balanced", "packed"]);
const statuses = new Set(["pending", "visited", "skipped"]);
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const routeModes = new Set(["keep", "optimize"]);
const languages = new Set(["en", "tr"]);
const interests = new Set(["history", "food", "views", "art", "shopping"]);
const transportModes = new Set([
  "walk", "tram", "metro", "marmaray", "ferry", "bus", "taxi",
]);
const maxPhotoBytes = 2 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDayCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 7
  );
}

function isTime(value: unknown): value is string {
  return typeof value === "string" && timePattern.test(value);
}

function isIstanbulCoordinate(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.lat === "number" &&
    Number.isFinite(value.lat) &&
    value.lat >= 40.75 &&
    value.lat <= 41.4 &&
    typeof value.lng === "number" &&
    Number.isFinite(value.lng) &&
    value.lng >= 28.4 &&
    value.lng <= 29.5
  );
}

function isMemoryPhoto(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^data:image\/(?:jpeg|png|webp);base64,/.exec(value);
  if (!match) return false;
  const payload = value.slice(match[0].length);
  if (
    payload.length === 0 ||
    payload.length % 4 !== 0 ||
    payload.length > Math.ceil(maxPhotoBytes / 3) * 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)
  )
    return false;
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return (payload.length / 4) * 3 - padding <= maxPhotoBytes;
}

function isDate(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number(value.slice(0, 4)) === 0
  )
    return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function isSavedTrip(value: unknown): value is SavedTrip {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.settings))
    return false;
  const { settings } = value;
  if (
    !isDayCount(settings.days) ||
    typeof settings.stayArea !== "string" ||
    !stayAreaIds.has(settings.stayArea)
  )
    return false;
  if (
    typeof settings.pace !== "string" ||
    !paces.has(settings.pace) ||
    !isDate(settings.startDate)
  )
    return false;
  if (
    settings.startTime !== undefined &&
    !isTime(settings.startTime)
  )
    return false;
  if (
    settings.routeMode !== undefined &&
    (typeof settings.routeMode !== "string" || !routeModes.has(settings.routeMode))
  )
    return false;
  if (
    settings.language !== undefined &&
    (typeof settings.language !== "string" || !languages.has(settings.language))
  )
    return false;
  if (
    settings.interests !== undefined &&
    (!Array.isArray(settings.interests) ||
      settings.interests.some((interest) =>
        typeof interest !== "string" || !interests.has(interest),
      ) ||
      new Set(settings.interests).size !== settings.interests.length)
  )
    return false;
  if (
    settings.accommodation !== undefined &&
    (!isRecord(settings.accommodation) ||
      typeof settings.accommodation.label !== "string" ||
      settings.accommodation.label.trim().length === 0 ||
      settings.accommodation.label.length > 200 ||
      !isIstanbulCoordinate(settings.accommodation.coordinate))
  )
    return false;
  if (
    settings.coffeeStops !== undefined &&
    typeof settings.coffeeStops !== "boolean"
  )
    return false;
  if (!Array.isArray(value.days) || value.days.length !== settings.days)
    return false;
  if (!isDayCount(value.selectedDay) || value.selectedDay > settings.days)
    return false;

  return value.days.every((day, index) => {
    if (
      !isRecord(day) ||
      day.id !== index + 1 ||
      typeof day.title !== "string" ||
      typeof day.subtitle !== "string"
    )
      return false;
    if (
      day.delayMinutes !== undefined &&
      (typeof day.delayMinutes !== "number" ||
        !Number.isInteger(day.delayMinutes) ||
        day.delayMinutes < 0 ||
        day.delayMinutes > 720)
    )
      return false;
    if (
      day.continuation !== undefined &&
      (!isRecord(day.continuation) ||
        !isTime(day.continuation.startTime) ||
        !isIstanbulCoordinate(day.continuation.origin))
    )
      return false;
    if (!Array.isArray(day.stops) || day.stops.length > places.length)
      return false;
    const seen = new Set<string>();
    const validStops = day.stops.every((stop) => {
      if (
        !isRecord(stop) ||
        typeof stop.placeId !== "string" ||
        !placeIds.has(stop.placeId) ||
        seen.has(stop.placeId)
      )
        return false;
      if (typeof stop.status !== "string" || !statuses.has(stop.status))
        return false;
      if (stop.added !== undefined && typeof stop.added !== "boolean")
        return false;
      if (
        stop.transportMode !== undefined &&
        (typeof stop.transportMode !== "string" || !transportModes.has(stop.transportMode))
      )
        return false;
      if (
        stop.memory !== undefined &&
        (!isRecord(stop.memory) ||
          typeof stop.memory.note !== "string" ||
          stop.memory.note.length > 500 ||
          (stop.memory.photo !== undefined && !isMemoryPhoto(stop.memory.photo)))
      )
        return false;
      seen.add(stop.placeId);
      return true;
    });
    if (!validStops) return false;
    if (day.coffeeBreaks === undefined) return true;
    if (!Array.isArray(day.coffeeBreaks)) return false;
    const breakStops = new Set<string>();
    return day.coffeeBreaks.every((coffeeBreak) => {
      if (
        !isRecord(coffeeBreak) ||
        typeof coffeeBreak.afterPlaceId !== "string" ||
        !seen.has(coffeeBreak.afterPlaceId) ||
        breakStops.has(coffeeBreak.afterPlaceId) ||
        (coffeeBreak.cafeId !== undefined && (typeof coffeeBreak.cafeId !== "string" || !cafes.some(cafe => cafe.id === coffeeBreak.cafeId))) ||
        typeof coffeeBreak.duration !== "number" ||
        !Number.isInteger(coffeeBreak.duration) ||
        coffeeBreak.duration < 1 ||
        coffeeBreak.duration > 120
      )
        return false;
      breakStops.add(coffeeBreak.afterPlaceId);
      return true;
    });
  });
}

function normalizeTrip(trip: SavedTrip): SavedTrip {
  return {
    ...trip,
    settings: {
      ...trip.settings,
      startTime: trip.settings.startTime ?? "09:00",
      coffeeStops: trip.settings.coffeeStops ?? false,
      routeMode: trip.settings.routeMode ?? "keep",
      interests: trip.settings.interests ?? [],
      language: trip.settings.language ?? "en",
    },
  };
}

/** Local storage can be disabled, full, or stale after an app update. */
export function loadTrip(): SavedTrip | null {
  try {
    const raw = globalThis.localStorage.getItem(TRIP_STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return isSavedTrip(value) ? normalizeTrip(value) : null;
  } catch {
    return null;
  }
}

export function saveTrip(trip: SavedTrip): boolean {
  try {
    if (!isSavedTrip(trip)) return false;
    globalThis.localStorage.setItem(
      TRIP_STORAGE_KEY,
      JSON.stringify(normalizeTrip(trip)),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearTrip(): void {
  try {
    globalThis.localStorage.removeItem(TRIP_STORAGE_KEY);
  } catch {
    // Clearing a trip must remain usable when browser persistence is unavailable.
  }
}
