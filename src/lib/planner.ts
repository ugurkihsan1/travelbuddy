import { findPlace, stayAreas } from "../data/places";
import { cafes } from "../data/amenities";
import type {
  Coordinate,
  Place,
  PlannedStop,
  TransportOption,
  TransportRecommendation,
  TripDay,
  TripSettings,
  VenueHours,
} from "../types";

import { checkVisitHours } from "./opening-hours";

type DayTheme = {
  key: string;
  title: string;
  subtitle: string;
  places: string[];
  anchors?: string[];
};

const themes: DayTheme[] = [
  {
    key: "old-city",
    title: "The heart of old Istanbul",
    subtitle: "Sultanahmet · palaces, mosaics & hidden history",
    places: [
      "blue-mosque",
      "basilica-cistern",
      "hagia-sophia",
      "topkapi-palace",
      "grand-bazaar",
      "hippodrome",
      "gulhane-park",
      "archaeology-museums",
      "sultanahmet-square",
      "sirkeci-waterfront",
    ],
    anchors: ["topkapi-palace", "grand-bazaar"],
  },
  {
    key: "galata",
    title: "Across the Golden Horn",
    subtitle: "Eminönü · Karaköy · Galata · café streets & city views",
    places: [
      "spice-bazaar",
      "galata-bridge",
      "karakoy",
      "galata-tower",
      "istiklal",
      "pera-museum",
      "taksim-square",
      "istanbul-modern",
    ],
  },
  {
    key: "kadikoy",
    title: "A little more local",
    subtitle: "Kadıköy · Moda · markets, neighbourhoods & sea air",
    places: [
      "kadikoy-market",
      "bahariye-street",
      "moda",
      "moda-pier",
      "sureyya-opera",
      "yogurtcu-park",
      "haydarpasa-viewpoint",
      "fenerbahce-park",
    ],
  },
  {
    key: "bosphorus",
    title: "Follow the Bosphorus",
    subtitle: "Beşiktaş · Ortaköy · palaces & waterside villages",
    places: [
      "dolmabahce-palace",
      "besiktas-market",
      "yildiz-park",
      "ortakoy",
      "arnavutkoy",
      "bebek-park",
      "rumeli-fortress-view",
      "naval-museum",
    ],
    anchors: ["dolmabahce-palace"],
  },
  {
    key: "golden-horn",
    title: "Colour along the Golden Horn",
    subtitle: "Fener · Balat · Eyüp · heritage streets & hilltop views",
    places: [
      "chora-mosque",
      "balat",
      "fener",
      "suleymaniye",
      "eyup-sultan-mosque",
      "pierre-loti",
      "rahmi-koc-museum",
      "balat-waterfront",
    ],
  },
  {
    key: "uskudar",
    title: "The quieter shore",
    subtitle: "Üsküdar · Kuzguncuk · Asian-side gardens & sunsets",
    places: [
      "uskudar-waterfront",
      "mihrimah-sultan-mosque",
      "kuzguncuk",
      "salacak",
      "beylerbeyi-palace",
      "fethi-pasa-grove",
      "valide-atikk",
    ],
    anchors: ["beylerbeyi-palace"],
  },
  {
    key: "islands",
    title: "An island kind of day",
    subtitle: "Büyükada · a full-day ferry escape; check the return sailing",
    places: [
      "buyukada-pier",
      "buyukada-mansions",
      "buyukada-waterfront",
      "dilburnu",
      "aya-yorgi",
    ],
  },
];

const eveningPlaces = new Set([
  "hippodrome", "sultanahmet-square", "sirkeci-waterfront", "galata-bridge", "karakoy", "istiklal", "taksim-square",
  "bahariye-street", "moda", "moda-pier", "sureyya-opera", "haydarpasa-viewpoint", "besiktas-market", "ortakoy", "arnavutkoy", "bebek-park",
  "balat-waterfront", "uskudar-waterfront", "kuzguncuk", "salacak",
]);

function automaticCoffeeBreaks(stops: PlannedStop[]): { afterPlaceId: string; duration: number }[] {
  const active = stops.filter((stop) => stop.status !== "skipped" && findPlace(stop.placeId));
  return active.flatMap((stop, index) => (index + 1) % 2 === 0 && index < active.length - 1
    ? [{ afterPlaceId: stop.placeId, duration: 20 }] : []);
}

function paidIndoorVisit(place: Place): boolean {
  return place.category === "museum" || /^Paid |^Visitor entry conditions|^Nature-park/.test(place.entry);
}

export function distanceKm(a: Coordinate, b: Coordinate): number {
  const radians = (angle: number) => (angle * Math.PI) / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) *
      Math.cos(radians(b.lat)) *
      Math.sin(dLng / 2) ** 2;
  return (
    6371 *
    2 *
    Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)))
  );
}

/** Noon in Istanbul is 09:00 UTC. Keep weekday arithmetic away from midnight. */
export function dayDate(startDate: string, dayId: number): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate))
    throw new RangeError("Start date must use YYYY-MM-DD.");
  const [year, month, day] = startDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 9));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError("Choose a valid calendar date.");
  }
  date.setUTCDate(date.getUTCDate() + Math.max(0, Math.trunc(dayId) - 1));
  return date;
}

function nearestStops(stops: PlannedStop[], origin: Coordinate): PlannedStop[] {
  const remaining = [...stops];
  const ordered: PlannedStop[] = [];
  let position = origin;
  while (remaining.length) {
    let nearest = 0;
    let shortest = Infinity;
    remaining.forEach((stop, index) => {
      const destination = findPlace(stop.placeId);
      const distance = destination
        ? distanceKm(position, destination.coordinate)
        : Infinity;
      if (distance < shortest) {
        shortest = distance;
        nearest = index;
      }
    });
    const next = remaining.splice(nearest, 1)[0];
    ordered.push({ ...next });
    position = findPlace(next.placeId)?.coordinate ?? position;
  }
  return ordered;
}

