import { describe, expect, it } from "vitest";
import { findPlace, places, stayAreas } from "../data/places";
import { cafes } from "../data/amenities";
import {
  createTrip,
  dayDate,
  distanceKm,
  getDaySchedule,
  getChosenTransport,
  getStopTimes,
  getTransport,
  reorderRemaining,
} from "./planner";
import type { Place, TripDay, TripSettings, VenueHours } from "../types";

const settings: TripSettings = {
  days: 3,
  stayArea: "sultanahmet",
  pace: "balanced",
  startDate: "2026-10-05",
};

function placeNamed(name: RegExp): Place {
  const place = places.find((candidate) => name.test(candidate.name));
  if (!place) throw new Error(`Expected a place matching ${name}`);
  return place;
}

function plan(overrides: Partial<TripSettings> = {}): TripDay[] {
  return createTrip({ ...settings, stayArea: stayAreas[0].id, ...overrides });
}

function clockMinutes(time: string): number {
  const match = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(time);
  if (!match) throw new Error(`Expected an English clock time, received ${time}`);
  return (Number(match[1]) % 12) * 60 + Number(match[2]) + (match[3] === "PM" ? 720 : 0);
}

function scheduleFixture(): TripDay {
  return {
    id: 1,
    title: "Old City to Galata",
    subtitle: "A day with walking and public transport",
    stops: [/blue mosque/i, /hagia sophia/i, /galata tower/i].map((name) => ({
      placeId: placeNamed(name).id,
      status: "pending" as const,
    })),
  };
}

describe("Istanbul destination data", () => {
  it("provides a usable catalog with unique IDs and valid coordinates", () => {
    expect(places.length).toBeGreaterThanOrEqual(30);
    expect(stayAreas.length).toBeGreaterThan(0);
    expect(new Set(places.map((place) => place.id)).size).toBe(places.length);
    expect(new Set(stayAreas.map((area) => area.id)).size).toBe(
      stayAreas.length,
    );

    for (const place of places) {
      expect(findPlace(place.id)).toEqual(place);
      expect(place.coordinate.lat).toBeGreaterThan(40);
      expect(place.coordinate.lat).toBeLessThan(42);
      expect(place.coordinate.lng).toBeGreaterThan(28);
      expect(place.coordinate.lng).toBeLessThan(30);
      expect(place.duration).toBeGreaterThan(0);
      expect(place.description.length).toBeGreaterThan(10);
    }
  });

  it("records the known weekly museum and market closures", () => {
    expect(placeNamed(/topkap/i).closedDays).toContain(2);
    expect(placeNamed(/dolmabah/i).closedDays).toContain(1);
    expect(placeNamed(/grand bazaar/i).closedDays).toContain(0);
  });

  it("covers the expanded range of accommodation districts with explicit route regions", () => {
    expect(stayAreas.length).toBeGreaterThanOrEqual(18);
    for (const area of stayAreas) {
      expect(["old-city", "galata", "kadikoy", "bosphorus", "golden-horn", "uskudar", "islands"]).toContain(area.theme);
    }
  });
});

describe("trip planning", () => {
  it.each([1, 2, 3, 4, 5, 6, 7])(
    "creates %i useful days without repeating destinations",
    (days) => {
      const trip = plan({ days });
      expect(trip).toHaveLength(days);
      expect(trip.map((day) => day.id)).toEqual(
        Array.from({ length: days }, (_, index) => index + 1),
      );

      const ids = trip.flatMap((day) => day.stops.map((stop) => stop.placeId));
      expect(new Set(ids).size).toBe(ids.length);
      for (const day of trip) {
        expect(day.stops.length).toBeGreaterThan(0);
        expect(day.title.length).toBeGreaterThan(0);
        for (const stop of day.stops) {
          expect(findPlace(stop.placeId)).toBeDefined();
          expect(stop.status).toBe("pending");
        }
      }
    },
  );

  it("produces the same trip for the same preferences", () => {
    expect(plan()).toEqual(plan());
  });

  it.each(["relaxed", "balanced", "packed"] as const)(
    "supports the %s travel pace",
    (pace) => {
      const trip = plan({ days: 7, pace });
      expect(trip).toHaveLength(7);
      expect(trip.every((day) => day.stops.length > 0)).toBe(true);
      const ids = trip.flatMap((day) => day.stops.map((stop) => stop.placeId));
      expect(new Set(ids).size).toBe(ids.length);
    },
  );

  it.each([
    "2026-10-05",
    "2026-10-06",
    "2026-10-07",
    "2026-10-08",
    "2026-10-09",
    "2026-10-10",
    "2026-10-11",
  ])(
    "avoids weekly closures throughout a seven-day trip starting %s",
    (startDate) => {
      const trip = plan({ days: 7, startDate });
      for (const day of trip) {
        const weekday = dayDate(startDate, day.id).getUTCDay();
        for (const stop of day.stops) {
          const place = findPlace(stop.placeId);
          expect(place, `${stop.placeId} must exist`).toBeDefined();
          expect(
            place?.closedDays ?? [],
            `${place?.name} is closed on day ${day.id}`,
          ).not.toContain(weekday);
        }
      }
    },
  );

  it("keeps a relaxed itinerary no larger than a packed itinerary", () => {
    const relaxed = plan({ days: 3, pace: "relaxed" }).flatMap(
      (day) => day.stops,
    );
    const packed = plan({ days: 3, pace: "packed" }).flatMap(
      (day) => day.stops,
    );
    expect(relaxed.length).toBeLessThanOrEqual(packed.length);
  });

  it("starts an Asian-side hotel itinerary on the Asian side", () => {
    const asianHotel = stayAreas.find((area) => area.side === "asia");
    expect(asianHotel).toBeDefined();
    const firstDay = plan({ days: 1, stayArea: asianHotel!.id })[0];
    expect(findPlace(firstDay.stops[0].placeId)?.side).toBe("asia");
  });

  it("schedules Topkapi before its Tuesday closure even when the hotel is in Beyoglu", () => {
    const topkapi = placeNamed(/topkap/i);
    const trip = plan({
      days: 2,
      stayArea: "beyoglu",
      pace: "balanced",
      startDate: "2026-10-05",
    });
    expect(trip[0].stops.some((stop) => stop.placeId === topkapi.id)).toBe(
      true,
    );
    expect(dayDate("2026-10-05", trip[0].id).getUTCDay()).toBe(1);
    expect(trip[1].stops.some((stop) => stop.placeId === topkapi.id)).toBe(
      false,
    );
    expect(
      trip
        .flatMap((day) => day.stops)
        .filter((stop) => stop.placeId === topkapi.id),
    ).toHaveLength(1);
  });
});

