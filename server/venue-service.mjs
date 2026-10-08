import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DAY_MS, parseOfficialPrice, venueSources } from './venue-sources.mjs';

export function agePrice(price, now = Date.now()) {
  if (price.status !== 'verified' && price.status !== 'stale') return { ...price };
  const verifiedAt = Date.parse(price.verifiedAt ?? '');
  if (!Number.isFinite(verifiedAt) || now - verifiedAt >= DAY_MS) {
    return { ...price, status: 'stale', error: price.error ?? 'This price was last verified more than 24 hours ago.' };
  }
  return { ...price };
}

export function createVenueService({ snapshot, cacheFile, fetchImpl = fetch, now = Date.now }) {
  const prices = new Map(Object.entries(snapshot).map(([id, price]) => [id, { ...price }]));
  const pending = new Map();
  let saveQueue = Promise.resolve();
  let muzeRequest;
  async function officialPage(source) {
    if (source.parser !== 'muze') {
      const response = await fetchImpl(source.url, { headers: { 'User-Agent': 'TravelBuddy/0.1 (daily public admission tariff check)', Accept: 'text/html' }, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error('The official source could not be reached (HTTP ' + response.status + ').');
      return response.text();
    }
    if (!muzeRequest) muzeRequest = (async () => {
      const page = await fetchImpl(source.url, { signal: AbortSignal.timeout(10_000) });
      if (!page.ok) throw new Error('The official e-ticket page is unavailable.');
      const html = await page.text();
      const token = html.match(/name="csrf-token" content="([^"]+)"/)?.[1];
      if (!token) throw new Error('The official e-ticket form could not be read.');
      const cookie = page.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
      const response = await fetchImpl('https://muze.gov.tr/MuseumPass/GetSellableItemByProvince', {method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',RequestVerificationToken:token,Cookie:cookie}, body:new URLSearchParams({provinceId:'34',catalogNo:'WEB-GLT03-87-009',responseMsg:'',IsGift:'NOGIFT',type:'SomeBodyElse'}),signal:AbortSignal.timeout(10_000)});
      if (!response.ok) throw new Error('The official public ticket catalog is unavailable.');
      return response.text();
    })();
    try { return await muzeRequest; } finally { setTimeout(() => { muzeRequest = undefined; }, 1000).unref(); }
  }

  async function restore() {
    if (!cacheFile) return;
    try {
      const cached = JSON.parse(await readFile(cacheFile, 'utf8'));
      for (const [id, price] of Object.entries(cached)) {
        const source = venueSources[id];
        if (!source || typeof price !== 'object' || price === null || price.sourceUrl !== source.url) continue;
        if (!['verified', 'stale', 'unavailable'].includes(price.status) || !Number.isFinite(Date.parse(price.checkedAt ?? ''))) continue;
        if (price.amount !== undefined && (!Number.isFinite(price.amount) || price.amount <= 0 || !['TRY', 'EUR', 'USD'].includes(price.currency))) continue;
        if (Date.parse(price.checkedAt) > Date.parse(prices.get(id)?.checkedAt ?? '')) prices.set(id, price);
      }
    } catch { /* An absent or malformed cache is replaced after the next refresh. */ }
  }

  function persist() {
    if (!cacheFile) return Promise.resolve();
    const serialized = JSON.stringify(Object.fromEntries(prices), null, 2);
    saveQueue = saveQueue.catch(() => {}).then(async () => {
      await mkdir(dirname(cacheFile), { recursive: true });
      const temporary = cacheFile + '.tmp';
      await writeFile(temporary, serialized + '\n');
      await rename(temporary, cacheFile);
    });
    return saveQueue.catch(() => {});
  }

  async function refresh(id) {
    const source = venueSources[id];
    const old = prices.get(id);
    const checkedAt = new Date(now()).toISOString();
    let price;
    try {
      const html = await officialPage(source);
      if (html.length > 3_000_000) throw new Error('The official response was unexpectedly large.');
      const parsed = parseOfficialPrice(html, source);
      price = { status: 'verified', ...parsed, label: source.label, sourceUrl: source.url, checkedAt, verifiedAt: checkedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The official price check failed.';
      price = old?.amount !== undefined && old.verifiedAt
        ? { ...old, status: 'stale', checkedAt, error: message }
        : { status: 'unavailable', label: source.label, sourceUrl: source.url, checkedAt, error: message };
    }
    prices.set(id, price);
    await persist();
    return { placeId: id, price: agePrice(price, now()) };
  }

  async function get(id) {
    const price = prices.get(id);
    if (!price) return undefined;
    if (!venueSources[id] || price.status === 'free') return { placeId: id, price: { ...price } };
    const checkedAt = Date.parse(price.checkedAt ?? '');
    if (Number.isFinite(checkedAt) && now() - checkedAt < DAY_MS && checkedAt <= now()) {
      return { placeId: id, price: agePrice(price, now()) };
    }
    if (pending.has(id)) return pending.get(id);
    const request = refresh(id).finally(() => pending.delete(id));
    pending.set(id, request);
    return request;
  }

  async function all() {
    return Promise.all([...prices.keys()].map(id => get(id)));
  }

  return { get, all, restore };
}