function scheduleThemes(
  selected: DayTheme[],
  startDate: string,
  stopCount: number,
): DayTheme[] {
  const weekdays = selected.map((_, index) =>
    dayDate(startDate, index + 1).getUTCDay(),
  );
  const memo = new Map<number, { cost: number; order: number[] }>();
  const assign = (
    mask: number,
    day: number,
  ): { cost: number; order: number[] } => {
    if (day === selected.length) return { cost: 0, order: [] };
    const cached = memo.get(mask);
    if (cached) return cached;
    let best = { cost: Infinity, order: [] as number[] };
    selected.forEach((theme, index) => {
      if (mask & (1 << index)) return;
      const closureCost = theme.places
        .slice(0, stopCount)
        .reduce((score, placeId) => {
          if (!findPlace(placeId)?.closedDays?.includes(weekdays[day]))
            return score;
          return score + (theme.anchors?.includes(placeId) ? 100 : 40);
        }, 0);
      const next = assign(mask | (1 << index), day + 1);
      const cost = closureCost + Math.abs(index - day) + next.cost;
      if (cost < best.cost) best = { cost, order: [index, ...next.order] };
    });
    memo.set(mask, best);
    return best;
  };
  return assign(0, 0).order.map((index) => selected[index]);
}

export function createTrip(settings: TripSettings, hoursById: Record<string, VenueHours | undefined> = {}): TripDay[] {
  const totalDays = Math.min(7, Math.max(1, Math.trunc(settings.days) || 1));
  const stay =
    stayAreas.find((area) => area.id === settings.stayArea) ?? stayAreas[0];
  const interests = settings.interests ?? [];
  const interestCategories: Record<string,string[]> = {history:['landmark','museum'],food:['food','market'],views:['viewpoint','park'],art:['museum'],shopping:['market','neighborhood']};
  const placeInterest = (id:string) => interests.reduce((value,interest) => value + (interestCategories[interest]?.includes(findPlace(id)?.category??'') ? 1 : 0),0);
  const affinity: Record<string, string[]> = { history: ['old-city','golden-horn','uskudar'], food: ['kadikoy','galata'], views: ['bosphorus','islands','uskudar'], art: ['galata'], shopping: ['galata','old-city','kadikoy'] };
  const score = (key: string) => interests.reduce((n, interest) => n + (affinity[interest]?.includes(key) ? 1 : 0), 0);
  const priority = [...themes].sort((a,b) => score(b.key) - score(a.key));
  // Start near the hotel, then give shorter trips the essential cross-city contrast.
  const firstTheme = interests.length && score(priority[0].key) > score(stay.theme ?? "old-city") ? priority[0].key : stay.theme ?? (stay.side === "asia" ? "kadikoy" : "old-city");
  const firstIndex = priority.findIndex((theme) => theme.key === firstTheme);
  if (firstIndex >= 0) priority.unshift(...priority.splice(firstIndex, 1));
  const used = new Set<string>();
  const count =
    settings.pace === "relaxed" ? 4 : settings.pace === "packed" ? 7 : 5;
  // Optimize the whole week: an open museum today may be closed tomorrow.
  // With at most seven themes this small assignment needs only 128 states.
  // Closure avoidance takes priority; otherwise keep hotel-near, familiar order.
  const scheduledThemes = scheduleThemes(
    priority.slice(0, totalDays),
    settings.startDate,
    count,
  );
  const trip: TripDay[] = [];

  for (let id = 1; id <= totalDays; id += 1) {
    const weekday = dayDate(settings.startDate, id).getUTCDay();
    const theme = scheduledThemes[id - 1];
    const startMinutes = parseTime(settings.startTime ?? "09:00");
    const eveningStart = startMinutes >= 15 * 60;
    const candidates = theme.places.filter((placeId) => {
      const place = findPlace(placeId);
      return (
        place && !used.has(placeId) && !place.closedDays?.includes(weekday) && (!eveningStart || eveningPlaces.has(placeId))
      );
    }).sort((a,b)=>placeInterest(b)-placeInterest(a));
    // Island walks take longer, and the hill climb is intentionally optional at slower paces.
    const targetCount =
      theme.key === "islands"
        ? settings.pace === "packed"
          ? 5
          : settings.pace === "relaxed"
            ? 3
            : 4
        : count;
    const stops: PlannedStop[] = candidates
      .slice(0, targetCount)
      .map((placeId) => ({ placeId, status: "pending" }));
    // Each day begins at the accommodation, rather than yesterday's final stop.
    const ordered = nearestStops(stops, settings.accommodation?.coordinate ?? stay.coordinate);
    const day: TripDay = {
      id,
      title: theme.title,
      subtitle: theme.subtitle + (eveningStart ? " · public evening stops; indoor opening hours are unverified" : ""),
      stops: [],
    };
    for (const stop of ordered) {
      const proposedStops = [...day.stops, stop];
      const proposed: TripDay = { ...day, stops: proposedStops,
        ...(settings.coffeeStops ? { coffeeBreaks: automaticCoffeeBreaks(proposedStops) } : {}) };
      const schedule = getDaySchedule(proposed, settings, settings.accommodation?.coordinate ?? stay.coordinate, hoursById);
      const arrival = parseClock(schedule.stopTimes[stop.placeId]);
      const access = schedule.openingChecks[stop.placeId];
      if (access.status === 'closed' || access.status === 'outside-hours') continue;
      // This is a conservative planning cutoff, never an asserted official closing hour.
      if (access.status === 'unverified' && startMinutes >= 12 * 60 && paidIndoorVisit(findPlace(stop.placeId)!) && arrival >= 15 * 60) continue;
      if (schedule.lateFinish) continue;
      day.stops.push(stop);
    }
    if (settings.coffeeStops) day.coffeeBreaks = automaticCoffeeBreaks(day.stops);
    day.stops.forEach((stop) => used.add(stop.placeId));
    if (!day.stops.length) day.subtitle = "This start time and access journey leave no suitable visits before the 8 PM planning cutoff. Start earlier or choose a closer area.";
    trip.push(day);
  }
  return trip;
}

