# TravelBuddy

A colourful, readable English/Turkish mobile travel companion for Istanbul. It is an installable progressive web app for Android, iPhone and desktop, built with React, TypeScript and Vite.

## Run

Use Node.js 24 and npm. The cloud environment was validated with Node.js 24.

```sh
cd /workspace/travelbuddy
npm ci
npm run dev
```

The development command starts Vite on **5173** and the venue information API on **8787**. Run `npm test` and `npm run test:venues` for the planner, persistence and transit adapter tests; `npm run build` type-checks and creates `dist/`. `npm run preview -- --port 4173` serves the production build. Deploy `dist/` on a static host with HTTPS and root-path hosting. Location permissions, service workers and installation require HTTPS, except on localhost.

## What works

### Open without installing anything

`npm run export:preview` creates **`output/TravelBuddy-preview.html`**. Copy or download that single file to your computer, then double-click it or use your browser’s Open File command. It contains the app, styles and offline schematic map. Trip planning, skip/visit actions and the travel guide work without a local server. Browser storage and geolocation depend on the browser’s file-origin rules; installing the PWA still requires an HTTPS deployment. Online map tiles need internet.

The cloud onboarding chat does not provide a live web preview. Publishing the cloud environment saves its snapshot and does not create a public application URL.

- Plan 1–7 days from 20 stay areas, a start date, daily starting time and three travel paces.
- Curated district routes use 54 real places, entrance coordinates, suggested visiting durations and known weekly closures. They include both sides of Istanbul.
- Save preferences without rebuilding your route or visit history. A separate new-plan preview replaces the trip only when applied, with session undo. A shorter trip is rejected if later days contain stops or history.
- Keep order by default. Opt-in optimization proposes a changed order with estimated walking/travel differences; applying it requires an explicit click and supports undo.
- Move pending stops up/down, drag them, move them to another day or replace them with nearby alternatives. Visited memories stay on their original day. Skipped places can be saved for a later day.
- Choose incoming transport per stop; schedules, walking totals, budget and Google Maps mode use that saved preference.
- Travel mode starts with the next stop, travel time, walking and directions. Planning mode shows all days and edits; summaries can collapse.
- Continue from the current point and Istanbul time, apply a30-minute delay to the remaining planned departure, or move part of today to a later day without losing history.
- Optional browser location following updates the starting point; it never silently reorders stops. An accurate position within Istanbul is required. Nearby stops offer a visit confirmation; passing a landmark does not automatically mark it visited. Live GPS stays in memory; an explicitly saved continuation point or hotel/map pin is stored on the device with the trip. OpenStreetMap tile requests can disclose the viewed map area to its operator.
- Suggestions compare walking, suitable rail or ferry connections and taxis, with estimated durations and fare ranges. Steps name relevant stations and piers; the Istanbulkart and travel guides explain payment and practical details.
- Trip settings and visited/skipped status persist on the device. Invalid or inaccessible browser storage is handled gracefully.
- Prepare offline explicitly in Travel essentials. “Offline ready” requires a verified cached production app shell and all53 local venue photos. Missing cached photos revoke readiness. Browser installation requires a hosted HTTPS app; the single-file preview already embeds app/photos but cannot install itself. Map tiles and fresh data need internet.
- Discover nearby curated cafés, food, museums, views and free-entry places with map pins and Add to today. Selected cafés are saved with the break and affect approach walking/travel and subsequent departure.
- Optional visited-place notes/photos persist locally; journal photos are downsized and EXIF is removed. Day memories export to a safe self-contained shareable HTML summary. No account or remote photo upload is required.

## Data boundaries

The itinerary is a deterministic local planner, not a paid AI service. Connecting lines show the order of stops and are **not street routing or turn-by-turn navigation**. The planner checks arrival, waiting and full visit duration against fresh regular hours verified for Istanbul Modern and Pera. Other hours are explicitly unverified. It does not query congestion, holiday exceptions, accessibility restrictions or ferry cancellations. Confirm temporary signs at venues and stations. Stay-area coordinates are approximate. Users can save an exact hotel/address search result or choose a map/manual coordinate. Address search uses an Istanbul-bounded, rate-limited Nominatim backend and only runs on explicit submission; the standalone preview offers map/manual coordinates without address search.

Fare ranges, taxi costs and journey durations are planning estimates, **not verified current tariffs or live quotes**. Entrance prices show verified adult foreign/non-resident tariffs in their original currency with source and verification dates. Unverified and expired tariffs remain clearly marked. The application never presents simulated bus arrivals as live. Official operator links are included as optional references.

## Connect live bus arrivals

An official or licensed live arrival provider is required. No provider is connected by default, so the live-arrival card is hidden from the normal interface. To connect a read-only backend adapter, copy `.env.example` to `.env.local`, set `VITE_TRANSIT_API_URL` to its public URL and restart/rebuild. Keep any provider credentials **on the backend**, never in Vite variables or the client bundle.

The adapter receives `GET <endpoint>?stopId=<official-stop-code>` and returns:

```json
{
  "arrivals": [
    {
      "line": "28T",
      "destination": "Example destination",
      "minutes": 4,
      "updatedAt": "2026-10-08T10:00:00Z"
    }
  ]
}
```

