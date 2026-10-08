import { readFileSync } from 'node:fs';
import { visibleText } from './venue-sources.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const snapshot = JSON.parse(readFileSync(new URL('../src/data/venue-hours.json', import.meta.url), 'utf8'));

export const hoursSources = {
  'istanbul-modern': { url: 'https://www.istanbulmodern.org/en/visit/museum', parser: 'modern' },
  'pera-museum': { url: 'https://www.peramuseum.org/Home/Visit', parser: 'pera' },
};

function validTime(value) {
  const normalized = value.replace('.', ':');
  const [hours, minutes] = normalized.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) throw new Error('Invalid official visiting time.');
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function windowFor(weekdays, openValue, closeValue) {
  const open = validTime(openValue), close = validTime(closeValue);
  if (open >= close) throw new Error('Invalid official visiting window.');
  return { weekdays, open, close };
}

/** Parse full museum visiting windows, never ticket-office or last-entry times. */
export function parseOfficialHours(html, source) {
  const text = visibleText(html);
  const time = '(\\d{1,2}[.:]\\d{2})';
  const dash = '\\s*[-–—]\\s*';
  if (source.parser === 'modern') {
    if (!/Istanbul (?:Museum of Modern Art|Modern)/i.test(text)) throw new Error('The named museum page was not found.');
    const pattern = 'Museum Hours\\s+Tuesday,\\s*Wednesday,\\s*Thursday,\\s*Saturday,\\s*Sunday\\s+' + time + dash + time + '\\s+Friday,?\\s*' + time + dash + time + '\\s+Monday\\s+Closed';
    const match = text.match(new RegExp(pattern, 'i'));
    if (!match) throw new Error('The complete regular museum schedule was not found.');
    return [windowFor([2, 3, 4, 6, 0], match[1], match[2]), windowFor([5], match[3], match[4])];
  }
  if (source.parser === 'pera') {
    if (!/Pera Museum/i.test(text)) throw new Error('The named museum page was not found.');
    const pattern = 'VISITING HOURS\\s+Tuesday' + dash + 'Saturday\\s+' + time + dash + time + '\\s+Friday\\s+' + time + dash + time + '\\s+Sunday\\s+' + time + dash + time + '\\s+The museum is closed on Mondays\\.';
    const match = text.match(new RegExp(pattern, 'i'));
    if (!match) throw new Error('The complete regular museum schedule was not found.');
    // Friday overrides the Tuesday–Saturday range; days never overlap.
    return [windowFor([2, 3, 4, 6], match[1], match[2]), windowFor([5], match[3], match[4]), windowFor([0], match[5], match[6])];
  }
  throw new Error('No verified source-specific visiting-hours parser exists.');
}

function cloneHours(hours) {
  return { ...hours, ...(hours.windows ? { windows: hours.windows.map(window => ({ ...window, weekdays: [...window.weekdays] })) } : {}) };
}

export function createHoursService({ fetchImpl = fetch, now = Date.now } = {}) {
  const records = new Map(Object.entries(snapshot).map(([id, record]) => [id, cloneHours(record)]));
  const pending = new Map();

  async function refresh(id) {
    const source = hoursSources[id];
    const checkedAt = new Date(now()).toISOString();
    let record;
    try {
      const response = await fetchImpl(source.url, {
        headers: { 'User-Agent': 'TravelBuddy/0.1 (daily public museum visiting-hours check)', Accept: 'text/html' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error('Official visiting-hours source unavailable.');
      const html = await response.text();
      if (html.length > 3_000_000) throw new Error('Unexpectedly large visiting-hours response.');
      record = { status: 'verified', windows: parseOfficialHours(html, source), checkedAt, sourceUrl: source.url };
    } catch {
      // Old times cannot imply that a venue is closed or open after a failed check.
      record = { status: 'unverified', checkedAt, sourceUrl: source.url };
    }
    records.set(id, record);
    return record;
  }

  async function get(id) {
    const record = records.get(id) ?? { status: 'unverified' };
    if (!hoursSources[id]) return cloneHours(record);
    const age = now() - Date.parse(record.checkedAt ?? '');
    if (Number.isFinite(age) && age >= 0 && age < DAY_MS) return cloneHours(record);
    if (!pending.has(id)) pending.set(id, refresh(id).finally(() => pending.delete(id)));
    return cloneHours(await pending.get(id));
  }

  async function all() {
    const ids = [...new Set([...records.keys(), ...Object.keys(hoursSources)])];
    return Object.fromEntries(await Promise.all(ids.map(async id => [id, await get(id)])));
  }
  return { all };
}