export function reorderRemaining(day: TripDay, location: Coordinate): TripDay {
  // A previously visited/skipped ID wins over a duplicate pending copy.
  const history = day.stops.filter((stop) => stop.status !== "pending");
  const seen = new Set<string>();
  const uniqueHistory = history
    .filter((stop) => {
      if (seen.has(stop.placeId)) return false;
      seen.add(stop.placeId);
      return true;
    })
    .map((stop) => ({ ...stop }));
  const pending = day.stops.filter((stop) => {
    if (stop.status !== "pending" || seen.has(stop.placeId)) return false;
    seen.add(stop.placeId);
    return true;
  });
  return {
    ...day,
    stops: [...uniqueHistory, ...nearestStops(pending, location)],
  };
}

const estimateNote =
  "Planning estimate, not a verified live tariff or arrival time. Pay the current posted fare; traffic, transfers and queues can change the journey.";
const walkingNote =
  "Walking-time estimate using approximate street distance; follow pedestrian crossings and posted access rules. This is not turn-by-turn navigation.";

const piers = {
  eminonu: { name: "Eminönü", coordinate: { lat: 41.0174, lng: 28.9747 } },
  karakoy: { name: "Karaköy", coordinate: { lat: 41.0227, lng: 28.9772 } },
  besiktas: { name: "Beşiktaş", coordinate: { lat: 41.0415, lng: 29.007 } },
  kadikoy: { name: "Kadıköy", coordinate: { lat: 40.9913, lng: 29.0231 } },
  uskudar: { name: "Üsküdar", coordinate: { lat: 41.0255, lng: 29.0153 } },
};
const railStations = {
  florya: { name: "Florya", coordinate: { lat: 40.9787, lng: 28.7983 } },
  bakirkoy: { name: "Bakırköy", coordinate: { lat: 40.9800, lng: 28.8729 } },
  yenikapi: { name: "Yenikapı", coordinate: { lat: 41.0051, lng: 28.9513 } },
  sirkeci: { name: "Sirkeci", coordinate: { lat: 41.0154, lng: 28.9767 } },
  uskudar: { name: "Üsküdar", coordinate: { lat: 41.0247, lng: 29.016 } },
  ayrilik: {
    name: "Ayrılık Çeşmesi",
    coordinate: { lat: 40.9998, lng: 29.0303 },
  },
  sogutlucesme: { name: "Söğütlüçeşme", coordinate: { lat: 40.9917, lng: 29.0370 } },
  bostanci: { name: "Bostancı", coordinate: { lat: 40.9521, lng: 29.0949 } },
  maltepe: { name: "Maltepe", coordinate: { lat: 40.9250, lng: 29.1341 } },
  pendik: { name: "Pendik", coordinate: { lat: 40.8795, lng: 29.2336 } },
};
const allMarmarayStations = Object.values(railStations);
const tramStations = [
  { name: "Beyazıt–Kapalıçarşı", coordinate: { lat: 41.0086, lng: 28.9651 } },
  { name: "Çemberlitaş", coordinate: { lat: 41.0083, lng: 28.971 } },
  { name: "Sultanahmet", coordinate: { lat: 41.0083, lng: 28.9757 } },
  { name: "Gülhane", coordinate: { lat: 41.0119, lng: 28.9778 } },
  { name: "Sirkeci", coordinate: { lat: 41.0147, lng: 28.9768 } },
  { name: "Eminönü", coordinate: { lat: 41.0177, lng: 28.9736 } },
  { name: "Karaköy", coordinate: { lat: 41.0222, lng: 28.9743 } },
  { name: "Tophane", coordinate: { lat: 41.0274, lng: 28.9814 } },
  { name: "Fındıklı", coordinate: { lat: 41.032, lng: 28.9886 } },
  { name: "Kabataş", coordinate: { lat: 41.0341, lng: 28.9928 } },
];
const metroStations = [
  { name: "Yenikapı", coordinate: { lat: 41.0051, lng: 28.9521 } },
  { name: "Vezneciler", coordinate: { lat: 41.0122, lng: 28.9606 } },
  { name: "Haliç", coordinate: { lat: 41.0259, lng: 28.9655 } },
  { name: "Şişhane", coordinate: { lat: 41.028, lng: 28.974 } },
  { name: "Taksim", coordinate: { lat: 41.0367, lng: 28.9853 } },
  { name: "Osmanbey", coordinate: { lat: 41.0535, lng: 28.9878 } },
  { name: "Şişli–Mecidiyeköy", coordinate: { lat: 41.065, lng: 28.9941 } },
  { name: "Gayrettepe", coordinate: { lat: 41.0667, lng: 29.0070 } },
  { name: "Levent", coordinate: { lat: 41.0790, lng: 29.0115 } },
  { name: "4. Levent", coordinate: { lat: 41.0858, lng: 29.0065 } },
];