describe("accommodation regions and late starts", () => {
  it("uses the accommodation region for every available district on an open weekday", () => {
    const districts: Record<string, RegExp> = {
      "old-city": /Fatih/,
      galata: /Fatih|Beyoğlu/,
      kadikoy: /Kadıköy/,
      bosphorus: /Beşiktaş|Sarıyer/,
      "golden-horn": /Fatih|Beyoğlu|Eyüpsultan/,
      uskudar: /Üsküdar/,
      islands: /Adalar/,
    };
    for (const area of stayAreas) {
      const firstDay = plan({ days: 1, stayArea: area.id, startDate: "2026-10-07", startTime: "09:00" })[0];
      expect(firstDay.stops.length, `${area.name} must have a useful first day`).toBeGreaterThan(0);
      for (const stop of firstDay.stops) {
        expect(findPlace(stop.placeId)?.district, `${area.name} should use its ${area.theme} route region`).toMatch(districts[area.theme!]);
      }
    }
  });

  it("makes a late-start itinerary shorter and uses public evening-friendly places", () => {
    const morning = plan({ days: 1, pace: "packed", startTime: "09:00", coffeeStops: false })[0];
    const late = plan({ days: 1, pace: "packed", startTime: "16:00", coffeeStops: false })[0];
    expect(late.stops.length).toBeGreaterThan(0);
    expect(late.stops.length).toBeLessThan(morning.stops.length);
    for (const stop of late.stops) {
      const place = findPlace(stop.placeId)!;
      expect(place.category).not.toBe("museum");
      expect(place.entry).not.toMatch(/^Paid/i);
    }
    const schedule = getDaySchedule(late, { ...settings, days: 1, startTime: "16:00", coffeeStops: false });
    expect(clockMinutes(schedule.finishTime)).toBeLessThanOrEqual(20 * 60);
    expect(schedule.lateFinish).toBe(false);
  });
});

describe("calendar and distance helpers", () => {
  it("counts the arrival date as day one and handles a month boundary", () => {
    expect(dayDate("2026-10-31", 1).toISOString()).toBe(
      "2026-10-31T09:00:00.000Z",
    );
    expect(dayDate("2026-10-31", 3).toISOString()).toBe(
      "2026-11-02T09:00:00.000Z",
    );
  });

  it("returns zero for identical points and a symmetric, plausible distance across the Bosphorus", () => {
    const sultanahmet = { lat: 41.0054, lng: 28.9768 };
    const kadikoy = { lat: 40.9916, lng: 29.0237 };
    expect(distanceKm(sultanahmet, sultanahmet)).toBe(0);
    const distance = distanceKm(sultanahmet, kadikoy);
    expect(distance).toBeGreaterThan(3);
    expect(distance).toBeLessThan(5);
    expect(distanceKm(kadikoy, sultanahmet)).toBeCloseTo(distance, 8);
  });

  it("provides valid chronological stop times for a planned day", () => {
    const day = plan({ days: 1 })[0];
    const times = getStopTimes(day);
    const minutes = day.stops.map((stop) => {
      expect(times[stop.placeId]).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
      const [clock, meridiem] = times[stop.placeId].split(" ");
      const [hours, mins] = clock.split(":").map(Number);
      expect(hours).toBeGreaterThanOrEqual(1);
      expect(hours).toBeLessThanOrEqual(12);
      expect(mins).toBeGreaterThanOrEqual(0);
      expect(mins).toBeLessThan(60);
      return (hours % 12) * 60 + mins + (meridiem === "PM" ? 720 : 0);
    });
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
  });

  it("removes skipped visits and their detours from the remaining timetable", () => {
    const blueMosque = placeNamed(/blue mosque/i);
    const hagiaSophia = placeNamed(/hagia sophia/i);
    const galata = placeNamed(/galata tower/i);
    const original: TripDay = {
      id: 1,
      title: "Historic centre to Galata",
      subtitle: "A shorter afternoon",
      stops: [blueMosque, hagiaSophia, galata].map((place) => ({
        placeId: place.id,
        status: "pending" as const,
      })),
    };
    const skipped: TripDay = {
      ...original,
      stops: original.stops.map((stop) =>
        stop.placeId === hagiaSophia.id
          ? { ...stop, status: "skipped" as const }
          : stop,
      ),
    };
    const withoutVisit: TripDay = {
      ...original,
      stops: original.stops.filter((stop) => stop.placeId !== hagiaSophia.id),
    };
    const updatedTimes = getStopTimes(skipped);
    expect(updatedTimes[hagiaSophia.id]).toBeUndefined();
    expect(updatedTimes).toEqual(getStopTimes(withoutVisit));
    expect(updatedTimes[galata.id]).not.toBe(getStopTimes(original)[galata.id]);
  });
});

