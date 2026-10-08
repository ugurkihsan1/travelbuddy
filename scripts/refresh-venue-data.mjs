import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createVenueService } from '../server/venue-service.mjs';

const snapshotPath = fileURLToPath(new URL('../src/data/venue-prices.json', import.meta.url));
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
const service = createVenueService({ snapshot });
const venues = await service.all();
await writeFile(snapshotPath, JSON.stringify(Object.fromEntries(venues.map(venue => [venue.placeId, venue.price])), null, 2) + '\n');
const counts = venues.reduce((summary, venue) => ({ ...summary, [venue.price.status]: (summary[venue.price.status] ?? 0) + 1 }), {});
console.log('Official venue-price snapshot updated:', JSON.stringify(counts));