function nearestStation<T extends { coordinate: Coordinate }>(
  coordinate: Coordinate,
  stations: T[],
): T {
  return stations.reduce((best, station) =>
    distanceKm(coordinate, station.coordinate) <
    distanceKm(coordinate, best.coordinate)
      ? station
      : best,
  );
}

function walkingMinutes(a: Coordinate, b: Coordinate): number {
  return Math.ceil(((distanceKm(a, b) * 1.3) / 4.5) * 60);
}

function walkingMetrics(...legs: [Coordinate, Coordinate][]): { walkingKm: number; walkingMinutes: number } {
  return {
    walkingKm: Math.round(legs.reduce((total, [a, b]) => total + distanceKm(a, b) * 1.3, 0) * 100) / 100,
    walkingMinutes: legs.reduce((total, [a, b]) => total + walkingMinutes(a, b), 0),
  };
}

function stationAccess(from: Coordinate, station: { name: string; coordinate: Coordinate }) {
  const direct = distanceKm(from, station.coordinate);
  if (direct <= 1.8) return {
    duration: walkingMinutes(from, station.coordinate),
    ...walkingMetrics([from, station.coordinate]),
    step: `Walk to ${station.name} (about ${walkingMinutes(from, station.coordinate)} min).`,
    paid: false,
  };
  return {
    duration: Math.ceil(8 + direct * 1.5 / 22 * 60), walkingKm: 0, walkingMinutes: 0,
    step: `Take a metered taxi or verified local connection to ${station.name}; allow roughly ${Math.ceil(8 + direct * 1.5 / 22 * 60)} min. This access fare is additional.`,
    paid: true,
  };
}

function inferredSide(coordinate: Coordinate): "europe" | "asia" {
  // A small local shoreline approximation, not a global land/water classifier.
  const shorelineLng = 28.992 + (coordinate.lat - 41) * 0.8;
  return coordinate.lng > shorelineLng ? "asia" : "europe";
}

function isIsland(coordinate: Coordinate): boolean {
  // Only the curated Büyükada footprint. Pendik and the eastern mainland are not islands.
  return coordinate.lat >= 40.83 && coordinate.lat <= 40.89 && coordinate.lng >= 29.105 && coordinate.lng <= 29.145;
}

function acrossGoldenHorn(a: Coordinate, b: Coordinate): boolean {
  // Avoid suggesting a straight-line walk from Balat to Hasköy across water.
  const inHorn = (point: Coordinate) =>
    point.lng > 28.925 &&
    point.lng < 28.96 &&
    point.lat > 41.023 &&
    point.lat < 41.052;
  const northBank = (point: Coordinate) =>
    point.lng > 28.937 && point.lat > 41.02 + (28.974 - point.lng) * 0.84;
  return inHorn(a) && inHorn(b) && northBank(a) !== northBank(b);
}

function walkOption(from: Coordinate, to: Place): TransportOption {
  return {
    mode: "walk",
    title: `Walk to ${to.name}`,
    duration: walkingMinutes(from, to.coordinate),
    ...walkingMetrics([from, to.coordinate]),
    price: { min: 0, max: 0 },
    steps: [
      `Follow public pedestrian streets toward ${to.name} in ${to.area}.`,
      "Use marked crossings. The map line connects stops and does not represent a navigable walking path.",
    ],
    note: walkingNote,
  };
}

function taxiOption(
  from: Coordinate,
  to: Place,
  crossing: boolean,
  hornCrossing = false,
): TransportOption {
  const directDistance = distanceKm(from, to.coordinate);
  const roadDistance = crossing
    ? Math.max(to.district === "Kadıköy" ? 22 : 15, directDistance * 2.4)
    : Math.max(1, directDistance * (hornCrossing ? 3.5 : 1.5));
  return {
    mode: "taxi",
    title: "Metered taxi",
    duration: Math.ceil(8 + (roadDistance / 22) * 60 + (crossing ? 15 : 0)),
    walkingKm: 0, walkingMinutes: 0,
    price: {
      min: Math.ceil((100 + roadDistance * 40) / 10) * 10,
      max: Math.ceil((150 + roadDistance * 65) / 10) * 10,
    },
    steps: [
      `Use a licensed yellow taxi or a licensed ride-booking service and set ${to.name} as the destination.`,
      "Ask the driver to use the meter; agree on neither an off-meter fare nor a payment currency you do not understand.",
      ...(crossing
        ? [
            "The road crossing uses a Bosphorus bridge or tunnel. Ask which tolls are added; the estimate below excludes tolls.",
          ]
        : []),
      ...(hornCrossing
        ? [
            "The driver must use a Golden Horn bridge; there is no direct walking crossing here.",
          ]
        : []),
    ],
    note: `${estimateNote} Approximate metered range in TRY, excluding bridge/tunnel tolls; rush-hour journeys can take much longer.`,
  };
}