describe("day schedules and coffee breaks", () => {
  it("shifts every stop and the finish when the chosen start time moves by an hour", () => {
    const day = scheduleFixture();
    const nine = getDaySchedule(day, { ...settings, startTime: "09:00", coffeeStops: false });
    const ten = getDaySchedule(day, { ...settings, startTime: "10:00", coffeeStops: false });
    for (const stop of day.stops) {
      expect(clockMinutes(ten.stopTimes[stop.placeId]) - clockMinutes(nine.stopTimes[stop.placeId])).toBe(60);
    }
    expect(clockMinutes(ten.finishTime) - clockMinutes(nine.finishTime)).toBe(60);
    expect(getDaySchedule(day, { ...settings, coffeeStops: false })).toEqual(nine);
    expect(getStopTimes(day)[day.stops[0].placeId]).toBe("9:00 AM");
    expect(getStopTimes(day, "10:00")[day.stops[0].placeId]).toBe("10:00 AM");
  });

  it("includes the hotel approach and removes it when already at the first stop", () => {
    const day = scheduleFixture();
    const first = findPlace(day.stops[0].placeId)!;
    const hotel = stayAreas.find((area) => area.id === settings.stayArea)!;
    const approach = getTransport(hotel.coordinate, first, hotel.side).recommended;
    const fromHotel = getDaySchedule(day, { ...settings, coffeeStops: false });
    const atFirstStop = getDaySchedule(day, { ...settings, coffeeStops: false }, first.coordinate);
    expect(clockMinutes(fromHotel.stopTimes[first.id]) - 9 * 60).toBe(approach.duration);
    expect(atFirstStop.stopTimes[first.id]).toBe("9:00 AM");
    expect(atFirstStop.stopTimes).toEqual(getStopTimes(day));
    expect(fromHotel.travelMinutes - atFirstStop.travelMinutes).toBe(approach.duration);
    expect(fromHotel.walkingKm - atFirstStop.walkingKm).toBeCloseTo(approach.walkingKm!, 5);
  });

  it("accounts for every visit, actual transport leg and walking segment without an implicit lunch", () => {
    const day = scheduleFixture();
    const activePlaces = day.stops.map((stop) => findPlace(stop.placeId)!);
    const hotel = stayAreas.find((area) => area.id === settings.stayArea)!;
    const legs = activePlaces.map((place, index) => {
      const previous = index === 0 ? hotel : activePlaces[index - 1];
      return getTransport(previous.coordinate, place, previous.side).recommended;
    });
    const schedule = getDaySchedule(day, { ...settings, startTime: "12:00", coffeeStops: false });
    const visits = activePlaces.reduce((total, place) => total + place.duration, 0);
    const travel = legs.reduce((total, leg) => total + leg.duration, 0);
    const walking = legs.reduce((total, leg) => total + (leg.walkingKm ?? 0), 0);
    const walkingTime = legs.reduce((total, leg) => total + (leg.walkingMinutes ?? 0), 0);
    expect(schedule.visitMinutes).toBe(visits);
    expect(schedule.travelMinutes).toBe(travel);
    expect(schedule.coffeeMinutes).toBe(0);
    expect(schedule.breakTimes).toEqual({});
    expect(clockMinutes(schedule.finishTime) - 12 * 60).toBe(visits + travel);
    expect(schedule.walkingKm).toBeCloseTo(walking, 5);
    expect(schedule.walkingMinutes).toBe(walkingTime);
    expect(schedule.walkingMinutes).toBeLessThanOrEqual(schedule.travelMinutes);
  });

  it("counts pier approach walks without treating the ferry crossing as walking", () => {
    const destination = placeNamed(/kad[ıi]k[öo]y market/i);
    const origin = { lat: 41.015, lng: 28.977 };
    const day: TripDay = { id: 1, title: "Across the water", subtitle: "A ferry day", stops: [{ placeId: destination.id, status: "pending" }] };
    const ferry = getTransport(origin, destination, "europe").recommended;
    const schedule = getDaySchedule(day, { ...settings, coffeeStops: false }, origin);
    expect(ferry.mode).toBe("ferry");
    expect(ferry.walkingKm).toBeGreaterThan(0);
    expect(schedule.walkingKm).toBeCloseTo(ferry.walkingKm!, 5);
    expect(schedule.walkingMinutes).toBe(ferry.walkingMinutes);
    expect(schedule.walkingKm).toBeLessThan(distanceKm(origin, destination.coordinate));
    expect(schedule.travelMinutes).toBe(ferry.duration);
  });

  it("honors an explicit coffee duration and shows when the break begins", () => {
    const plain = scheduleFixture();
    const first = findPlace(plain.stops[0].placeId)!;
    const day: TripDay = { ...plain, coffeeBreaks: [{ afterPlaceId: first.id, duration: 30 }] };
    const before = getDaySchedule(plain, { ...settings, coffeeStops: false });
    const after = getDaySchedule(day, { ...settings, coffeeStops: true });
    expect(after.coffeeMinutes).toBe(30);
    expect(Object.keys(after.breakTimes)).toEqual([first.id]);
    expect(clockMinutes(after.breakTimes[first.id])).toBe(clockMinutes(after.stopTimes[first.id]) + first.duration);
    expect(clockMinutes(after.stopTimes[plain.stops[1].placeId]) - clockMinutes(before.stopTimes[plain.stops[1].placeId])).toBe(30);
    expect(clockMinutes(after.finishTime) - clockMinutes(before.finishTime)).toBe(30);
  });

  it("removes a skipped visit, its coffee break and the associated travel detour", () => {
    const plain = scheduleFixture();
    const middle = plain.stops[1].placeId;
    const skipped: TripDay = {
      ...plain,
      stops: plain.stops.map((stop) => stop.placeId === middle ? { ...stop, status: "skipped" as const } : stop),
      coffeeBreaks: [{ afterPlaceId: middle, duration: 25 }],
    };
    const removed: TripDay = { ...plain, stops: plain.stops.filter((stop) => stop.placeId !== middle), coffeeBreaks: [] };
    const preferences = { ...settings, coffeeStops: true };
    const updated = getDaySchedule(skipped, preferences);
    expect(updated.stopTimes[middle]).toBeUndefined();
    expect(updated.breakTimes[middle]).toBeUndefined();
    expect(updated.coffeeMinutes).toBe(0);
    expect(updated).toEqual(getDaySchedule(removed, preferences));
  });

  it("adds twenty-minute coffee breaks after each two stops and never after the last", () => {
    const preferences: TripSettings = { ...settings, days: 1, coffeeStops: true, startTime: "09:00" };
    const day = createTrip(preferences)[0];
    const expectedIds = day.stops.filter((_, index) => index % 2 === 1 && index < day.stops.length - 1).map((stop) => stop.placeId);
    expect(day.coffeeBreaks?.map((coffee) => coffee.afterPlaceId)).toEqual(expectedIds);
    expect(day.coffeeBreaks?.every((coffee) => coffee.duration === 20)).toBe(true);
    const schedule = getDaySchedule(day, preferences);
    expect(Object.keys(schedule.breakTimes)).toEqual(expectedIds);
    expect(schedule.coffeeMinutes).toBe(expectedIds.length * 20);
    expect(schedule.breakTimes[day.stops.at(-1)!.placeId]).toBeUndefined();
    expect(clockMinutes(schedule.finishTime) - 9 * 60).toBe(schedule.visitMinutes + schedule.travelMinutes + schedule.coffeeMinutes);
  });

  it("reports when explicit extra visits extend the day beyond the planning budget", () => {
    const schedule = getDaySchedule(scheduleFixture(), { ...settings, startTime: "19:00", coffeeStops: false });
    expect(schedule.lateFinish).toBe(true);
    expect(clockMinutes(schedule.finishTime)).toBeGreaterThan(20 * 60);
  });
});

