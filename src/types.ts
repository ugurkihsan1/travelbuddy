export type Coordinate = { lat: number; lng: number };
export type PlaceCategory =
  | "landmark"
  | "museum"
  | "market"
  | "neighborhood"
  | "viewpoint"
  | "food"
  | "park";
export type Place = {
  id: string;
  name: string;
  district: string;
  area: string;
  side: "europe" | "asia";
  category: PlaceCategory;
  coordinate: Coordinate;
  duration: number;
  description: string;
  tip: string;
  entry: string;
  bestTime: string;
  closedDays?: number[];
  image?: string;
  color: string;
  photoTitle?: string;
  priceSource?: string;
};
export type StayArea = {
  id: string;
  name: string;
  subtitle: string;
  coordinate: Coordinate;
  side: "europe" | "asia";
  theme?: string;
};
export type TripSettings = {
  days: number;
  stayArea: string;
  pace: "relaxed" | "balanced" | "packed";
  startDate: string;
  startTime?: string;
  coffeeStops?: boolean;
  routeMode?: 'keep' | 'optimize';
  interests?: Interest[];
  accommodation?: { label: string; coordinate: Coordinate };
  language?: 'en' | 'tr';
};
export type Interest = 'history' | 'food' | 'views' | 'art' | 'shopping';
export type StopStatus = "pending" | "visited" | "skipped";
export type PlannedStop = {
  placeId: string;
  status: StopStatus;
  added?: boolean;
  transportMode?: TransportMode;
  memory?: { note: string; photo?: string };
};
export type TripDay = {
  id: number;
  title: string;
  subtitle: string;
  stops: PlannedStop[];
  coffeeBreaks?: { afterPlaceId: string; duration: number; cafeId?: string }[];
  continuation?: { startTime: string; origin: Coordinate };
  delayMinutes?: number;
};
export type TransportMode =
  "walk" | "tram" | "metro" | "marmaray" | "ferry" | "bus" | "taxi";
export type TransportOption = {
  mode: TransportMode;
  title: string;
  duration: number;
  price: { min: number; max: number };
  steps: string[];
  note: string;
  walkingKm?: number;
  walkingMinutes?: number;
};
export type VenuePrice = {
  status: 'verified' | 'unavailable' | 'free' | 'stale';
  amount?: number;
  currency?: 'TRY' | 'EUR' | 'USD';
  label: string;
  sourceUrl: string;
  checkedAt?: string;
  verifiedAt?: string;
  error?: string;
};
export type VenuePhoto = { url: string; title: string; author: string; license: string; sourceUrl: string };
export type VenueHours = { status: 'verified' | 'unverified'; windows?: { weekdays: number[]; open: string; close: string }[]; checkedAt?: string; sourceUrl?: string };
export type VenueInfo = { placeId: string; price: VenuePrice; photo?: VenuePhoto; hours?: VenueHours };
export type TransportRecommendation = {
  recommended: TransportOption;
  alternatives: TransportOption[];
  distanceKm: number;
};
export type GuideSection = {
  id: string;
  title: string;
  subtitle: string;
  steps: string[];
  tips: string[];
  sourceUrl: string;
  sourceLabel: string;
};
export type TransitArrival = {
  line: string;
  destination: string;
  minutes: number;
  updatedAt: string;
};
export type LiveArrivalState = {
  status: "unconfigured" | "loading" | "available" | "error";
  arrivals: TransitArrival[];
  message?: string;
};