function ferryOption(
  from: Coordinate,
  to: Place,
  fromSide: "europe" | "asia",
): TransportOption {
  const europeanPiers = [piers.eminonu, piers.karakoy, piers.besiktas];
  const asianPier =
    to.district === "Kadıköy" || (fromSide === "asia" && from.lat < 41.012)
      ? piers.kadikoy
      : piers.uskudar;
  const europeanPier = nearestStation(
    fromSide === "europe" ? from : to.coordinate,
    europeanPiers,
  );
  const departure = fromSide === "europe" ? europeanPier : asianPier;
  const arrival = fromSide === "europe" ? asianPier : europeanPier;
  const sailingTime =
    asianPier.name === "Kadıköy"
      ? 25
      : europeanPier.name === "Beşiktaş"
        ? 10
        : 20;
  const access = stationAccess(from, departure);
  const onward = stationAccess(arrival.coordinate, { name: to.name, coordinate: to.coordinate });
  return {
    mode: "ferry", title: `${departure.name} → ${arrival.name} ferry`,
    duration: access.duration + 12 + sailingTime + onward.duration,
    walkingKm: Math.round((access.walkingKm + onward.walkingKm) * 100) / 100,
    walkingMinutes: access.walkingMinutes + onward.walkingMinutes,
    price: { min: 50, max: 125 },
    steps: [access.step + ` Follow signs for the ${departure.name} ferry piers.`,
      `Find the departure board for ${arrival.name}; tap İstanbulkart at the correct pier's gate. Operators and piers are separate.`,
      `Cross to ${arrival.name} (roughly ${sailingTime} min sailing). Check the next departure and return service on the posted board.`, onward.step],
    note: `${estimateNote} This total includes a 12-minute planning allowance, not a live departure countdown. One ferry fare estimate in TRY; any paid access or onward connection is additional. Walking totals include the estimated pier access and egress only.`,
  };
}

function marmarayOption(from: Coordinate, to: Place, fromSide: "europe" | "asia"): TransportOption {
  const european = allMarmarayStations.slice(0, 4);
  const asian = allMarmarayStations.slice(4);
  const departure = nearestStation(from, fromSide === "europe" ? european : asian);
  const arrival = nearestStation(to.coordinate, to.side === "europe" ? european : asian);
  const departureIndex = allMarmarayStations.indexOf(departure);
  const arrivalIndex = allMarmarayStations.indexOf(arrival);
  const direction = arrivalIndex > departureIndex ? "Gebze" : "Halkalı";
  const access = stationAccess(from, departure);
  const onward = stationAccess(arrival.coordinate, { name: to.name, coordinate: to.coordinate });
  const railTime = departure.name === "Sirkeci" && arrival.name === "Üsküdar" || departure.name === "Üsküdar" && arrival.name === "Sirkeci" ? 5
    : Math.ceil(distanceKm(departure.coordinate, arrival.coordinate) * 1.15 / 38 * 60 + 4);
  return {
    mode: "marmaray", title: `${departure.name} → ${arrival.name} · Marmaray`,
    duration: access.duration + 10 + railTime + onward.duration,
    walkingKm: Math.round((access.walkingKm + onward.walkingKm) * 100) / 100,
    walkingMinutes: access.walkingMinutes + onward.walkingMinutes,
    price: { min: 45, max: departureIndex === arrivalIndex ? 105 : Math.abs(arrivalIndex - departureIndex) > 3 ? 150 : 105 },
    steps: [access.step + ` Use the signed Marmaray entrance at ${departure.name}.`,
      `Tap İstanbulkart and follow trains toward ${direction}; check the platform display that the train serves ${arrival.name}.`,
      `Get off at ${arrival.name}. ${fromSide !== to.side ? "Marmaray crosses under the Bosphorus, avoiding road traffic." : "Marmaray connects the coastal districts without a road journey."}`,
      "An anonymous İstanbulkart can require enough balance for the maximum distance fare. Tap the refund reader on exit where eligible; rules depend on card type.", onward.step],
    note: `${estimateNote} Marmaray fare estimate in TRY; the entry balance required can exceed this range, and any paid station access is extra. The 10-minute station allowance is not a live train arrival. Walking totals include estimated station access and egress.`,
  };
}

function islandOption(from: Coordinate, to: Place): TransportOption {
  const departure =
    from.lat < 41.012 && inferredSide(from) === "asia"
      ? piers.kadikoy
      : { name: "Kabataş", coordinate: { lat: 41.0335, lng: 28.9942 } };
  const pierCoordinate = { lat: 40.874, lng: 29.1295 };
  const access = stationAccess(from, departure);
  const islandWalk = walkingMetrics([pierCoordinate, to.coordinate]);
  return {
    mode: "ferry",
    title: `${departure.name} → Büyükada ferry`,
    duration:
      access.duration +
      25 +
      90 +
      walkingMinutes(pierCoordinate, to.coordinate),
    walkingKm: Math.round((access.walkingKm + islandWalk.walkingKm) * 100) / 100,
    walkingMinutes: access.walkingMinutes + islandWalk.walkingMinutes,
    price: { min: 150, max: 300 },
    steps: [
      access.step + ` Follow signs for the ${departure.name} islands ferry pier; T1 also reaches Kabataş from the historic peninsula. Any connecting fare is additional.`,
      "Check the posted Şehir Hatları or licensed operator timetable for a sailing that calls at Büyükada. Seasonal routes and piers can change.",
      "Buy the appropriate ticket or tap İstanbulkart where accepted; operator fares differ. Save a return sailing before you board.",
      `On Büyükada, walk toward ${to.name}. Licensed island electric transport can help on the longer approach; ordinary city taxis are not an island option.`,
    ],
    note: `${estimateNote} One-way island-ferry estimate in TRY. A 25-minute boarding allowance and 90-minute sailing estimate are included; neither is live. Check weather cancellations and budget for your return.`,
  };
}

