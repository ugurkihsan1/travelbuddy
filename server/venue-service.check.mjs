import test from 'node:test';
import assert from 'node:assert/strict';
import { createVenueService, agePrice } from './venue-service.mjs';
import { parseOfficialPrice, venueSources, DAY_MS } from './venue-sources.mjs';
const palace = '<div id="fiyatMenu">Topkapı Sarayı Kombine Bilet (Topkapı Sarayı + Aya İrini + Harem) Yerli Ziyaretçi Bilet Fiyatı: 500 TL Yabancı Ziyaretçi Bilet Fiyatı: 2.750 TL İndirimli Bilet: 100 TL</div>';
test('selects the exact foreign palace bundle without confusing resident and child prices', () => {
 assert.deepEqual(parseOfficialPrice(palace, venueSources['topkapi-palace']), {amount:2750,currency:'TRY'});
 assert.throws(() => parseOfficialPrice(palace.replace('Yabancı Ziyaretçi Bilet Fiyatı','Other price'),venueSources['topkapi-palace']));
});
test('rejects an unrelated number and separates foreign from resident modern admission', () => {
 assert.deepEqual(parseOfficialPrice('Admission Regular: 1,000 TL Student 500 TL Residents of Türkiye Regular:600 TL',venueSources['istanbul-modern']),{amount:1000,currency:'TRY'});
 assert.throws(() => parseOfficialPrice('Tour2026 price450',venueSources['pera-museum']));
});
test('deduplicates concurrent daily checks, retries after24h, preserves stale prices on failure', async () => {
 let now=Date.parse('2026-10-08T09:00:00Z'), calls=0, fail=false;
 const service=createVenueService({snapshot:{'topkapi-palace':{status:'unavailable',label:'Fee',sourceUrl:venueSources['topkapi-palace'].url}},now:()=>now,fetchImpl:async()=>{calls++;if(fail)throw Error('Offline');return{ok:true,text:async()=>palace};}});
 const first=await Promise.all([service.get('topkapi-palace'),service.get('topkapi-palace')]);
 assert.equal(calls,1);assert.equal(first[0].price.amount,2750);assert.equal(first[1].price.status,'verified');
 await service.get('topkapi-palace');assert.equal(calls,1);
 now+=DAY_MS;fail=true;const stale=await service.get('topkapi-palace');assert.equal(calls,2);assert.equal(stale.price.status,'stale');assert.equal(stale.price.amount,2750);assert.equal(stale.price.verifiedAt,first[0].price.verifiedAt);
 await service.get('topkapi-palace');assert.equal(calls,2);
});
test('expired and missing verification times never become current',()=>{
 assert.equal(agePrice({status:'verified',amount:1000,verifiedAt:'invalid'}).status,'stale');
 assert.equal(agePrice({status:'verified',amount:1000,verifiedAt:'2026-10-01T00:00:00Z'},Date.parse('2026-10-08T00:00:00Z')).status,'stale');
});
test('official museum catalog selects standard Euro fees, rejecting resident night offers',()=>{
 const html='<h5>Night Museum Experience at Galata Tower <span>200 TL</span></h5><h5>GALATA TOWER <span>30 Euro</span></h5><h5>İSTANBUL ARCHAEOLOGICAL MUSEUMS <span>15 Euro</span></h5>';
 assert.deepEqual(parseOfficialPrice(html,venueSources['galata-tower']),{amount:30,currency:'EUR'});
 assert.deepEqual(parseOfficialPrice(html,venueSources['archaeology-museums']),{amount:15,currency:'EUR'});
 assert.throws(()=>parseOfficialPrice('<h5>Night Museum Experience at Galata Tower200 TL</h5>',venueSources['galata-tower']));
});
