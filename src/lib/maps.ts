import { findPlace } from "../data/places";
import { getChosenTransport } from "./planner";
import type { Coordinate, Place, TripDay } from "../types";

export type MapsTravelMode = "walking" | "transit" | "driving";
export type DayMapsTravelMode = MapsTravelMode | "auto";
export type MapsDirectionsLink = {
  url: string;
  label: string;
  stopNames: string[];
  stopIds: string[];
};

function coordinateQuery(coordinate: Coordinate): string {
  if (
    !Number.isFinite(coordinate.lat) ||
    !Number.isFinite(coordinate.lng) ||
    Math.abs(coordinate.lat) > 90 ||
    Math.abs(coordinate.lng) > 180
  )
    throw new RangeError("Choose valid latitude and longitude coordinates.");
  return `${coordinate.lat},${coordinate.lng}`;
}

function directionsUrl(
  origin: Coordinate,
  destination: Coordinate,
  mode: MapsTravelMode,
  waypoints: Coordinate[] = [],
): string {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", coordinateQuery(origin));
  url.searchParams.set("destination", coordinateQuery(destination));
  url.searchParams.set("travelmode", mode);
  if (waypoints.length)
    url.searchParams.set("waypoints", waypoints.map(coordinateQuery).join("|"));
  return url.toString();
}

/** Universal Maps URLs open on web or mobile and do not require an API key. */
export function getDirectionsUrl(
  origin: Coordinate,
  destination: Coordinate,
  mode: MapsTravelMode = "transit",
): string {
  return directionsUrl(origin, destination, mode);
}

/** Pass the remaining places in itinerary order, starting at the hotel or current location. */
export function getMapsDirections(
  origin: Coordinate,
  stops: Place[],
  mode: MapsTravelMode = "transit",
): MapsDirectionsLink[] {
  // Transit routes do not reliably support intermediate destinations. Separate
  // legs preserve every stop and allow Google Maps to plan ferry/rail crossings.
  // Walking/driving links use the mobile limit: three waypoints + a destination.
  const stopsPerSegment = mode === "transit" ? 1 : 4;
  const segmentCount = Math.ceil(stops.length / stopsPerSegment);
  const links: MapsDirectionsLink[] = [];
  let position = origin;

  for (let index = 0; index < stops.length; index += stopsPerSegment) {
    const segment = stops.slice(index, index + stopsPerSegment);
    const destination = segment[segment.length - 1];
    const segmentNumber = links.length + 1;
    links.push({
      url: directionsUrl(
        position,
        destination.coordinate,
        mode,
        segment.slice(0, -1).map((stop) => stop.coordinate),
      ),
      label:
        segmentCount === 1
          ? "Open route in Google Maps"
          : mode === "transit"
            ? `${segmentNumber}. ${destination.name}`
            : `Route ${segmentNumber} of ${segmentCount}`,
      stopNames: segment.map((stop) => stop.name),
      stopIds: segment.map((stop) => stop.id),
    });
    position = destination.coordinate;
  }
  return links;
}

/** Completed and skipped visits are excluded from the route that remains. */
export function getDayMapLinks(
  day: TripDay,
  origin: Coordinate,
  mode: DayMapsTravelMode = "auto",
): MapsDirectionsLink[] {
  const stops = day.stops
    .filter((stop) => stop.status === "pending")
    .map((stop) => findPlace(stop.placeId))
    .filter((place): place is Place => place !== undefined);
  if (mode !== "auto") return getMapsDirections(origin, stops, mode);

  const segments: {
    origin: Coordinate;
    stops: Place[];
    mode: MapsTravelMode;
  }[] = [];
  let previous: Place | undefined;
  let position = origin;
  for (const stop of stops) {
    const savedStop = day.stops.find(s => s.placeId === stop.id);
    const recommendation = getChosenTransport(position, stop, savedStop?.transportMode, previous?.side).mode;
    const legMode: MapsTravelMode =
      recommendation === "walk"
        ? "walking"
        : recommendation === "taxi"
          ? "driving"
          : "transit";
    const segment = segments[segments.length - 1];
    if (
      legMode !== "transit" &&
      segment?.mode === legMode &&
      segment.stops.length < 4
    )
      segment.stops.push(stop);
    else segments.push({ origin: position, stops: [stop], mode: legMode });
    previous = stop;
    position = stop.coordinate;
  }
  return segments.map((segment) => {
    const link = getMapsDirections(
      segment.origin,
      segment.stops,
      segment.mode,
    )[0];
    const action =
      segment.mode === "walking"
        ? "Walk"
        : segment.mode === "driving"
          ? "Drive"
          : "Transit";
    return {
      ...link,
      label: `${action} to ${segment.stops[segment.stops.length - 1].name}`,
    };
  });
}
