import { findPlace } from '../data/places';
import { dayDate, getDaySchedule, istanbulClock } from './planner';
import type { Coordinate, TripDay, TripSettings } from '../types';

function minutesFromClock(value: string): number {
  const clock = value.match(/^(\d{1,2}):(\d{2}) (AM|PM)$/);
  if (clock) return (Number(clock[1]) % 12 + (clock[3] === 'PM' ? 12 : 0)) * 60 + Number(clock[2]);
  const local = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!local) throw new RangeError('Choose a valid local start time.');
  return Number(local[1]) * 60 + Number(local[2]);
}

function istanbulDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const field = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${field('year')}-${field('month')}-${field('day')}`;
}

/** Continue now, or delay the next planned departure without adding delay twice. */
export function continueFromHere(day: TripDay, settings: TripSettings, origin: Coordinate, nowDate: Date, delay = 0): TripDay {
  const firstPending = day.stops.find((stop) => stop.status === 'pending' && findPlace(stop.placeId));
  if (!firstPending) return day;
  if (!Number.isFinite(nowDate.getTime())) throw new RangeError('The current time is unavailable.');
  if (!Number.isFinite(delay) || delay < 0) throw new RangeError('Delay must be a nonnegative number of minutes.');
  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng) || Math.abs(origin.lat) > 90 || Math.abs(origin.lng) > 180) {
    throw new RangeError('A valid current location is required.');
  }
  const actualClock = minutesFromClock(istanbulClock(nowDate));
  let departure = actualClock;
  if (delay > 0) {
    const schedule = getDaySchedule(day, settings);
    const arrival = minutesFromClock(schedule.stopTimes[firstPending.placeId]);
    const incomingLeg = schedule.legOptions[firstPending.placeId];
    const openingWait = schedule.openingChecks[firstPending.placeId]?.waitMinutes ?? 0;
    departure = arrival - incomingLeg.duration - openingWait;
    if (departure < 0) departure += 24 * 60;
    departure += Math.round(delay);
    if (istanbulDate(dayDate(settings.startDate, day.id)) === istanbulDate(nowDate)) {
      departure = Math.max(departure, actualClock);
    }
  }
  // HH:mm has no next-day offset. Refuse to silently wrap a delayed trip to morning.
  if (departure >= 24 * 60) throw new RangeError('This delay passes midnight. Move the remaining visits to another day.');
  const startTime = `${String(Math.floor(departure / 60)).padStart(2, '0')}:${String(departure % 60).padStart(2, '0')}`;
  return {
    ...day,
    stops: day.stops.map((stop) => ({ ...stop })),
    ...(day.coffeeBreaks ? { coffeeBreaks: day.coffeeBreaks.map((coffee) => ({ ...coffee })) } : {}),
    continuation: { startTime, origin: { ...origin } },
    delayMinutes: 0,
  };
}
