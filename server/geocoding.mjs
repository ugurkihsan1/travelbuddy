export function createGeocoder({fetchImpl=fetch,now=Date.now}={}){
 const cache=new Map();let queue=Promise.resolve();let lastRequest=0;
 async function search(raw){
  const q=typeof raw==='string'?raw.trim():'';if(q.length<3||q.length>200)throw Error('Enter a hotel name or address between3 and200 characters.');
  const cached=cache.get(q.toLowerCase());if(cached&&now()-cached.at<3600000)return cached.results;
  const request=queue.catch(()=>{}).then(async()=>{
   const wait=1000-(now()-lastRequest);if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));lastRequest=now();
   const params=new URLSearchParams({q,format:'jsonv2',limit:'5',viewbox:'28.4,41.4,29.5,40.75',bounded:'1',countrycodes:'tr','accept-language':'en',addressdetails:'0'});
   const response=await fetchImpl('https://nominatim.openstreetmap.org/search?'+params,{headers:{'User-Agent':'TravelBuddy/0.1 Istanbul travel planning (user-submitted address lookup)','Accept':'application/json'},signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw Error('Address search is unavailable. Select a point on the map instead.');
   const data=await response.json();if(!Array.isArray(data))throw Error('Invalid address response.');
   const results=data.map(p=>({label:String(p.display_name??'').slice(0,200),coordinate:{lat:Number(p.lat),lng:Number(p.lon)}})).filter(p=>p.label&&Number.isFinite(p.coordinate.lat)&&Number.isFinite(p.coordinate.lng)&&p.coordinate.lat>=40.75&&p.coordinate.lat<=41.4&&p.coordinate.lng>=28.4&&p.coordinate.lng<=29.5).slice(0,5);
   cache.set(q.toLowerCase(),{at:now(),results});return results;
  });queue=request.then(()=>{},()=>{});return request;
 }
 return{search};
}