describe("transport guidance", () => {
  const sirkeci = { lat: 41.015, lng: 28.977 };

  it("uses paid access transport for a remote ferry approach rather than a many-kilometre walk", () => {
    const sariyer = { lat: 41.1666, lng: 29.0561 };
    const destination = placeNamed(/kad[ıi]k[öo]y market/i);
    const transport = getTransport(sariyer, destination, "europe");
    expect(transport.recommended.mode).toBe("ferry");
    expect(transport.recommended.walkingKm).toBeGreaterThanOrEqual(0);
    expect(transport.recommended.walkingKm).toBeLessThan(3);
    expect(transport.recommended.steps[0]).toMatch(/bus|taxi|metro|tram/i);
    expect(transport.recommended.steps[0]).not.toMatch(/^Walk to/i);
  });

  it("uses mainland Marmaray from Pendik without mistaking it for an island", () => {
    const pendik = stayAreas.find((area) => area.id === "pendik");
    expect(pendik).toBeDefined();
    const destination = placeNamed(/Üsküdar waterfront/i);
    const transport = getTransport(pendik!.coordinate, destination, "asia");
    expect(transport.recommended.mode).toBe("marmaray");
    expect(transport.recommended.title).toMatch(/Pendik/i);
    expect(transport.recommended.steps.join(" ")).not.toMatch(/Büyükada|island ferry/i);
    expect(transport.recommended.walkingKm).toBeLessThan(3);
  });

  it("suggests walking between nearby historic-center stops", () => {
    const from = placeNamed(/blue mosque/i);
    const to = placeNamed(/hagia sophia/i);
    const transport = getTransport(from.coordinate, to, "europe");
    expect(transport.recommended.mode).toBe("walk");
    expect(transport.recommended.price).toEqual({ min: 0, max: 0 });
    expect(transport.recommended.duration).toBeGreaterThan(0);
  });

  it("prefers a ferry from Europe to Kadikoy and clearly labels paid fares as estimates", () => {
    const kadikoy = places.find((place) =>
      /kad[ıi]k[öo]y/i.test(place.district),
    );
    expect(kadikoy).toBeDefined();
    const transport = getTransport(sirkeci, kadikoy!, "europe");
    expect(transport.recommended.mode).toBe("ferry");
    expect(
      transport.alternatives.some((option) => option.mode === "taxi"),
    ).toBe(true);

    for (const option of [transport.recommended, ...transport.alternatives]) {
      expect(option.duration).toBeGreaterThan(0);
      expect(option.price.min).toBeGreaterThanOrEqual(0);
      expect(option.price.max).toBeGreaterThanOrEqual(option.price.min);
      expect(option.steps.length).toBeGreaterThan(0);
      if (option.price.max > 0) expect(option.note).toMatch(/estimat|approx/i);
    }
  });

  it("prefers Marmaray from Sirkeci to Uskudar", () => {
    const uskudar = places.find((place) =>
      /[üu]sk[üu]dar/i.test(place.district),
    );
    expect(uskudar).toBeDefined();
    expect(getTransport(sirkeci, uskudar!, "europe").recommended.mode).toBe(
      "marmaray",
    );
  });

  it("prefers the nearby ferry for the Besiktas to Uskudar crossing", () => {
    const uskudar = places.find((place) =>
      /[üu]sk[üu]dar/i.test(place.district),
    );
    expect(uskudar).toBeDefined();
    const besiktasPier = { lat: 41.0414, lng: 29.0071 };
    expect(
      getTransport(besiktasPier, uskudar!, "europe").recommended.mode,
    ).toBe("ferry");
  });

  it("uses an island ferry rather than a city taxi to reach Buyukada", () => {
    const island = placeNamed(/b[üu]y[üu]kada village/i);
    const transport = getTransport(sirkeci, island, "europe");
    expect(transport.recommended.mode).toBe("ferry");
    expect(transport.recommended.steps.join(" ")).toMatch(/return/i);
    expect(
      transport.alternatives.some((option) => option.mode === "taxi"),
    ).toBe(false);
  });

  it("uses a return island ferry when continuing from Buyukada to the mainland", () => {
    const island = placeNamed(/b[üu]y[üu]kada village/i);
    const mainland = placeNamed(/blue mosque/i);
    const transport = getTransport(island.coordinate, mainland, "asia");
    expect(transport.recommended.mode).toBe("ferry");
    expect(transport.recommended.steps.join(" ")).toMatch(/Büyükada/i);
    expect(
      transport.alternatives.some((option) => option.mode === "taxi"),
    ).toBe(false);
  });

  it("takes a southbound shore-road bus from Bebek to Ortakoy", () => {
    const from = placeNamed(/bebek park/i);
    const to = placeNamed(/ortak[öo]y waterfront/i);
    const transport = getTransport(from.coordinate, to, "europe");
    const directions = transport.recommended.steps.join(" ");
    expect(transport.recommended.mode).toBe("bus");
    expect(directions).toMatch(/southbound.*Beşiktaş.*Kabataş/i);
    expect(directions).not.toMatch(/northbound/i);
  });

  it("boards locally when already on the Bosphorus shore from Ortakoy to Arnavutkoy", () => {
    const from = placeNamed(/ortak[öo]y waterfront/i);
    const to = placeNamed(/arnavutk[öo]y waterfront/i);
    const transport = getTransport(from.coordinate, to, "europe");
    const directions = transport.recommended.steps.join(" ");
    expect(transport.recommended.mode).toBe("bus");
    expect(directions).toMatch(/nearest signed bus stop/i);
    expect(directions).not.toMatch(/Reach Beşiktaş or Kabataş/i);
  });

  it("uses T5 along the same Golden Horn bank from Balat to Eyup", () => {
    const from = placeNamed(/balat/i);
    const to = placeNamed(/ey[üu]p sultan mosque/i);
    const transport = getTransport(from.coordinate, to, "europe");
    expect(transport.recommended.mode).toBe("tram");
    expect(transport.recommended.steps.join(" ")).toMatch(/T5/i);
  });

  it("uses a Golden Horn bridge instead of a direct walk from Balat to the Rahmi Koc Museum", () => {
    const from = placeNamed(/balat/i);
    const to = placeNamed(/rahmi.*ko[çc]/i);
    const transport = getTransport(from.coordinate, to, "europe");
    expect(transport.recommended.mode).toBe("taxi");
    expect(transport.recommended.steps.join(" ")).toMatch(
      /Golden Horn bridge/i,
    );
    expect(
      transport.alternatives.some((option) => option.mode === "walk"),
    ).toBe(false);
  });
});

