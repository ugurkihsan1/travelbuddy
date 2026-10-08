const DAY_MS=24*60*60*1000;
const plain=value=>String(value??'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
export function createPhotoService(manifest,fetchImpl=fetch){
 let photos=Object.fromEntries(Object.entries(manifest).map(([id,photo])=>[id,{url:photo.url,title:photo.title,author:photo.author,license:photo.license,sourceUrl:photo.sourceUrl}]));
 let checkedAt=0,pending;
 async function refresh(){
  const entries=Object.entries(manifest);
  const result={...photos};
  for(let offset=0;offset<entries.length;offset+=40){
   const batch=entries.slice(offset,offset+40);const ids=new Map(batch.map(([id,p])=>['File:'+p.title,id]));
   const params=new URLSearchParams({action:'query',format:'json',prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'640',titles:[...ids.keys()].join('|')});
   try{
    const response=await fetchImpl('https://commons.wikimedia.org/w/api.php?'+params,{headers:{'User-Agent':'TravelBuddy/0.1 daily credited venue photograph check'},signal:AbortSignal.timeout(12000)});
    if(!response.ok)continue;
    const data=await response.json();
    for(const page of Object.values(data.query?.pages??{})){
     const id=ids.get(page.title),info=page.imageinfo?.[0],meta=info?.extmetadata;
     if(!id||!info||!meta)continue;
     const author=plain(meta.Artist?.value),license=plain(meta.LicenseShortName?.value),url=info.thumburl??info.url;
     if(!author||!license||!/^(?:CC BY|CC0|Public domain)/.test(license)||!/^https:\/\/(?:upload|thumb)\.wikimedia\.org\//.test(url??''))continue;
     result[id]={url,title:page.title.replace(/^File:/,''),author,license,sourceUrl:info.descriptionurl};
    }
   }catch{/* Use the locally licensed photograph when the official metadata service is unavailable. */}
  }
  photos=result;return result;
 }
 async function all(){if(pending)return pending;if(Date.now()-checkedAt<DAY_MS)return photos;checkedAt=Date.now();pending=refresh().finally(()=>{pending=undefined});return pending;}
 return{all};
}
