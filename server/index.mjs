import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createVenueService } from './venue-service.mjs';
import { createGeocoder } from './geocoding.mjs';
import { createPhotoService } from './photo-service.mjs';
import { createHoursService } from './opening-hours.mjs';

const snapshot = JSON.parse(await readFile(fileURLToPath(new URL('../src/data/venue-prices.json', import.meta.url)), 'utf8'));
const service = createVenueService({ snapshot, cacheFile: process.env.VENUE_CACHE_FILE ?? '/tmp/travelbuddy-venue-prices.json' });
await service.restore();
const photoManifest = JSON.parse(await readFile(fileURLToPath(new URL('../public/photos/attribution.json', import.meta.url)), 'utf8'));
const photoService = createPhotoService(photoManifest);
const geocoder = createGeocoder();
const hoursService = createHoursService();

function send(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(payload));
}

const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (request.method !== 'GET') return send(response, 405, { error: 'Only GET is supported.' });
    if (path === '/api/venues') {
      const [venues, photos, hours] = await Promise.all([service.all(), photoService.all(), hoursService.all()]);
      return send(response, 200, {
        venues: venues.map(venue => ({ ...venue, hours: hours[venue.placeId] ?? { status: 'unverified' }, ...(photos[venue.placeId] ? { photo: photos[venue.placeId] } : {}) })),
        checkedAt: new Date().toISOString(),
      });
    }
    if (path === '/api/geocode') { const q = new URL(request.url, 'http://localhost').searchParams.get('q'); try { return send(response,200,{results:await geocoder.search(q)}); } catch(error) { return send(response,503,{error:error.message}); } }
    if (path === '/api/health') return send(response, 200, { status: 'ok' });
    const match = path.match(/^\/api\/venues\/([a-z0-9-]+)$/);
    if (match) {
      const [venue, hours] = await Promise.all([service.get(match[1]), hoursService.all()]);
      return venue ? send(response, 200, { ...venue, hours: hours[venue.placeId] ?? { status: 'unverified' } }) : send(response, 404, { error: 'Unknown venue.' });
    }
    send(response, 404, { error: 'Unknown endpoint.' });
  } catch {
    send(response, 500, { error: 'Venue information is temporarily unavailable.' });
  }
});

server.listen(Number(process.env.VENUE_API_PORT ?? 8787), process.env.VENUE_API_HOST ?? '127.0.0.1', () => {
  console.log('TravelBuddy venue information API is ready on port ' + (process.env.VENUE_API_PORT ?? 8787));
});

let backgroundRefresh;
const refreshTimer = setInterval(() => {
  if (backgroundRefresh) return;
  backgroundRefresh = Promise.allSettled([service.all(), photoService.all(), hoursService.all()])
    .finally(() => { backgroundRefresh = undefined; });
}, 60 * 60 * 1000);
refreshTimer.unref();
for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => { clearInterval(refreshTimer); server.close(() => process.exit(0)); });
