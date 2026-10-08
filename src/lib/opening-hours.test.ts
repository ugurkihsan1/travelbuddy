import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findPlace } from '../data/places';
import type { Place, VenueHours } from '../types';
import { checkVisitHours } from './opening-hours';

const NOW = new Date('2026-10-08T09:00:00.000Z');
const visit: Place = { ...findPlace('blue-mosque')!, duration: 60, closedDays: undefined };
const fresh = (overrides: Partial<VenueHours> = {}): VenueHours => ({
  status: 'verified', checkedAt: NOW.toISOString(), sourceUrl: 'https://example.org/official-hours',
  windows: [{ weekdays: [1, 2, 3, 4, 5, 6], open: '09:00', close: '17:00' }], ...overrides,
});

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); });

describe('verified opening-hour evidence', () => {
  it('keeps missing or explicitly unverified hours unknown', () => {
    expect(checkVisitHours(visit, 4, 10 * 60).status).toBe('unverified');
    expect(checkVisitHours(visit, 4, 10 * 60, fresh({ status: 'unverified' })).status).toBe('unverified');
    expect(checkVisitHours(visit, 4, 10 * 60, fresh({ checkedAt: undefined })).status).toBe('unverified');
  });

  it.each([
    ['older than a day', '2026-10-07T08:59:59.000Z'],
    ['exactly a day old', '2026-10-07T09:00:00.000Z'],
    ['in the future', '2026-10-08T10:00:00.000Z'],
    ['malformed', 'not-a-date'],
  ])('does not assert opening from a %s check timestamp', (_label, checkedAt) => {
    const check = checkVisitHours(visit, 4, 10 * 60, fresh({ checkedAt }));
    expect(check.status).toBe('unverified');
    expect(check.waitMinutes).toBe(0);
    expect(check.closesAt).toBeUndefined();
  });

  it('accepts verified evidence just within the freshness window', () => {
    expect(checkVisitHours(visit, 4, 10 * 60, fresh({ checkedAt: '2026-10-07T09:00:00.001Z' })).status).toBe('open');
  });

  it('honours the known weekly closure before advertising a verified opening window', () => {
    const topkapi = findPlace('topkapi-palace')!;
    const check = checkVisitHours(topkapi, 2, 10 * 60, fresh());
    expect(check.status).toBe('closed');
    expect(check.message).toMatch(/normally closed/i);
  });

  it('marks a weekday closed when fresh verified windows explicitly exclude it', () => {
    expect(checkVisitHours(visit, 0, 10 * 60, fresh()).status).toBe('closed');
  });

  it('waits for opening and only accepts a visit that can finish inside the window', () => {
    const check = checkVisitHours(visit, 4, 8 * 60 + 45, fresh());
    expect(check.status).toBe('open');
    expect(check.waitMinutes).toBe(15);
    expect(check.closesAt).toBe(17 * 60);
    expect(check.message).toMatch(/opens at 09:00/i);
  });

  it('allows a visit that ends exactly at closing but rejects a minute too late', () => {
    expect(checkVisitHours(visit, 4, 16 * 60, fresh()).status).toBe('open');
    const tooLate = checkVisitHours(visit, 4, 16 * 60 + 1, fresh());
    expect(tooLate.status).toBe('outside-hours');
    expect(tooLate.waitMinutes).toBe(0);
  });

  it('waits for a later valid window if the full visit cannot fit before a midday closure', () => {
    const hours = fresh({ windows: [
      { weekdays: [4], open: '09:00', close: '12:00' },
      { weekdays: [4], open: '14:00', close: '17:00' },
    ] });
    const check = checkVisitHours(visit, 4, 11 * 60 + 30, hours);
    expect(check.status).toBe('open');
    expect(check.waitMinutes).toBe(150);
    expect(check.closesAt).toBe(17 * 60);
  });
});
