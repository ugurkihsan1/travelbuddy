import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhotoService} from './photo-service.mjs';
test('refreshes venue-specific licensed metadata once daily and shares concurrent requests',async()=>{
 let calls=0;const local={url:'/photos/a.webp',title:'Actual mosque.jpg',author:'Local author',license:'CC BY 4.0',sourceUrl:'https://commons.wikimedia.org/wiki/File:Actual_mosque.jpg'};
 const service=createPhotoService({a:local},async()=>{calls++;return{ok:true,json:async()=>({query:{pages:{1:{title:'File:Actual mosque.jpg',imageinfo:[{thumburl:'https://upload.wikimedia.org/a.jpg',descriptionurl:local.sourceUrl,extmetadata:{Artist:{value:'<a>Author</a>'},LicenseShortName:{value:'CC BY 4.0'}}}]}}}})}});
 const [first,second]=await Promise.all([service.all(),service.all()]);assert.equal(calls,1);assert.equal(first.a.author,'Author');assert.equal(second.a.url,'https://upload.wikimedia.org/a.jpg');await service.all();assert.equal(calls,1);
});
test('retains the credited local venue photo on source failure',async()=>{
 const local={url:'/photos/a.webp',title:'Actual mosque.jpg',author:'A',license:'CC BY 4.0',sourceUrl:'https://commons.wikimedia.org/wiki/File:Actual_mosque.jpg'};
 const service=createPhotoService({a:local},async()=>{throw Error('Offline')});assert.deepEqual((await service.all()).a,local);
});