function islandReturnOption(from: Coordinate, to: Place): TransportOption {
  const islandPier = { lat: 40.874, lng: 29.1295 };
  const arrival =
    to.side === "asia"
      ? piers.kadikoy
      : { name: "Kabataş", coordinate: { lat: 41.0335, lng: 28.9942 } };
  const onward = stationAccess(arrival.coordinate, { name: to.name, coordinate: to.coordinate });
  const islandWalk = walkingMetrics([from, islandPier]);
  const onwardWalk = onward.walkingMinutes;
  const onwardTime =
    !onward.paid
      ? onwardWalk
      : Math.max(
          20,
          Math.ceil(
            ((distanceKm(arrival.coordinate, to.coordinate) * 1.5) / 18) * 60 +
              12,
          ),
        );
  return {
    mode: "ferry",
    title: `Büyükada → ${arrival.name} ferry`,
    duration: walkingMinutes(from, islandPier) + 25 + 90 + onwardTime,
    walkingKm: Math.round((islandWalk.walkingKm + onward.walkingKm) * 100) / 100,
    walkingMinutes: islandWalk.walkingMinutes + onward.walkingMinutes,
    price: { min: 150, max: 300 },
    steps: [
      `Return to Büyükada's ferry piers (about ${walkingMinutes(from, islandPier)} min on foot); licensed island electric transport can help with a longer approach.`,
      `Use the posted timetable to find a sailing calling at ${arrival.name}. Seasonal routes, operators and the final departure can change.`,
      "Buy the operator’s ticket or tap İstanbulkart where accepted; watch for weather cancellations and leave time for boarding.",
      ...(!onward.paid
        ? [
            `After arrival at ${arrival.name}, walk to ${to.name} (about ${onwardWalk} min).`,
          ]
        : to.side === "europe" && ["Fatih", "Beyoğlu"].includes(to.district)
          ? [
              `From Kabataş, take T1 toward Bağcılar for the historic peninsula or F1 toward Taksim for upper Beyoğlu; then follow signs toward ${to.name}. Connecting fares are additional.`,
            ]
          : [
              `From ${arrival.name}, continue toward ${to.area} by signed local transport or a metered mainland taxi; connecting fares are additional.`,
            ]),
    ],
    note: `${estimateNote} One-way island-ferry estimate in TRY, excluding the onward journey. A 25-minute boarding allowance and 90-minute sailing estimate are included; neither is live. City taxis cannot cross from the island.`,
  };
}

function tramOption(from: Coordinate, to: Place): TransportOption | undefined {
  const start = nearestStation(from, tramStations);
  const end = nearestStation(to.coordinate, tramStations);
  const startIndex = tramStations.indexOf(start);
  const endIndex = tramStations.indexOf(end);
  if (
    start === end ||
    distanceKm(from, start.coordinate) > 1.1 ||
    distanceKm(to.coordinate, end.coordinate) > 1.1
  )
    return undefined;
  return {
    mode: "tram",
    title: `T1 tram · ${start.name} → ${end.name}`,
    duration:
      walkingMinutes(from, start.coordinate) +
      6 +
      Math.abs(endIndex - startIndex) * 3 +
      walkingMinutes(end.coordinate, to.coordinate),
    ...walkingMetrics([from, start.coordinate], [end.coordinate, to.coordinate]),
    price: { min: 40, max: 85 },
    steps: [
      `Walk to ${start.name} T1 stop and tap İstanbulkart at the turnstile.`,
      `Take the T1 toward ${endIndex > startIndex ? "Kabataş" : "Bağcılar"} and get off at ${end.name}.`,
      `Walk from ${end.name} to ${to.name} (about ${walkingMinutes(end.coordinate, to.coordinate)} min).`,
    ],
    note: `${estimateNote} One tram fare estimate in TRY. A six-minute platform allowance is included; no live tram feed is connected.`,
  };
}

function metroOption(from: Coordinate, to: Place): TransportOption | undefined {
  const start = nearestStation(from, metroStations);
  const end = nearestStation(to.coordinate, metroStations);
  const startIndex = metroStations.indexOf(start);
  const endIndex = metroStations.indexOf(end);
  if (
    start === end ||
    distanceKm(from, start.coordinate) > 1.5 ||
    distanceKm(to.coordinate, end.coordinate) > 1.5
  )
    return undefined;
  return {
    mode: "metro",
    title: `M2 metro · ${start.name} → ${end.name}`,
    duration:
      walkingMinutes(from, start.coordinate) +
      9 +
      Math.abs(endIndex - startIndex) * 3 +
      walkingMinutes(end.coordinate, to.coordinate),
    ...walkingMetrics([from, start.coordinate], [end.coordinate, to.coordinate]),
    price: { min: 40, max: 85 },
    steps: [
      `Walk to ${start.name} M2 station and tap İstanbulkart.`,
      `Take M2 toward ${endIndex > startIndex ? "Hacıosman" : "Yenikapı"} and get off at ${end.name}.`,
      `Follow the signed exit and walk to ${to.name} (about ${walkingMinutes(end.coordinate, to.coordinate)} min).`,
    ],
    note: `${estimateNote} One metro fare estimate in TRY. Nine minutes are allowed for station access and waiting, not a live arrival.`,
  };
}

