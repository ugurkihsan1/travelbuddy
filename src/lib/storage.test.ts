import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Buffer } from "node:buffer";
import { places, stayAreas } from "../data/places";
import { cafes } from "../data/amenities";
import {
  clearTrip,
  loadTrip,
  saveTrip,
  TRIP_STORAGE_KEY,
  type SavedTrip,
} from "./storage";

function makeTrip(): SavedTrip {
  return {
    version: 1,
    settings: {
      days: 2,
      stayArea: stayAreas[0].id,
      pace: "balanced",
      startDate: "2028-02-29",
      startTime: "09:00",
      coffeeStops: false,
      routeMode: "keep",
      interests: [],
      language: "en",
    },
    selectedDay: 2,
    days: [
      {
        id: 1,
        title: "Old city",
        subtitle: "A gentle first day",
        stops: [{ placeId: places[0].id, status: "visited" }],
      },
      {
        id: 2,
        title: "By the water",
        subtitle: "Explore at your pace",
        stops: [{ placeId: places[1].id, status: "pending", added: true }],
      },
    ],
  };
}

describe("saved trips", () => {
  let entries: Map<string, string>;

  beforeEach(() => {
    entries = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("round-trips settings, active day, and visited or added stops", () => {
    const trip = makeTrip();
    expect(saveTrip(trip)).toBe(true);
    expect(loadTrip()).toEqual(trip);
    clearTrip();
    expect(loadTrip()).toBeNull();
  });

  it("starts safely when a trip has never been saved", () => {
    expect(loadTrip()).toBeNull();
  });

  it("loads old version-one trips with safe time and coffee defaults", () => {
    const trip = makeTrip();
    delete trip.settings.startTime;
    delete trip.settings.coffeeStops;
    delete trip.settings.routeMode;
    delete trip.settings.interests;
    delete trip.settings.language;
    entries.set(TRIP_STORAGE_KEY, JSON.stringify(trip));
    expect(loadTrip()).toEqual({
      ...trip,
      settings: {
        ...trip.settings,
        startTime: "09:00",
        coffeeStops: false,
        routeMode: "keep",
        interests: [],
        language: "en",
      },
    });
    expect(saveTrip(trip)).toBe(true);
    expect(JSON.parse(entries.get(TRIP_STORAGE_KEY)!)).toEqual(loadTrip());
    expect(trip.settings.startTime).toBeUndefined();
    expect(trip.settings.coffeeStops).toBeUndefined();
    expect(trip.settings.routeMode).toBeUndefined();
    expect(trip.settings.interests).toBeUndefined();
    expect(trip.settings.language).toBeUndefined();
  });

  it("round-trips a custom start time, coffee choice and per-day breaks", () => {
    const trip = makeTrip();
    trip.settings.startTime = "07:45";
    trip.settings.coffeeStops = true;
    trip.days[0].coffeeBreaks = [
      { afterPlaceId: trip.days[0].stops[0].placeId, duration: 25 },
    ];
    trip.days[1].coffeeBreaks = [];
    expect(saveTrip(trip)).toBe(true);
    expect(loadTrip()).toEqual(trip);
  });

  it('persists a selected cafe ID with its duration and anchored stop', () => {
    const trip = makeTrip();
    trip.settings.coffeeStops = true;
    trip.days[1].stops.push({ placeId: 'galata-tower', status: 'pending' });
    trip.days[1].coffeeBreaks = [{ afterPlaceId: trip.days[1].stops[0].placeId, duration: 35, cafeId: cafes[0].id }];
    expect(saveTrip(trip)).toBe(true);
    expect(loadTrip()).toEqual(trip);
    expect(loadTrip()?.days[1].coffeeBreaks?.[0].cafeId).toBe(cafes[0].id);
  });

  it.each(['not-a-curated-cafe', '', null, 7, {}])('rejects an invalid selected cafe ID: %s', (cafeId) => {
    const trip = makeTrip();
    Object.assign(trip.days[0], { coffeeBreaks: [{ afterPlaceId: trip.days[0].stops[0].placeId, duration: 20, cafeId }] });
    entries.set(TRIP_STORAGE_KEY, JSON.stringify(trip));
    expect(loadTrip()).toBeNull();
    expect(saveTrip(trip)).toBe(false);
  });

  it.each(["00:00", "09:00", "23:59"])(
    "allows the full valid clock range: %s",
    (time) => {
      const trip = makeTrip();
      trip.settings.startTime = time;
      expect(saveTrip(trip)).toBe(true);
      expect(loadTrip()?.settings.startTime).toBe(time);
    },
  );

  it.each(["9:00", "24:00", "09:60", "-1:00", "12:30 PM", "", null, 900])(
    "rejects an invalid start time: %s",
    (time) => {
      const trip = makeTrip();
      Object.assign(trip.settings, { startTime: time });
      entries.set(TRIP_STORAGE_KEY, JSON.stringify(trip));
      expect(loadTrip()).toBeNull();
      expect(saveTrip(trip)).toBe(false);
    },
  );

  it.each(["true", 1, null, {}])("rejects invalid coffee choice: %s", (choice) => {
    const trip = makeTrip();
    Object.assign(trip.settings, { coffeeStops: choice });
    entries.set(TRIP_STORAGE_KEY, JSON.stringify(trip));
    expect(loadTrip()).toBeNull();
    expect(saveTrip(trip)).toBe(false);
  });

  it.each([0, -1, 121, 1.5, Infinity, NaN, "25", null])(
    "rejects invalid coffee duration: %s",
    (duration) => {
      const trip = makeTrip();
      Object.assign(trip.days[0], {
        coffeeBreaks: [{ afterPlaceId: trip.days[0].stops[0].placeId, duration }],
      });
      entries.set(TRIP_STORAGE_KEY, JSON.stringify(trip));
      expect(loadTrip()).toBeNull();
      expect(saveTrip(trip)).toBe(false);
    },
  );

  it.each([1, 120])("allows bounded coffee durations: %s", (duration) => {
    const trip = makeTrip();
    trip.days[0].coffeeBreaks = [
      { afterPlaceId: trip.days[0].stops[0].placeId, duration },
    ];
    expect(saveTrip(trip)).toBe(true);
    expect(loadTrip()).toEqual(trip);
  });

  it.each([
    { label: "unknown stop", value: [{ afterPlaceId: "unknown", duration: 25 }] },
    {
      label: "stop on another day",
      value: [{ afterPlaceId: places[1].id, duration: 25 }],
    },
    {
      label: "duplicate breaks at one stop",
      value: [
        { afterPlaceId: places[0].id, duration: 25 },
        { afterPlaceId: places[0].id, duration: 20 },
      ],
    },
    { label: "invalid array", value: "coffee" },
    { label: "invalid entry", value: [null] },
    { label: "missing duration", value: [{ afterPlaceId: places[0].id }] },
  ])("rejects coffee breaks with $label", ({ value }) => {
    const trip = makeTrip();
    Object.assign(trip.days[0], { coffeeBreaks: value });
    entries.set(TRIP_STORAGE_KEY, JSON.stringify(trip));
    expect(loadTrip()).toBeNull();
    expect(saveTrip(trip)).toBe(false);
  });

  it("round-trips custom accommodation, interests, transport, continuation and memories", () => {
    const trip = makeTrip();
    Object.assign(trip.settings, {
      routeMode: "optimize",
      interests: ["history", "views"],
      language: "tr",
      accommodation: { label: "My hotel", coordinate: { lat: 41.008, lng: 28.98 } },
    });
    Object.assign(trip.days[0], {
      delayMinutes: 45,
      continuation: { startTime: "14:30", origin: { lat: 41.03, lng: 28.97 } },
    });
    Object.assign(trip.days[0].stops[0], {
      transportMode: "tram",
      memory: { note: "The view was beautiful.", photo: "data:image/png;base64,AA==" },
    });
    expect(saveTrip(trip)).toBe(true);
    expect(loadTrip()).toEqual(trip);
  });

  it.each(["walk", "tram", "metro", "marmaray", "ferry", "bus", "taxi"])(
    "persists supported transport choice: %s",
    (transportMode) => {
      const trip = makeTrip();
      Object.assign(trip.days[0].stops[0], { transportMode });
      expect(saveTrip(trip)).toBe(true);
      expect(loadTrip()).toEqual(trip);
    },
  );

  it.each(["history", "food", "views", "art", "shopping"])(
    "persists supported interest: %s",
    (interest) => {
      const trip = makeTrip();
      Object.assign(trip.settings, { interests: [interest] });
      expect(saveTrip(trip)).toBe(true);
      expect(loadTrip()).toEqual(trip);
    },
  );

  it.each(["en", "tr"])("persists supported language: %s", (language) => {
    const trip = makeTrip();
    Object.assign(trip.settings, { language });
    expect(saveTrip(trip)).toBe(true);
    expect(loadTrip()).toEqual(trip);
  });

  it.each([0, 720])("persists bounded delays: %s", (delayMinutes) => {
    const trip = makeTrip();
    Object.assign(trip.days[0], { delayMinutes });
    expect(saveTrip(trip)).toBe(true);
    expect(loadTrip()).toEqual(trip);
  });

  it.each([
    { lat: 40.75, lng: 28.4 },
    { lat: 41.4, lng: 29.5 },
  ])("persists coordinates on the supported Istanbul bounds: %s", (coordinate) => {
    const trip = makeTrip();
    Object.assign(trip.settings, {
      accommodation: { label: "A hotel", coordinate },
    });
    Object.assign(trip.days[0], {
      continuation: { startTime: "12:00", origin: coordinate },
    });
    expect(saveTrip(trip)).toBe(true);
    expect(loadTrip()).toEqual(trip);
  });

  it.each([
    { field: "routeMode", value: "random" },
    { field: "routeMode", value: null },
    { field: "language", value: "de" },
    { field: "language", value: "EN" },
    { field: "language", value: null },
    { field: "interests", value: "history" },
    { field: "interests", value: ["unknown"] },
    { field: "interests", value: ["food", "food"] },
    { field: "interests", value: [null] },
    { field: "interests", value: null },
    { field: "accommodation", value: null },
    { field: "accommodation", value: { label: "" } },
    { field: "accommodation", value: { label: " ", coordinate: { lat: 41, lng: 29 } } },
    { field: "accommodation", value: { label: "x".repeat(201), coordinate: { lat: 41, lng: 29 } } },
    { field: "accommodation", value: { label: 4, coordinate: { lat: 41, lng: 29 } } },
    { field: "accommodation", value: { label: "A hotel", coordinate: { lat: 40.74, lng: 29 } } },
    { field: "accommodation", value: { label: "A hotel", coordinate: { lat: 41.41, lng: 29 } } },
    { field: "accommodation", value: { label: "A hotel", coordinate: { lat: 41, lng: 28.39 } } },
    { field: "accommodation", value: { label: "A hotel", coordinate: { lat: 41, lng: 29.51 } } },
    { field: "accommodation", value: { label: "A hotel", coordinate: { lat: "41", lng: 29 } } },
    { field: "accommodation", value: { label: "A hotel", coordinate: { lat: NaN, lng: 29 } } },
    { field: "accommodation", value: { label: "A hotel", coordinate: { lat: 41, lng: Infinity } } },
  ])("rejects invalid $field preferences: $value", ({ field, value }) => {
    const trip = makeTrip();
    Object.assign(trip.settings, { [field]: value });
    entries.set(TRIP_STORAGE_KEY, JSON.stringify(trip));
    expect(loadTrip()).toBeNull();
    expect(saveTrip(trip)).toBe(false);
  });

  it.each([
    { field: "delayMinutes", value: -1 },
    { field: "delayMinutes", value: 721 },
    { field: "delayMinutes", value: 0.5 },
    { field: "delayMinutes", value: "15" },
    { field: "delayMinutes", value: null },
    { field: "continuation", value: null },
    { field: "continuation", value: {} },
    { field: "continuation", value: { startTime: "9:00", origin: { lat: 41, lng: 29 } } },
    { field: "continuation", value: { startTime: "24:00", origin: { lat: 41, lng: 29 } } },
    { field: "continuation", value: { startTime: "12:00", origin: { lat: 42, lng: 29 } } },
    { field: "continuation", value: { startTime: "12:00", origin: { lat: 41, lng: 30 } } },
    { field: "continuation", value: { startTime: "12:00", origin: { lat: NaN, lng: 29 } } },
    { field: "continuation", value: { startTime: "12:00", origin: null } },
  ])("rejects invalid day $field: $value", ({ field, value }) => {
    const trip = makeTrip();
    Object.assign(trip.days[0], { [field]: value });
    entries.set(TRIP_STORAGE_KEY, JSON.stringify(trip));
    expect(loadTrip()).toBeNull();
    expect(saveTrip(trip)).toBe(false);
  });

  it.each([
    { field: "transportMode", value: "helicopter" },
    { field: "transportMode", value: null },
    { field: "transportMode", value: 1 },
    { field: "memory", value: null },
    { field: "memory", value: {} },
    { field: "memory", value: { note: 5 } },
    { field: "memory", value: { note: "x".repeat(501) } },
    { field: "memory", value: { note: "Visit", photo: null } },
    { field: "memory", value: { note: "Visit", photo: "javascript:alert(1)" } },
    { field: "memory", value: { note: "Visit", photo: "https://example.com/photo.png" } },
    { field: "memory", value: { note: "Visit", photo: "data:image/svg+xml;base64,PHN2Zz4=" } },
    { field: "memory", value: { note: "Visit", photo: "data:text/html;base64,PGgxPg==" } },
    { field: "memory", value: { note: "Visit", photo: "data:image/png;base64," } },
    { field: "memory", value: { note: "Visit", photo: "data:image/png;base64,A" } },
    { field: "memory", value: { note: "Visit", photo: "data:image/png;base64,=AAA" } },
    { field: "memory", value: { note: "Visit", photo: "data:image/png;base64,A<>=" } },
    { field: "memory", value: { note: "Visit", photo: "data:image/png;base64,AAAA====" } },
  ])("rejects invalid stop $field: $value", ({ field, value }) => {
    const trip = makeTrip();
    Object.assign(trip.days[0].stops[0], { [field]: value });
    entries.set(TRIP_STORAGE_KEY, JSON.stringify(trip));
    expect(loadTrip()).toBeNull();
    expect(saveTrip(trip)).toBe(false);
  });

  it.each(["jpeg", "png", "webp"])("accepts supported embedded photo type: %s", (mime) => {
    const trip = makeTrip();
    Object.assign(trip.days[0].stops[0], {
      memory: { note: "", photo: `data:image/${mime};base64,AA==` },
    });
    expect(saveTrip(trip)).toBe(true);
    expect(loadTrip()).toEqual(trip);
  });

  it("accepts a 500-character note and a 2MiB photo including base64 expansion", () => {
    const trip = makeTrip();
    Object.assign(trip.days[0].stops[0], {
      memory: {
        note: "x".repeat(500),
        photo: `data:image/jpeg;base64,${Buffer.alloc(2 * 1024 * 1024).toString("base64")}`,
      },
    });
    expect(saveTrip(trip)).toBe(true);
    expect(loadTrip()).toEqual(trip);
  });

  it("rejects a photo one byte above the 2MiB decoded size limit", () => {
    const trip = makeTrip();
    Object.assign(trip.days[0].stops[0], {
      memory: {
        note: "Visit",
        photo: `data:image/png;base64,${Buffer.alloc(2 * 1024 * 1024 + 1).toString("base64")}`,
      },
    });
    entries.set(TRIP_STORAGE_KEY, JSON.stringify(trip));
    expect(loadTrip()).toBeNull();
    expect(saveTrip(trip)).toBe(false);
  });

  it.each(["{broken json", "null", "[]", "{}", "42"])(
    "rejects corrupt stored data: %s",
    (raw) => {
      entries.set(TRIP_STORAGE_KEY, raw);
      expect(loadTrip()).toBeNull();
    },
  );

  it.each([
    [
      "unsupported version",
      (trip: any) => {
        trip.version = 2;
      },
    ],
    [
      "zero days",
      (trip: any) => {
        trip.settings.days = 0;
      },
    ],
    [
      "more than seven days",
      (trip: any) => {
        trip.settings.days = 8;
      },
    ],
    [
      "fractional day count",
      (trip: any) => {
        trip.settings.days = 2.5;
      },
    ],
    [
      "unknown accommodation area",
      (trip: any) => {
        trip.settings.stayArea = "not-a-real-area";
      },
    ],
    [
      "unknown pace",
      (trip: any) => {
        trip.settings.pace = "sprint";
      },
    ],
    [
      "impossible calendar date",
      (trip: any) => {
        trip.settings.startDate = "2027-02-29";
      },
    ],
    [
      "ambiguous date format",
      (trip: any) => {
        trip.settings.startDate = "02/29/2028";
      },
    ],
    [
      "missing itinerary day",
      (trip: any) => {
        trip.days.pop();
      },
    ],
    [
      "incorrect day identifiers",
      (trip: any) => {
        trip.days[1].id = 1;
      },
    ],
    [
      "active day outside itinerary",
      (trip: any) => {
        trip.selectedDay = 3;
      },
    ],
    [
      "unknown place",
      (trip: any) => {
        trip.days[0].stops[0].placeId = "not-a-real-place";
      },
    ],
    [
      "unknown stop state",
      (trip: any) => {
        trip.days[0].stops[0].status = "done";
      },
    ],
    [
      "duplicate stop",
      (trip: any) => {
        trip.days[0].stops.push({ ...trip.days[0].stops[0] });
      },
    ],
    [
      "invalid extra-visit flag",
      (trip: any) => {
        trip.days[0].stops[0].added = "yes";
      },
    ],
  ])("rejects %s without a browser exception", (_name, invalidate) => {
    const trip = makeTrip();
    invalidate(trip);
    entries.set(TRIP_STORAGE_KEY, JSON.stringify(trip));
    expect(loadTrip()).toBeNull();
    expect(saveTrip(trip)).toBe(false);
  });

  it("does not erase another application’s stored preferences", () => {
    entries.set("other-application", "keep me");
    saveTrip(makeTrip());
    clearTrip();
    expect(entries.get("other-application")).toBe("keep me");
  });

  it("handles denied reads, full storage, and denied removals", () => {
    const denied = () => {
      throw new DOMException("Storage denied", "SecurityError");
    };
    vi.stubGlobal("localStorage", {
      getItem: denied,
      setItem: denied,
      removeItem: denied,
    });
    expect(loadTrip()).toBeNull();
    expect(saveTrip(makeTrip())).toBe(false);
    expect(() => clearTrip()).not.toThrow();
  });

  it("works safely when localStorage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(loadTrip()).toBeNull();
    expect(saveTrip(makeTrip())).toBe(false);
    expect(() => clearTrip()).not.toThrow();
  });
});