describe("updating the remaining route", () => {
  it("preserves completed history, orders remaining stops from the current position, and leaves its input intact", () => {
    const blueMosque = placeNamed(/blue mosque/i);
    const hagiaSophia = placeNamed(/hagia sophia/i);
    const galata = placeNamed(/galata tower/i);
    const topkapi = placeNamed(/topkap/i);
    const bazaar = placeNamed(/grand bazaar/i);
    const day: TripDay = {
      id: 1,
      title: "A day in Istanbul",
      subtitle: "An updated route",
      stops: [
        { placeId: galata.id, status: "pending" },
        { placeId: topkapi.id, status: "visited" },
        { placeId: hagiaSophia.id, status: "pending", added: true },
        { placeId: bazaar.id, status: "skipped" },
        { placeId: blueMosque.id, status: "pending" },
        { placeId: blueMosque.id, status: "pending" },
      ],
    };
    const original = structuredClone(day);
    const updated = reorderRemaining(day, blueMosque.coordinate);

    expect(day).toEqual(original);
    expect(updated.stops.slice(0, 2)).toEqual([
      original.stops[1],
      original.stops[3],
    ]);
    expect(updated.stops.slice(2).map((stop) => stop.placeId)).toEqual([
      blueMosque.id,
      hagiaSophia.id,
      galata.id,
    ]);
    expect(
      updated.stops.find((stop) => stop.placeId === hagiaSophia.id)?.added,
    ).toBe(true);
    expect(new Set(updated.stops.map((stop) => stop.placeId)).size).toBe(
      updated.stops.length,
    );
  });

  it("can update an itinerary with no pending stops", () => {
    const day: TripDay = {
      id: 1,
      title: "Finished",
      subtitle: "All done",
      stops: places
        .slice(0, 2)
        .map((place, index) => ({
          placeId: place.id,
          status: index ? ("skipped" as const) : ("visited" as const),
        })),
    };
    expect(reorderRemaining(day, stayAreas[0].coordinate)).toEqual(day);
  });
});