function localBusOption(from: Coordinate, to: Place): TransportOption {
  let steps: string[];
  if (to.area === "Eyüp") {
    steps = [
      "Reach the Golden Horn shore and find the nearest T5 tram stop (Fener or Balat when nearby).",
      "Take T5 toward Alibeyköy Cep Otogarı and leave at Eyüpsultan Teleferik for Eyüp. A connecting journey to reach T5 may cost extra.",
      ...(to.id === "pierre-loti"
        ? [
            "Follow signs to TF2 and take the cable car uphill; a second İstanbulkart fare is required.",
          ]
        : [`Walk to ${to.name} from the Eyüp waterfront.`]),
    ];
  } else if (
    to.area === "Ortaköy" ||
    to.area === "Arnavutköy" ||
    to.area === "Bebek" ||
    to.area === "Rumelihisarı"
  ) {
    const alreadyOnShore =
      from.lat >= 41.033 &&
      from.lat < 41.105 &&
      from.lng >= 28.99 &&
      from.lng < 29.065;
    const northbound = to.coordinate.lat > from.lat;
    const nearestTram = nearestStation(from, tramStations);
    const shoreAccess = alreadyOnShore
      ? "Use the nearest signed bus stop on the European Bosphorus shore road; stay on the side serving your travel direction."
      : distanceKm(from, nearestTram.coordinate) < 1.3
        ? `Walk to ${nearestTram.name}, take T1 toward Kabataş, and follow signs to the shore-road bus stops there. The connecting tram fare is additional.`
        : "Reach the European Bosphorus shore at Beşiktaş or Kabataş; from Taksim, F1 descends to Kabataş. Any connecting fare is additional.";
    steps = [
      shoreAccess,
      `Find a ${northbound ? "northbound bus toward Bebek / Sarıyer" : "southbound bus toward Beşiktaş / Kabataş"} with ${to.area} on its route board; confirm the stop and direction on the posted route or IETT information.`,
      `Tap İstanbulkart when boarding and leave at the stop serving ${to.area}; walk to ${to.name}.`,
    ];
  } else if (to.side === "asia") {
    steps = [
      `Go to the nearest signed bus stop in your current district and look for a route toward ${to.area}.`,
      "Confirm the exact line, direction and stop using the stop’s IETT route board before boarding. This app has no verified stop-level routing feed.",
      `Tap İstanbulkart when boarding; get off at the confirmed stop and walk to ${to.name}.`,
    ];
  } else {
    steps = [
      `Find the nearest signed bus stop and confirm a route toward ${to.area} using its IETT route board.`,
      "Check the exact line, direction and any transfer before boarding; this app has no verified stop-level routing feed.",
      `Tap İstanbulkart; leave at the confirmed stop for ${to.name}.`,
    ];
  }
  return {
    mode: to.area === "Eyüp" ? "tram" : "bus",
    title:
      to.id === "pierre-loti"
        ? "T5 tram + TF2 cable car"
        : to.area === "Eyüp"
          ? "T5 tram toward Eyüp"
          : `Local bus toward ${to.area}`,
    duration: Math.max(
      20,
      Math.ceil(((distanceKm(from, to.coordinate) * 1.6) / 16) * 60 + 15),
    ),
    price: {
      min: to.id === "pierre-loti" ? 80 : 40,
      max: to.id === "pierre-loti" ? 170 : 85,
    },
    walkingKm: 0.6,
    walkingMinutes: 8,
    steps,
    note: `${estimateNote} ${to.id === "pierre-loti" ? "Two local transit fares" : "One local transit fare"} estimated in TRY. Connecting fares can be extra. Stop positions are unverified: allow about 0.6 km / 8 min combined access walking, included within a generic 15-minute access/wait allowance. This is not a bus countdown.`,
  };
}

export function getTransport(
  from: Coordinate,
  to: Place,
  fromSide?: "europe" | "asia",
): TransportRecommendation {
  const directDistance = distanceKm(from, to.coordinate);
  const originSide = fromSide ?? inferredSide(from);
  const crossing = originSide !== to.side;
  const hornCrossing = acrossGoldenHorn(from, to.coordinate);
  const distance = Math.round(directDistance * 10) / 10;
  if (isIsland(to.coordinate) && !isIsland(from)) {
    return {
      recommended: islandOption(from, to),
      alternatives: [],
      distanceKm: distance,
    };
  }
  if (isIsland(from) && !isIsland(to.coordinate)) {
    return {
      recommended: islandReturnOption(from, to),
      alternatives: [],
      distanceKm: distance,
    };
  }
  if (isIsland(from) && isIsland(to.coordinate)) {
    const walk = walkOption(from, to);
    return { recommended: walk, alternatives: [], distanceKm: distance };
  }
  const taxi = taxiOption(from, to, crossing, hornCrossing);
  if (crossing) {
    const ferry = ferryOption(from, to, originSide);
    const rail = marmarayOption(from, to, originSide);
    const nearBesiktas =
      originSide === "europe"
        ? distanceKm(from, piers.besiktas.coordinate) < 1.8
        : distanceKm(to.coordinate, piers.besiktas.coordinate) < 1.8;
    const kadikoyCrossing =
      to.district === "Kadıköy" || (originSide === "asia" && from.lat < 41.012);
    const preferFerry = kadikoyCrossing || nearBesiktas;
    return {
      recommended: preferFerry ? ferry : rail,
      alternatives: [preferFerry ? rail : ferry, taxi],
      distanceKm: distance,
    };
  }
  if (hornCrossing) {
    return { recommended: taxi, alternatives: [], distanceKm: distance };
  }
  const walk = walkOption(from, to);
  const railStart = nearestStation(from, allMarmarayStations);
  const railEnd = nearestStation(to.coordinate, allMarmarayStations);
  if (directDistance > 3 && railStart !== railEnd && distanceKm(from, railStart.coordinate) < 1.8 && distanceKm(to.coordinate, railEnd.coordinate) < 1.8) {
    return { recommended: marmarayOption(from, to, originSide), alternatives: [taxi], distanceKm: distance };
  }
  if (directDistance <= 1.35) {
    return {
      recommended: walk,
      alternatives: directDistance > 0.5 ? [taxi] : [],
      distanceKm: distance,
    };
  }
  const railOptions =
    to.side === "europe"
      ? [tramOption(from, to), metroOption(from, to)].filter(
          (option): option is TransportOption => !!option,
        )
      : [];
  if (railOptions.length) {
    railOptions.sort((a, b) => a.duration - b.duration);
    return {
      recommended: railOptions[0],
      alternatives: [
        ...railOptions.slice(1),
        taxi,
        ...(directDistance < 2.8 ? [walk] : []),
      ],
      distanceKm: distance,
    };
  }
  const bus = localBusOption(from, to);
  // Avoid a purported precise public route when the stop/line data is absent.
  // Known shore-road corridors and T5 have useful public advice; elsewhere taxi
  // gives an actionable fallback while the bus option clearly calls for verification.
  const knownCorridor = [
    "Ortaköy",
    "Arnavutköy",
    "Bebek",
    "Rumelihisarı",
    "Eyüp",
  ].includes(to.area);
  return {
    recommended: knownCorridor ? bus : taxi,
    alternatives: [
      knownCorridor ? taxi : bus,
      ...(directDistance < 3 ? [walk] : []),
    ],
    distanceKm: distance,
  };
}

