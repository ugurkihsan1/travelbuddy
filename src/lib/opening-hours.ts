import type { Place, VenueHours } from '../types';
export type OpeningCheck={status:'open'|'closed'|'outside-hours'|'unverified';message:string;waitMinutes:number;closesAt?:number};
export function checkVisitHours(place:Place,weekday:number,arrivalMinutes:number,hours?:VenueHours):OpeningCheck{
 if(place.closedDays?.includes(weekday))return{status:'closed',message:'Normally closed on this day',waitMinutes:0};
 if(!hours||hours.status!=='verified'||!hours.checkedAt||Date.now()-Date.parse(hours.checkedAt)>=86400000||Date.parse(hours.checkedAt)>Date.now()||!Number.isFinite(Date.parse(hours.checkedAt)))return{status:'unverified',message:'Hours unverified',waitMinutes:0};
 if(!hours.windows || hours.windows.some(w=>!Array.isArray(w.weekdays)||w.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6)||!Number.isFinite(minutes(w.open))||!Number.isFinite(minutes(w.close))||minutes(w.close)<=minutes(w.open)))return{status:'unverified',message:'Hours unverified',waitMinutes:0};
 const windows=hours.windows?.filter(w=>w.weekdays.includes(weekday))??[];
 if(!windows.length)return{status:'closed',message:'Closed on this day',waitMinutes:0};
 for(const window of windows){const open=minutes(window.open),close=minutes(window.close);const visitStart=Math.max(open,arrivalMinutes);if(visitStart+place.duration<=close)return{status:'open',message:arrivalMinutes<open?`Opens at ${window.open}`:`Visit fits before ${window.close}`,waitMinutes:Math.max(0,open-arrivalMinutes),closesAt:close};}
 return{status:'outside-hours',message:'Not enough time before closing',waitMinutes:0};
}
function minutes(time:string){if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))return NaN;const [h,m]=time.split(':').map(Number);return h*60+m;}
