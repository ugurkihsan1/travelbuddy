import { describe, expect, it } from "vitest";
import { findPlace, places, stayAreas } from "../data/places";
import type { Coordinate, TripDay } from "../types";
import { getDayMapLinks, getDirectionsUrl, getMapsDirections } from "./maps";
import { getDaySchedule } from "./planner";

const origin = { lat: 41.0064, lng: 28.9768 };
const coordinateString = (coordinate: Coordinate) =>
  `${coordinate.lat},${coordinate.lng}`;

function urlStops(url: URL): string[] {
  return [
    ...(url.searchParams.get("waypoints")?.split("|") ?? []),
    url.searchParams.get("destination")!,
  ];
}

describe("Google Maps directions", () => {
  it("encodes a universal single-leg URL with explicit coordinates and no key", () => {
    const destination = { lat: -33.8688, lng: 151.2093 };
    const raw = getDirectionsUrl(origin, destination, "walking");
    const url = new URL(raw);
    expect(url.origin).toBe("https://www.google.com");
    expect(url.pathname).toBe("/maps/dir/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("origin")).toBe(coordinateString(origin));
    expect(url.searchParams.get("destination")).toBe(coordinateString(destination));
    expect(url.searchParams.get("travelmode")).toBe("walking");
    expect(url.searchParams.has("key")).toBe(false);
    expect(url.searchParams.has("waypoints")).toBe(false);
    expect(raw).toContain("origin=41.0064%2C28.9768");
    expect(raw).toContain("destination=-33.8688%2C151.2093");
  });

  it("defaults single legs to public transit for water crossings", () => {
    const url = new URL(getDirectionsUrl(origin, findPlace("kadikoy-market")!.coordinate));
    expect(url.searchParams.get("travelmode")).toBe("transit");
  });

  it.each(["walking", "driving"] as const)(
    "chunks a long %s route into mobile-safe, continuous segments",
    (mode) => {
      const stops = places.slice(0, 9);
      const links = getMapsDirections(origin, stops, mode);
      expect(links).toHaveLength(3);
      expect(links.flatMap((link) => link.stopIds)).toEqual(stops.map((stop) => stop.id));
      expect(links.flatMap((link) => link.stopNames)).toEqual(stops.map((stop) => stop.name));
      const urls = links.map((link) => new URL(link.url));
      expect(urls[0].searchParams.get("origin")).toBe(coordinateString(origin));
      urls.forEach((url, index) => {
        expect(url.searchParams.get("travelmode")).toBe(mode);
        const waypoints = url.searchParams.get("waypoints")?.split("|") ?? [];
        expect(waypoints.length).toBeLessThanOrEqual(3);
        if (index > 0)
          expect(url.searchParams.get("origin")).toBe(urls[index - 1].searchParams.get("destination"));
      });
      expect(urls.flatMap(urlStops)).toEqual(stops.map((stop) => coordinateString(stop.coordinate)));
      expect(links[0].url).toContain("%7C");
      expect(urls[2].searchParams.has("waypoints")).toBe(false);
    },
  );

  it("uses separate continuous transit links because transit ignores intermediate waypoints", () => {
    const stops = places.slice(0, 6);
    const links = getMapsDirections(origin, stops);
    expect(links).toHaveLength(stops.length);
    links.forEach((link, index) => {
      const url = new URL(link.url);
      expect(url.searchParams.get("travelmode")).toBe("transit");
      expect(url.searchParams.has("waypoints")).toBe(false);
      expect(url.searchParams.get("origin")).toBe(coordinateString(index ? stops[index - 1].coordinate : origin));
      expect(url.searchParams.get("destination")).toBe(coordinateString(stops[index].coordinate));
    });
  });

  it("never inserts venue names into query parameters", () => {
    const stop = { ...places[0], name: "A café & park?key=unsafe|other" };
    const link = getMapsDirections(origin, [stop], "walking")[0];
    expect(link.stopNames).toEqual([stop.name]);
    expect(link.url).not.toContain("unsafe");
    expect([...new URL(link.url).searchParams.keys()]).toEqual([
      "api", "origin", "destination", "travelmode",
    ]);
  });

  it("returns no links when there are no remaining visits", () => {
    expect(getMapsDirections(origin, [])).toEqual([]);
    expect(getDayMapLinks({ id: 1, title: "Done", subtitle: "", stops: [] }, origin)).toEqual([]);
  });

  it("excludes visited and skipped places from the remaining route", () => {
    const day: TripDay = {
      id: 1,
      title: "Explore",
      subtitle: "",
      stops: [
        { placeId: places[0].id, status: "visited" },
        { placeId: places[1].id, status: "pending" },
        { placeId: places[2].id, status: "skipped" },
        { placeId: places[3].id, status: "pending" },
      ],
    };
    const links = getDayMapLinks(day, origin, "walking");
    expect(links.flatMap((link) => link.stopIds)).toEqual([places[1].id, places[3].id]);
    expect(new URL(links[0].url).searchParams.get("origin")).toBe(coordinateString(origin));
    expect(urlStops(new URL(links[0].url))).toEqual([
      coordinateString(places[1].coordinate), coordinateString(places[3].coordinate),
    ]);
  });

  it("automatically groups local walks while keeping Bosphorus transit and segment continuity", () => {
    const ids = ["blue-mosque", "basilica-cistern", "hagia-sophia", "kadikoy-market", "bahariye-street"];
    const day: TripDay = {
      id: 1,
      title: "Both shores",
      subtitle: "",
      stops: ids.map((placeId) => ({ placeId, status: "pending" })),
    };
    const links = getDayMapLinks(day, stayAreas[0].coordinate);
    expect(links.flatMap((link) => link.stopIds)).toEqual(ids);
    const urls = links.map((link) => new URL(link.url));
    expect(urls.map((url) => url.searchParams.get("travelmode"))).toEqual([
      "walking", "transit", "walking",
    ]);
    expect(links[0].stopIds).toEqual(ids.slice(0, 3));
    expect(links[1].stopIds).toEqual(["kadikoy-market"]);
    expect(urls[1].searchParams.has("waypoints")).toBe(false);
    urls.slice(1).forEach((url, index) => {
      expect(url.searchParams.get("origin")).toBe(urls[index].searchParams.get("destination"));
    });
  });

  it('opens a saved taxi leg as driving and uses the same choice in walking and budget metrics', () => {
    const blue = findPlace('blue-mosque')!;
    const galata = findPlace('galata-tower')!;
    const day: TripDay = { id: 1, title: 'A chosen taxi', subtitle: '', stops: [
      { placeId: blue.id, status: 'pending' }, { placeId: galata.id, status: 'pending', transportMode: 'taxi' },
    ] };
    const links = getDayMapLinks(day, blue.coordinate);
    const taxiLink = links.find((link) => link.stopIds.includes(galata.id))!;
    const url = new URL(taxiLink.url);
    expect(url.searchParams.get('travelmode')).toBe('driving');
    expect(url.searchParams.get('origin')).toBe(coordinateString(blue.coordinate));
    expect(url.searchParams.get('destination')).toBe(coordinateString(galata.coordinate));
    const schedule = getDaySchedule(day, { days: 1, stayArea: 'sultanahmet', pace: 'balanced', startDate: '2026-10-05' }, blue.coordinate);
    expect(schedule.legOptions[galata.id].mode).toBe('taxi');
    expect(schedule.walkingKm).toBe(0);
    expect(schedule.budgetMin).toBe(schedule.legOptions[galata.id].price.min);
    expect(schedule.budgetMax).toBe(schedule.legOptions[galata.id].price.max);
    expect(links.flatMap((link) => link.stopIds)).toEqual([blue.id, galata.id]);
  });

  it.each([
    { lat: NaN, lng: 29 },
    { lat: 41, lng: Infinity },
    { lat: 91, lng: 29 },
    { lat: 41, lng: -181 },
  ])("rejects unusable coordinates rather than opening an unrelated location: %s", (invalid) => {
    expect(() => getDirectionsUrl(invalid, origin)).toThrow(RangeError);
    expect(() => getDirectionsUrl(origin, invalid)).toThrow(RangeError);
  });
});