function parseTime(value: string): number {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new RangeError("Start time must use HH:MM.");
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function parseClock(value: string): number {
  if (!value) return 0;
  const match = value.match(/^(\d{1,2}):(\d{2}) (AM|PM)$/);
  if (!match) return parseTime(value);
  return (Number(match[1]) % 12 + (match[3] === "PM" ? 12 : 0)) * 60 + Number(match[2]);
}

function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60) % 24;
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

export function getDaySchedule(day: TripDay, settings: TripSettings, origin?: Coordinate, hoursById: Record<string, VenueHours | undefined> = {}) {
  const hotel = stayAreas.find((area) => area.id === settings.stayArea) ?? stayAreas[0];
  let position = day.continuation?.origin ?? origin ?? settings.accommodation?.coordinate ?? hotel.coordinate;
  let side: "europe" | "asia" | undefined = distanceKm(position, hotel.coordinate) < 0.01 ? hotel.side : undefined;
  let minutes = parseTime(day.continuation?.startTime ?? settings.startTime ?? "09:00") + (day.delayMinutes ?? 0);
  const stopTimes: Record<string, string> = {};
  const breakTimes: Record<string, string> = {};
  let walkingKm = 0, walkingTime = 0, travelMinutes = 0, visitMinutes = 0, coffeeMinutes = 0, waitMinutes = 0, budgetMin = 0, budgetMax = 0;
  const openingChecks: Record<string, ReturnType<typeof checkVisitHours>> = {};
  const legOptions: Record<string, TransportOption> = {};
  const legOrigins: Record<string, Coordinate> = {};
  const coffeeLegs: Record<string, TransportOption> = {};
  const active = day.stops.filter((stop) => stop.status !== "skipped" && (!day.continuation || stop.status === "pending") && findPlace(stop.placeId));
  active.forEach((stop, index) => {
    const place = findPlace(stop.placeId)!;
    const option = getChosenTransport(position, place, stop.transportMode, side);
    legOrigins[place.id] = position;
    legOptions[place.id] = option;
    budgetMin += option.price.min;
    budgetMax += option.price.max;
    minutes += option.duration;
    travelMinutes += option.duration;
    walkingKm += option.walkingKm ?? 0;
    walkingTime += option.walkingMinutes ?? 0;
    const check = checkVisitHours(place, dayDate(settings.startDate, day.id).getUTCDay(), minutes, hoursById[place.id]);
    openingChecks[place.id] = check;
    minutes += check.waitMinutes;
    waitMinutes += check.waitMinutes;
    stopTimes[place.id] = formatTime(minutes);
    minutes += place.duration;
    visitMinutes += place.duration;
    position = place.coordinate;
    side = place.side;
    const coffee = day.coffeeBreaks?.find((pause) => pause.afterPlaceId === place.id);
    if (coffee && (index < active.length - 1 || coffee.cafeId)) {
      const cafe = cafes.find(c => c.id === coffee.cafeId);
      if (cafe) {
        const destination = {...place,id:cafe.id,name:cafe.name,coordinate:cafe.coordinate,side:inferredSide(cafe.coordinate)};
        const approach = getTransport(position,destination,side).recommended;
        coffeeLegs[place.id] = approach;
        walkingKm += approach.walkingKm??0; walkingTime += approach.walkingMinutes??0; travelMinutes += approach.duration; minutes += approach.duration;
        budgetMin += approach.price.min; budgetMax += approach.price.max;
        position = cafe.coordinate;
        side = destination.side;
      }
      breakTimes[place.id] = formatTime(minutes);
      coffeeMinutes += coffee.duration;
      minutes += coffee.duration;
    }
  });
  return { stopTimes, breakTimes, finishTime: formatTime(minutes), walkingKm, walkingMinutes: walkingTime,
    travelMinutes, visitMinutes, coffeeMinutes, waitMinutes, budgetMin, budgetMax, openingChecks, legOptions, legOrigins, coffeeLegs, lateFinish: minutes > 20 * 60 };
}

export function getStopTimes(day: TripDay, startTime = "09:00"): Record<string, string> {
  const first = day.stops.find((stop) => stop.status !== "skipped" && findPlace(stop.placeId));
  return getDaySchedule(day, { days: 1, stayArea: stayAreas[0].id, pace: "balanced", startDate: "2026-01-01", startTime },
    first ? findPlace(first.placeId)!.coordinate : stayAreas[0].coordinate).stopTimes;
}

/** Stored preferences apply when the connection remains available from this origin. */
export function getChosenTransport(from: Coordinate, to: Place, mode?: TransportOption['mode'], side?: 'europe'|'asia'): TransportOption {
 const recommendation = getTransport(from, to, side);
 return [recommendation.recommended, ...recommendation.alternatives].find(option => option.mode === mode) ?? recommendation.recommended;
}

export function istanbulClock(date = new Date()): string {
 return new Intl.DateTimeFormat('en-GB', {hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Europe/Istanbul'}).format(date);
}