describe('saved transport preferences and continuing the day', () => {
  it('uses a chosen taxi for arrival times, walking totals, leg details and the transport budget', () => {
    const blue = placeNamed(/blue mosque/i);
    const galata = placeNamed(/galata tower/i);
    const day: TripDay = { id: 1, title: 'Two stops', subtitle: '', stops: [
      { placeId: blue.id, status: 'pending' }, { placeId: galata.id, status: 'pending' },
    ] };
    const original = structuredClone(day);
    const automatic = getDaySchedule(day, settings, blue.coordinate);
    const chosenDay: TripDay = { ...day, stops: day.stops.map((stop) => stop.placeId === galata.id ? { ...stop, transportMode: 'taxi' } : stop) };
    const selected = getDaySchedule(chosenDay, settings, blue.coordinate);
    const taxi = getChosenTransport(blue.coordinate, galata, 'taxi', 'europe');
    expect(taxi.mode).toBe('taxi');
    expect(selected.legOptions[galata.id]).toEqual(taxi);
    expect(selected.walkingKm).toBe(0);
    expect(selected.walkingMinutes).toBe(0);
    expect(selected.walkingKm).toBeLessThan(automatic.walkingKm);
    expect(clockMinutes(selected.stopTimes[galata.id])).toBe(9 * 60 + blue.duration + taxi.duration);
    expect(selected.stopTimes[galata.id]).not.toBe(automatic.stopTimes[galata.id]);
    expect(selected.budgetMin).toBe(taxi.price.min);
    expect(selected.budgetMax).toBe(taxi.price.max);
    expect(selected.budgetMax).toBeGreaterThan(automatic.budgetMax);
    expect(day).toEqual(original);
  });

  it('falls back to an available connection when a saved mode is unavailable from this origin', () => {
    const blue = placeNamed(/blue mosque/i);
    const hagia = placeNamed(/hagia sophia/i);
    expect(getChosenTransport(blue.coordinate, hagia, 'marmaray', 'europe')).toEqual(getTransport(blue.coordinate, hagia, 'europe').recommended);
    const island = placeNamed(/b[üu]y[üu]kada village/i);
    expect(getChosenTransport(island.coordinate, blue, 'taxi', 'asia').mode).toBe('ferry');
  });

  it('continues only pending visits from the saved origin and time, with a thirty-minute delay', () => {
    const blue = placeNamed(/blue mosque/i);
    const galata = placeNamed(/galata tower/i);
    const topkapi = placeNamed(/topkap/i);
    const hagia = placeNamed(/hagia sophia/i);
    const day: TripDay = { id: 1, title: 'Continue from here', subtitle: '', delayMinutes: 30,
      continuation: { startTime: '13:15', origin: blue.coordinate },
      stops: [
        { placeId: topkapi.id, status: 'visited' }, { placeId: hagia.id, status: 'skipped' },
        { placeId: blue.id, status: 'pending' }, { placeId: galata.id, status: 'pending' },
      ], coffeeBreaks: [{ afterPlaceId: topkapi.id, duration: 20 }, { afterPlaceId: blue.id, duration: 10 }],
    };
    const original = structuredClone(day);
    const schedule = getDaySchedule(day, settings, stayAreas.find((area) => area.id === 'florya')!.coordinate);
    expect(Object.keys(schedule.stopTimes)).toEqual([blue.id, galata.id]);
    expect(schedule.stopTimes[blue.id]).toBe('1:45 PM');
    expect(schedule.legOptions[blue.id].duration).toBe(0);
    expect(schedule.openingChecks[topkapi.id]).toBeUndefined();
    expect(schedule.openingChecks[hagia.id]).toBeUndefined();
    expect(schedule.breakTimes[topkapi.id]).toBeUndefined();
    expect(schedule.coffeeMinutes).toBe(10);
    expect(schedule.visitMinutes).toBe(blue.duration + galata.duration);
    expect(clockMinutes(schedule.finishTime) - (13 * 60 + 15)).toBe(30 + schedule.travelMinutes + schedule.visitMinutes + schedule.coffeeMinutes + schedule.waitMinutes);
    expect(day).toEqual(original);
  });

  it('uses a continuation on the Asian side even when the accommodation is in Europe', () => {
    const blue = placeNamed(/blue mosque/i);
    const uskudar = placeNamed(/Üsküdar waterfront/i);
    const day: TripDay = { id: 1, title: '', subtitle: '', continuation: { startTime: '12:00', origin: uskudar.coordinate }, stops: [{ placeId: blue.id, status: 'pending' }] };
    const schedule = getDaySchedule(day, settings);
    expect(schedule.legOptions[blue.id].mode).toBe('marmaray');
    expect(schedule.legOptions[blue.id]).toEqual(getChosenTransport(uskudar.coordinate, blue));
    expect(clockMinutes(schedule.stopTimes[blue.id]) - 12 * 60).toBe(schedule.legOptions[blue.id].duration);
  });

  it('changes a one-day route meaningfully for history/art compared with food interests', () => {
    const historic = plan({ days: 1, interests: ['history', 'art'] })[0];
    const foodie = plan({ days: 1, interests: ['food'] })[0];
    expect(historic.stops.map((stop) => stop.placeId)).not.toEqual(foodie.stops.map((stop) => stop.placeId));
    expect(historic.stops.some((stop) => findPlace(stop.placeId)?.category === 'museum')).toBe(true);
    expect(foodie.stops.some((stop) => findPlace(stop.placeId)?.category === 'food')).toBe(true);
    expect(historic.title).not.toBe(foodie.title);
  });

  it('uses exact accommodation coordinates for the first approach and nearest first stop', () => {
    const bazaar = placeNamed(/grand bazaar/i);
    const preferences: TripSettings = { ...settings, days: 1, accommodation: { label: 'My hotel by the bazaar', coordinate: bazaar.coordinate } };
    const day = createTrip(preferences)[0];
    expect(day.stops[0].placeId).toBe(bazaar.id);
    const schedule = getDaySchedule(day, preferences);
    expect(schedule.legOptions[bazaar.id].duration).toBe(0);
    expect(schedule.legOptions[bazaar.id].walkingKm).toBe(0);
    expect(schedule.stopTimes[bazaar.id]).toBe('9:00 AM');
  });

  it('accounts for waiting until fresh verified hours open without inventing a visit time', () => {
    const blue = placeNamed(/blue mosque/i);
    const hours: VenueHours = { status: 'verified', checkedAt: new Date().toISOString(), sourceUrl: 'https://example.org/official-hours', windows: [{ weekdays: [1], open: '11:00', close: '17:00' }] };
    const day: TripDay = { id: 1, title: '', subtitle: '', stops: [{ placeId: blue.id, status: 'pending' }] };
    const schedule = getDaySchedule(day, settings, blue.coordinate, { [blue.id]: hours });
    expect(schedule.openingChecks[blue.id].status).toBe('open');
    expect(schedule.waitMinutes).toBe(120);
    expect(schedule.stopTimes[blue.id]).toBe('11:00 AM');
    expect(clockMinutes(schedule.finishTime) - 9 * 60).toBe(schedule.travelMinutes + schedule.visitMinutes + schedule.coffeeMinutes + schedule.waitMinutes);
  });

  it('uses the chosen cafe as the next leg origin and includes both detour walking and the coffee duration', () => {
    const galata = placeNamed(/galata tower/i);
    const istiklal = findPlace('istiklal')!;
    const cafe = cafes.find((candidate) => candidate.id === 'kronotrop-cihangir')!;
    const day: TripDay = { id: 1, title: 'A coffee detour', subtitle: '', stops: [
      { placeId: galata.id, status: 'pending' }, { placeId: istiklal.id, status: 'pending' },
    ], coffeeBreaks: [{ afterPlaceId: galata.id, duration: 25, cafeId: cafe.id }] };
    const original = structuredClone(day);
    const schedule = getDaySchedule(day, settings, galata.coordinate);
    const toCafeKm = distanceKm(galata.coordinate, cafe.coordinate) * 1.3;
    const toCafeMinutes = Math.ceil(toCafeKm / 4.5 * 60);
    const onward = getChosenTransport(cafe.coordinate, istiklal);
    expect(schedule.legOrigins[galata.id]).toEqual(galata.coordinate);
    expect(schedule.legOrigins[istiklal.id]).toEqual(cafe.coordinate);
    expect(schedule.legOptions[istiklal.id]).toEqual(onward);
    expect(schedule.walkingKm).toBeCloseTo(toCafeKm + (onward.walkingKm ?? 0), 2);
    expect(schedule.walkingMinutes).toBe(toCafeMinutes + (onward.walkingMinutes ?? 0));
    expect(schedule.travelMinutes).toBe(toCafeMinutes + onward.duration);
    expect(schedule.coffeeMinutes).toBe(25);
    expect(clockMinutes(schedule.breakTimes[galata.id])).toBe(9 * 60 + galata.duration + toCafeMinutes);
    expect(clockMinutes(schedule.finishTime) - 9 * 60).toBe(schedule.travelMinutes + schedule.visitMinutes + schedule.coffeeMinutes + schedule.waitMinutes);
    expect(day).toEqual(original);
  });

  it('removes a selected cafe detour when its preceding visit is skipped', () => {
    const galata = placeNamed(/galata tower/i);
    const istiklal = findPlace('istiklal')!;
    const day: TripDay = { id: 1, title: '', subtitle: '', stops: [
      { placeId: galata.id, status: 'skipped' }, { placeId: istiklal.id, status: 'pending' },
    ], coffeeBreaks: [{ afterPlaceId: galata.id, duration: 25, cafeId: 'kronotrop-cihangir' }] };
    const schedule = getDaySchedule(day, settings, istiklal.coordinate);
    expect(schedule.coffeeMinutes).toBe(0);
    expect(schedule.walkingKm).toBe(0);
    expect(schedule.breakTimes[galata.id]).toBeUndefined();
    expect(schedule.legOrigins[istiklal.id]).toEqual(istiklal.coordinate);
  });

  it('keeps an unknown-hours visit but rejects a freshly verified window too short for that visit', () => {
    const cistern = findPlace('basilica-cistern')!;
    const preferences = { ...settings, days: 1 };
    const unverified = createTrip(preferences)[0];
    const hours: VenueHours = { status: 'verified', checkedAt: new Date().toISOString(), sourceUrl: 'https://example.org/official-hours', windows: [{ weekdays: [1], open: '09:00', close: '09:30' }] };
    const verified = createTrip(preferences, { [cistern.id]: hours })[0];
    expect(unverified.stops.some((stop) => stop.placeId === cistern.id)).toBe(true);
    expect(verified.stops.some((stop) => stop.placeId === cistern.id)).toBe(false);
    expect(verified.stops.length).toBeGreaterThan(0);
    expect(new Set(verified.stops.map((stop) => stop.placeId)).size).toBe(verified.stops.length);
  });

  it('builds a plan that waits for fresh verified opening rather than using the unknown-hours arrival', () => {
    const blue = placeNamed(/blue mosque/i);
    const preferences: TripSettings = { ...settings, days: 1, accommodation: { label: 'At the first square', coordinate: blue.coordinate } };
    const hours: VenueHours = { status: 'verified', checkedAt: new Date().toISOString(), sourceUrl: 'https://example.org/official-hours', windows: [{ weekdays: [1], open: '10:00', close: '17:00' }] };
    const day = createTrip(preferences, { [blue.id]: hours })[0];
    expect(day.stops.some((stop) => stop.placeId === blue.id)).toBe(true);
    const verified = getDaySchedule(day, preferences, undefined, { [blue.id]: hours });
    const unknown = getDaySchedule(day, preferences);
    expect(verified.stopTimes[blue.id]).toBe('10:00 AM');
    expect(unknown.stopTimes[blue.id]).toBe('9:00 AM');
    expect(verified.waitMinutes).toBe(60);
    expect(verified.openingChecks[blue.id].status).toBe('open');
    expect(unknown.openingChecks[blue.id].status).toBe('unverified');
    expect(verified.lateFinish).toBe(false);
  });
});

// Interest selection must affect actual visits, including short balanced trips.
it('gives an art-focused one-day visitor museum stops rather than only a museum district', () => {
  const day=createTrip({days:1,stayArea:'sultanahmet',pace:'balanced',startDate:'2026-10-08',interests:['art']})[0];
  expect(day.stops.some(stop=>stop.placeId==='pera-museum'||stop.placeId==='istanbul-modern')).toBe(true);
});