The example illustrates the schema, not a real prediction. Timestamps must contain a time zone and be no older than three minutes (up to 30 seconds of future clock skew is accepted). Malformed/stale responses fail visibly; requests time out after ten seconds. The backend must resolve official stop codes, respect provider terms and enable CORS for the app origin if on a different host. An empty array means the provider reports no arrivals. Live responses are never cached by the service worker.

## Repository and environment

Work in the existing `/workspace/travelbuddy` checkout. Cloud tasks are already isolated; do not create Git worktrees unless the user explicitly requests one. Application source is retained in this checkout. Reviewable standalone previews are published on separate GitHub preview branches; those branches are downloads, not a hosted API. Publish the cloud environment snapshot through environment settings when ready; publication and app deployment are separate actions.

Third-party map tiles use `tile.openstreetmap.org` and display OpenStreetMap attribution. The cloud network policy must permit that domain for integration checks; the offline schematic is an approximate backdrop when live tiles are unavailable.

## Starting time, walking and breaks

First-time visitors see a dedicated welcome screen with an explicit stay-region choice and arrival/departure dates. No route recommendations or venue refresh requests begin before submission. Dates determine1–7 inclusive travel days. One submit opens the personalized plan. Returning visitors retain their saved trip. Interests and pace are available later in trip preferences. Daily starting time, coffee preferences and order policy are inside More preferences; an exact hotel or map pin is optional in trip settings. The planner includes the hotel approach, selected travel, visits, opening waits and explicit coffee pauses, and uses an 8 PM planning cutoff. Late starts prefer public evening stops and omit indoor visits arriving after a conservative 3 PM cutoff; those cutoffs are planning assumptions, not verified venue opening hours. Day schedules show total walking distance/time, including station/pier access. Interior wandering and the return to the hotel are extra. Walking estimates use geographic distance with a street allowance, not an actual pedestrian routing API. Coffee pauses can be added, resized or removed. Short local walking legs offer up to three real curated cafés with estimated extra minutes; selected-café approach travel and fare enter the schedule. Café hours and menus are unverified. Skipped stops remove their pause and detour.

Google Maps universal directions require no API key. Day links split at recommended transport changes and mobile waypoint limits; transit legs are opened individually because Maps transit does not support reliable multi-stop directions. Skipped and visited stops are excluded. Opening Maps shares the chosen coordinates with Google.

## Daily venue prices and photographs

`npm run dev` starts the daily official-source service as well as the frontend. `npm run venue:server` starts that service separately. `npm run venue:refresh` updates the committed snapshot, keeping last verified prices marked stale when a check fails. GET `/api/venues` returns the whole catalogue; `/api/venues/:id` returns one price; `/api/health` is a readiness check. Prices cache successful or failed checks for 24h; an hourly backend timer checks whether refresh is due. Concurrent requests share one refresh. Cached data is written atomically to `/tmp/travelbuddy-venue-prices.json`; use `VENUE_CACHE_FILE` for a persistent server path. No API key is needed.

Seven paid venues were verified from live official sources on 8 October 2026: Topkapı, Dolmabahçe, Beylerbeyi, Istanbul Modern, Pera Museum, Galata Tower and Istanbul Archaeology Museums. The source parsers distinguish foreign tickets from resident prices, night offers and bundles. Other paid places may remain unavailable because their current tariff could not be verified or their site refused access. Free-entry labels are curated general guidance, not daily tariff verification.

53 of the 54 curated stops have their own licensed photos; the remaining stop is explicitly marked photo unavailable. Venue photographs are licensed Wikimedia Commons images with original file/author/licence links in each detail view and full attribution in `public/photos/attribution.json`. The running API checks Commons metadata and the current version of those exact venue photographs every 24h, with a local-photo fallback on failure. Photos are not fabricated stock substitutes. The standalone export embeds the local photos and price snapshot so it opens without a server. Automatic daily updates need the running API; the preview explicitly says when updates are unavailable.

For deployment, serve the frontend and `/api/*` on the same HTTPS origin, or set public `VITE_VENUE_API_URL` to a correctly configured CORS backend before building. Do not expose private keys through frontend variables. The cloud environment snapshot does not provide public API hosting.

## Reliable editing and memories

Manual editing preserves every visited/skipped record. The incoming travel choice is cleared only when its predecessor changes; changing the daily starting time alone preserves choices. The optimization suggestion compares remaining visits from the same origin, with both walking and travel differences visible. Undo keeps up to10 changes during the current session.

Notes are optional and limited to500 characters. Local photos are resized JPEGs under1MiB; storage failures show a warning rather than claiming a save. Shared day summaries contain visited memories only and escape all user text. Removing a photo/note and sharing/downloading require explicit user actions.

Regular hours are researched daily from Istanbul Modern and Pera official pages. The other52 venues remain unverified; palace ticket-office hours are not used as visitor closing times. Fresh hours affect new-plan generation and ongoing schedules; outdated/invalid hours lose verified status. The exported preview uses its dated snapshot and does not run daily refreshes.
