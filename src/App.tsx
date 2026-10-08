import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bus,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coffee,
  Compass,
  Flag,
  Footprints,
  Globe2,
  Heart,
  Info,
  LocateFixed,
  Map,
  MapPin,
  Navigation,
  Plus,
  Route,
  Search,
  Settings2,
  ShieldCheck,
  Ship,
  SkipForward,
  Sparkles,
  Ticket,
  TrainFront,
  TramFront,
  Undo2,
  Wallet,
  X,
} from "lucide-react";
import type {
  Coordinate,
  Place,
  PlannedStop,
  TransportMode,
  TransportOption,
  TripDay,
  TripSettings,
} from "./types";
import { findPlace, places, stayAreas } from "./data/places";
import {
  createTrip,
  dayDate,
  distanceKm,
  getDaySchedule,
  getTransport,
  getChosenTransport,
  reorderRemaining,
} from "./lib/planner";
import { guideSections, travelTips } from "./data/guides";
import { fetchArrivals, hasLiveTransit } from "./lib/transit";
import { loadTrip, saveTrip } from "./lib/storage";
import { RouteMap } from "./components/RouteMap";
import { continueFromHere } from "./lib/continuation";
import { saveTripSettings, moveStopUpDown, moveStopToDay, replaceStop, lightenDay, findAlternatives, type TripActionResult } from "./lib/trip-actions";
import { AccommodationPicker } from "./components/AccommodationPicker";
import { StopDragHandle } from "./components/StopDragHandle";
import { JournalEditor } from "./components/Journal";
import { ExploreMap } from "./components/ExploreMap";
import { getCoffeeSuggestions } from "./lib/discovery";
import { cafes, type Cafe } from "./data/amenities";
import { getOfflineStatus, prepareOffline, type OfflineStatus } from "./lib/offline";
import { LanguageProvider, useTranslation, useLanguage, translate, translatePlace, getPlaceText } from "./lib/i18n";
import { Skyline } from "./components/Skyline";
import { PlacePhoto } from "./components/PlacePhoto";
import { getDayMapLinks, getDirectionsUrl } from "./lib/maps";
import { getCachedVenueInfo, loadAllVenueInfo } from "./lib/venue-info";
import type { VenueInfo } from "./types";

type Tab = "itinerary" | "map" | "guide";
type Modal = "settings" | "add" | "place" | "plan-preview" | "replace" | "journal" | null;
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const defaults = (): TripSettings => ({
  days: 3,
  stayArea: "sultanahmet",
  pace: "balanced",
  startDate: today(),
  startTime: "09:00",
  coffeeStops: false,
  routeMode: "keep",
  interests: [],
  language: "en",
});
const modeIcon = (mode: TransportMode, size = 18) => {
  const Icon = {
    walk: Footprints,
    tram: TramFront,
    metro: TrainFront,
    marmaray: TrainFront,
    ferry: Ship,
    bus: Bus,
    taxi: Navigation,
  }[mode];
  return <Icon size={size} />;
};
const money = (min: number, max: number) =>
  min === 0 && max === 0 ? "Free" : min === max ? `₺${min}` : `₺${min}–${max}`;
const searchText = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i");
const categoryIcon = (category: Place["category"], size = 19) => {
  const Icon = {
    landmark: Compass,
    museum: Ticket,
    market: Wallet,
    neighborhood: MapPin,
    viewpoint: Globe2,
    food: Heart,
    park: Footprints,
  }[category];
  return <Icon size={size} />;
};

function App() {
  const [saved] = useState(loadTrip);
  const [settings, setSettings] = useState<TripSettings>(
    () => saved?.settings ?? defaults(),
  );
  const [days, setDays] = useState<TripDay[]>(
    () => saved?.days ?? createTrip(defaults()),
  );
  const [selectedDay, setSelectedDay] = useState(saved?.selectedDay ?? 1);
  const [hasPlan, setHasPlan] = useState(!!saved);
  const [view, setView] = useState<"travel" | "plan">("travel");
  const [undoHistory, setUndoHistory] = useState<{settings:TripSettings;days:TripDay[];selectedDay:number}[]>([]);
  const [settingsError, setSettingsError] = useState("");
  const [planPreview, setPlanPreview] = useState<{settings:TripSettings;days:TripDay[]}|null>(null);
  const [replacing, setReplacing] = useState<Place|null>(null);
  const [routeSuggestion, setRouteSuggestion] = useState<{day:TripDay;walkingDelta:number;travelDelta:number}|null>(null);
  const [offlineStatus, setOfflineStatus] = useState<OfflineStatus>({status:"not-ready",cachedPhotos:0,totalPhotos:0,message:"Offline copy not prepared"});
  const [tab, setTab] = useState<Tab>("itinerary");
  const [modal, setModal] = useState<Modal>(saved ? null : "settings");
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [selectedTransport, setSelectedTransport] =
    useState<TransportOption | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Coordinate | null>(
    null,
  );
  const [tracking, setTracking] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const [toast, setToast] = useState("");
  const [venueInfo, setVenueInfo] = useState<Record<string, VenueInfo>>(() =>
    Object.fromEntries(places.map((p) => [p.id, getCachedVenueInfo(p.id)])),
  );
  const [storageError, setStorageError] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<
    (Event & { prompt: () => Promise<void> }) | null
  >(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const selectedDayRef = useRef(selectedDay);
  selectedDayRef.current = selectedDay;
  const lastReroute = useRef<{ day: number; coordinate: Coordinate } | null>(
    null,
  );

  const language = (modal === "plan-preview" ? planPreview?.settings.language : undefined) ?? settings.language ?? "en";
  const t = (text: string) => translate(text, language);
  const area =
    stayAreas.find((a) => a.id === settings.stayArea) ?? stayAreas[0];
  const day = days.find((d) => d.id === selectedDay) ?? days[0];
  const visited = days.reduce(
    (n, d) => n + d.stops.filter((s) => s.status === "visited").length,
    0,
  );
  const total = days.reduce(
    (n, d) => n + d.stops.filter((s) => s.status !== "skipped").length,
    0,
  );
  const pending = day.stops.filter((s) => s.status === "pending");
  const next = pending.length ? findPlace(pending[0].placeId) : undefined;
  const lastVisited = [...day.stops]
    .reverse()
    .find((s) => s.status === "visited");
  const origin =
    currentLocation ??
    (lastVisited ? findPlace(lastVisited.placeId)?.coordinate : undefined) ??
    day.continuation?.origin ?? settings.accommodation?.coordinate ?? area.coordinate;
  const transport = next ? getTransport(origin, next) : null;
  const chosen = next ? getChosenTransport(origin, next, pending[0]?.transportMode) : undefined;
  const schedule = getDaySchedule(day, settings, settings.accommodation?.coordinate ?? area.coordinate, Object.fromEntries(Object.entries(venueInfo).map(([id,v]) => [id,v.hours])));
  const hoursById = Object.fromEntries(Object.entries(venueInfo).map(([id,v])=>[id,v.hours]));
  const replacements = replacing ? findAlternatives(replacing,day,days,12,dayDate(settings.startDate,selectedDay).getUTCDay()).filter(place => {
    const candidate={...day,stops:day.stops.map(stop=>stop.placeId===replacing.id?{...stop,placeId:place.id}:stop)};
    const status=getDaySchedule(candidate,settings,undefined,hoursById).openingChecks[place.id]?.status;
    return status!=='closed'&&status!=='outside-hours';
  }).slice(0,3) : [];
  const times = schedule.stopTimes;
  const mapLinks = getDayMapLinks(day, origin);
  const near = currentLocation
    ? pending
        .map((s) => findPlace(s.placeId))
        .find((p) => p && distanceKm(currentLocation, p.coordinate) < 0.12)
    : undefined;

  useEffect(() => {
    if (hasPlan) setStorageError(!saveTrip({ version: 1, settings, days, selectedDay }));
  }, [settings, days, selectedDay, hasPlan]);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => loadAllVenueInfo(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setVenueInfo(Object.fromEntries(data.map((v) => [v.placeId, v])));
      })
      .catch(() => {});
    refresh();
    const timer = window.setInterval(refresh, 24 * 60 * 60 * 1000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (modal && !dialog.current?.open) dialog.current?.showModal();
    if (!modal && dialog.current?.open) dialog.current.close();
  }, [modal]);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    const online = () => setIsOnline(navigator.onLine);
    const install = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as Event & { prompt: () => Promise<void> });
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    window.addEventListener("beforeinstallprompt", install);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      window.removeEventListener("beforeinstallprompt", install);
    };
  }, []);
  useEffect(() => {
    if (!tracking || !navigator.geolocation) return;
    let lastPosition: Coordinate | null = null;
    let active = true;
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        if (!active) return;
        const coordinate = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        if (
          coordinate.lat < 40.75 ||
          coordinate.lat > 41.4 ||
          coordinate.lng < 28.4 ||
          coordinate.lng > 29.5
        ) {
          setLocationMessage(
            "You’re outside Istanbul. Your route starts from your stay area.",
          );
          setCurrentLocation(null);
          return;
        }
        if (position.coords.accuracy > 150) {
          setLocationMessage(
            "Location is a little imprecise. Move outdoors for a better route.",
          );
          return;
        }
        if (!lastPosition || distanceKm(lastPosition, coordinate) > 0.015) {
          lastPosition = coordinate;
          setCurrentLocation(coordinate);
        }
        setLocationMessage("Your start point is up to date. Stop order stays under your control.");
      },
      (error) => {
        if (!active) return;
        lastPosition = null;
        setLocationMessage(
          error.code === 1
            ? "Location permission was declined. You can still explore from your stay area."
            : "Your location is temporarily unavailable. We’ll reconnect when a fresh fix arrives; moving outdoors may help.",
        );
        if (error.code === 1) {
          active = false;
          setTracking(false);
        }
        setCurrentLocation(null);
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
    );
    return () => {
      active = false;
      navigator.geolocation.clearWatch(watch);
    };
  }, [tracking]);
  useEffect(() => {
    if (settings.routeMode !== "optimize" || pending.length < 2) { setRouteSuggestion(null); return; }
    const candidate = reorderRemaining(day, origin);
    const beforeOrder = day.stops.filter(s => s.status === "pending").map(s => s.placeId).join();
    const afterOrder = candidate.stops.filter(s => s.status === "pending").map(s => s.placeId).join();
    if (beforeOrder === afterOrder) { setRouteSuggestion(null); return; }
    const continuation = { startTime: "09:00", origin };
    const before = getDaySchedule({...day, continuation, delayMinutes:0}, settings);
    const after = getDaySchedule({...candidate, continuation, delayMinutes:0}, settings);
    const walkingDelta = before.walkingMinutes - after.walkingMinutes;
    const travelDelta = before.travelMinutes - after.travelMinutes;
    setRouteSuggestion(walkingDelta > 0 || travelDelta > 0 ? {day:candidate,walkingDelta,travelDelta} : null);
  }, [currentLocation, selectedDay, settings.routeMode, day, settings.accommodation]);
  useEffect(() => {
    const refresh = () => { getOfflineStatus().then(setOfflineStatus); };
    refresh(); window.addEventListener("travelbuddy:offline-status-changed", refresh);
    return () => window.removeEventListener("travelbuddy:offline-status-changed", refresh);
  }, []);
  function checkpoint() {
    setUndoHistory(old => [...old.slice(-9), {settings,days,selectedDay}]);
  }
  function undoChange() {
    const previous = undoHistory.at(-1); if (!previous) return;
    setSettings(previous.settings); setDays(previous.days); setSelectedDay(previous.selectedDay);
    setUndoHistory(old => old.slice(0,-1)); setToast("Previous plan restored, including your visits and memories.");
  }
  function applyAction(result: TripActionResult) {
    if (result.changed) {
      checkpoint(); setDays(result.days);
      if (result.dayCount) setSettings(old => ({...old,days:result.days.length}));
      if (result.selectedDay) setSelectedDay(result.selectedDay);
      setSettings(old => ({...old,routeMode:"keep"}));
    }
    setToast(result.message);
  }

  function setStatus(placeId: string, status: PlannedStop["status"]) {
    checkpoint();
    setDays(old => old.map(d => d.id !== selectedDay ? d : {...d, stops: d.stops.map(s => s.placeId === placeId ? {...s,status} : s)}));
    setToast(status === "visited" ? "A new place for your memories. Add a photo or note in your day journal." : status === "skipped" ? "Saved as skipped. You can keep this place for another day." : "Stop restored. Your order was kept.");
  }
  function toggleLocation() {
    if (tracking) {
      setTracking(false);
      setCurrentLocation(null);
      setLocationMessage("Location following is paused.");
      return;
    }
    if (!navigator.geolocation) {
      setLocationMessage(
        "This browser doesn’t support location. Your stay area is your starting point.",
      );
      return;
    }
    setLocationMessage("Finding your location…");
    setTracking(true);
  }
  function showPlace(place: Place, option: TransportOption | null = null) {
    setSelectedPlace(place);
    setSelectedTransport(option);
    setModal("place");
  }
  function updateTrip(newSettings: TripSettings) {
    const result = saveTripSettings(days,settings,newSettings);
    if (!result.changed) { setSettingsError(result.message); return; }
    checkpoint(); setSettings(result.settings); setDays(result.days); setHasPlan(true);
    setSelectedDay(old => Math.min(old,newSettings.days)); setSettingsError(""); setPlanPreview(null); setModal(null); setToast(result.message);
  }
  function previewTrip(newSettings: TripSettings) {
    setPlanPreview({settings:newSettings,days:createTrip(newSettings,hoursById)}); setModal("plan-preview");
  }
  function applyPreview() {
    if (!planPreview) return;
    checkpoint(); setSettings(planPreview.settings); setDays(planPreview.days); setHasPlan(true);
    setSelectedDay(1); setView("plan"); setPlanPreview(null); setModal(null); setToast("Your new plan is ready. You can undo this replacement.");
  }
  function addPlace(place: Place, alreadyVisited: boolean) {
    if (day.stops.some(s => s.placeId === place.id)) { if(day.stops.find(s=>s.placeId===place.id)?.status === "skipped") setStatus(place.id,alreadyVisited?"visited":"pending"); else setToast("This place is already in today's plan."); return; }
    const existing = days.find(d => d.stops.some(stop => stop.placeId === place.id));
    if (existing?.stops.find(stop => stop.placeId === place.id)?.status === 'visited') {
      setToast("This visit is already in your journal. Its history was kept."); return;
    }
    if (existing) {
      const moved = moveStopToDay(days,existing.id,selectedDay,place.id);
      applyAction(moved);
      if (alreadyVisited && moved.changed) setDays(moved.days.map(d=>d.id!==selectedDay?d:{...d,stops:d.stops.map(stop=>stop.placeId===place.id?{...stop,status:'visited'}:stop)}));
    } else {
      checkpoint();
      setDays(old => old.map(d => d.id !== selectedDay ? d : {...d,stops:[...d.stops,{placeId:place.id,status:alreadyVisited?'visited':'pending',added:true}]}));
      setToast(alreadyVisited ? "Added to today's memories." : "Added to the end of your day. Your order was kept.");
    }
    setModal(null);
  }

  function chooseTransport(placeId: string, mode: TransportMode) {
    checkpoint(); setDays(old => old.map(d => d.id !== selectedDay ? d : {...d,stops:d.stops.map(s => s.placeId === placeId ? {...s,transportMode:mode} : s)}));
    setToast("Transport saved. Arrival times, walking and the estimated budget updated.");
  }
  function dragStop(fromId:string,toId:string) {
    const order=day.stops.filter(s=>s.status==='pending').map(s=>s.placeId);
    let from=order.indexOf(fromId); const to=order.indexOf(toId);
    if(from<0||to<0||from===to)return;
    let result:TripActionResult={days,changed:false,message:"Stop order updated. Undo is available."};
    while(from!==to){result=moveStopUpDown(result.days,selectedDay,fromId,from<to?'down':'up');if(!result.changed)return;from+=from<to?1:-1;}
    applyAction({...result,message:"Stop order updated. Undo is available."});
  }
  function continueNow(delay = 0) {
    try {
      const continued = continueFromHere(day,settings,origin,new Date(),delay);
      if (continued === day) return;
      checkpoint(); setDays(old => old.map(d => d.id !== selectedDay ? d : continued));
      setToast(delay ? "Delay applied to your remaining plan. Your visit history was kept." : "Continuing from your current start point and Istanbul time.");
    } catch (error) { setToast(error instanceof Error ? error.message : "The current time is unavailable."); }
  }
  function saveMemory(placeId: string, memory: {note:string;photo?:string}) {
    checkpoint(); setDays(old => old.map(d => d.id !== selectedDay ? d : {...d,stops:d.stops.map(s => s.placeId === placeId ? {...s,memory} : s)}));
  }
  function chooseCafe(cafe: Cafe) {
    const previous = pending[0]?.placeId;
    if (!previous) { setToast("Add a place to your day before choosing a coffee break."); return; }
    setCoffeeBreak(previous,20,cafe.id); setToast(`${t("Coffee break after")} ${translatePlace(previous,language)}: ${cafe.name}. ${t("Drinks cost extra.")}`);
  }
  function setCoffeeBreak(afterPlaceId: string, duration: number, cafeId?: string) {
    checkpoint();
    setDays((old) => old.map((d) => d.id !== selectedDay ? d : {
      ...d,
      coffeeBreaks: [
        ...(d.coffeeBreaks ?? []).filter((b) => b.afterPlaceId !== afterPlaceId),
        ...(duration ? [{ afterPlaceId, duration, ...(cafeId ? {cafeId} : d.coffeeBreaks?.find(b => b.afterPlaceId === afterPlaceId)?.cafeId ? {cafeId:d.coffeeBreaks.find(b => b.afterPlaceId === afterPlaceId)!.cafeId} : {}) }] : []),
      ],
    }));
    setToast(duration ? `A ${duration}-minute coffee break is in your day. Times updated.` : "Coffee break removed. Times updated.");
  }

  return (
    <LanguageProvider language={language}><div className={`app-shell ${view === "travel" ? "travel-mode" : "planning-mode"}`}>
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("itinerary");
          }}
          aria-label={t("TravelBuddy home")}
        >
          <span className="brand-mark">
            <Compass size={24} strokeWidth={1.7} />
          </span>
          <span>{t("travel")}<span className="brand-light">{t("buddy")}</span>
            <span className="brand-dot">.</span>
          </span>
        </a>
        <nav className="desktop-nav" aria-label={t("Main navigation")}>
          <button
            className={tab === "itinerary" ? "active" : ""}
            onClick={() => setTab("itinerary")}
          >{t("My itinerary")}</button>
          <button
            className={tab === "map" ? "active" : ""}
            onClick={() => setTab("map")}
          >{t("Explore the map")}</button>
          <button
            className={tab === "guide" ? "active" : ""}
            onClick={() => setTab("guide")}
          >{t("Travel essentials")}</button>
        </nav>
        <div className="topbar-end">
          <span className="city-tag">
            <span />{t("Istanbul, Türkiye")}</span>
          <button
            className="icon-button"
            aria-label={t("Edit your trip")}
            onClick={() => setModal("settings")}
          >
            <Settings2 size={19} />
          </button>
        </div>
      </header>

      {!isOnline && (
        <div className="status-banner">
          <Info size={15} />{t("You’re offline. Your saved itinerary and travel guide are here; live maps and current data need internet.")}</div>
      )}
      {storageError && (
        <div className="status-banner warning">
          <Info size={15} />{t("Your browser can’t save this trip. Keep this page open to retain your changes.")}</div>
      )}

      <main className="main-container">
        <div className="view-switch"><div role="group" aria-label={t("Trip view")}><button className={view === "travel" ? "active" : ""} onClick={() => {setView("travel");setTab("itinerary");}}><Navigation size={18}/>{t("Travel now")}</button><button className={view === "plan" ? "active" : ""} onClick={() => {setView("plan");setTab("itinerary");}}><CalendarDays size={18}/>{t("Plan")}</button></div><select aria-label={t("Language")} value={language} onChange={e => setSettings(old => ({...old,language:e.target.value as "en"|"tr"}))}><option value="en">{t("English")}</option><option value="tr">{t("Türkçe")}</option></select>{undoHistory.length > 0 && <button className="undo-plan" onClick={undoChange}><Undo2 size={17}/>{t("Undo change")}</button>}</div>
        {view === "travel" && tab === "itinerary" && next && chosen && <section className="next-stop-focus" aria-label={t("Next stop")}>
          <div className="focus-top"><span className="eyebrow">{t("NEXT STOP · DAY ")}{selectedDay}</span><span>{schedule.stopTimes[next.id]}</span></div>
          <div className="focus-place"><button onClick={() => showPlace(next)} className="focus-photo"><PlacePhoto place={next} loading="eager" photo={venueInfo[next.id]?.photo}/></button><div><h1>{translatePlace(next,language)}</h1><p>{getPlaceText(next,"description",language).split(/[.!?]/)[0]}.</p></div></div>
          <div className="focus-metrics"><span>{modeIcon(chosen.mode,23)}<strong>~{chosen.duration}{t(" min")}</strong><small>{t(chosen.mode === "walk" ? "Walk" : chosen.mode === "taxi" ? "Taxi" : chosen.mode[0].toUpperCase()+chosen.mode.slice(1))}</small></span><span><Footprints size={23}/><strong>{(chosen.walkingKm??0).toFixed(1)}{t(" km")}</strong><small>{t("Walking on this leg")}</small></span><span><Wallet size={23}/><strong>{t(money(chosen.price.min,chosen.price.max))}</strong><small>{t("Estimated fare")}</small></span></div>
          <a className="primary-button focus-directions" href={getDirectionsUrl(origin,next.coordinate,chosen.mode === "walk" ? "walking" : chosen.mode === "taxi" ? "driving" : "transit")} target="_blank" rel="noopener noreferrer"><Navigation size={20}/>{t("Directions")}<ArrowUpRight size={18}/></a>
          <div className="focus-actions"><button className="visit-button" onClick={() => setStatus(next.id,"visited")}><Check size={19}/>{t("Visited")}</button><button className="skip-button" onClick={() => setStatus(next.id,"skipped")}><SkipForward size={18}/>{t("Skip")}</button><button className="skip-button" onClick={() => {setReplacing(next);setModal("replace");}}>{t("I feel like something else")}</button></div>
          <label className="focus-transport">{t("Transport method")}<select aria-label={t("Next transport method")} value={chosen.mode} onChange={e => chooseTransport(next.id,e.target.value as TransportMode)}>{[transport!.recommended,...transport!.alternatives].map(option => <option key={option.mode} value={option.mode}>{t(option.mode === "walk" ? "Walk" : option.mode === "taxi" ? "Taxi" : option.mode[0].toUpperCase()+option.mode.slice(1))} · ~{option.duration}{t(" min")}</option>)}</select></label>
          <div className="resume-actions"><button onClick={() => continueNow()}><LocateFixed size={17}/>{t("Continue from here")}</button><button onClick={() => continueNow(30)}><Clock3 size={17}/>{t("I'm 30 minutes late")}</button><button onClick={() => applyAction(lightenDay(days,selectedDay))}><Sparkles size={17}/>{t("Lighten today")}</button></div>
          <small className="estimate-note">{t("Times, distances and fares are estimates. ")}{t(schedule.openingChecks[next.id]?.message ?? "Hours unverified")}</small>
        </section>}
        <section className="page-intro">
          <div>
            <div className="eyebrow">
              <span className="small-line" />{t("LESS PLANNING. MORE DISCOVERING.")}</div>
            <h1>{t("Your Istanbul starts here")}<span>.</span>
            </h1>
            <p>{t("Great places. Clear directions. A day that fits you.")}</p>
          </div>
          <button
            className="secondary-button edit-trip"
            onClick={() => setModal("settings")}
          >
            <Settings2 size={16} />{t("Customize my trip")}</button>
        </section>

        <details className="trip-summary" open={view === "plan" ? true : undefined}><summary>{t("Your trip summary ")}<ChevronDown size={17}/></summary>
        <section className="trip-overview" aria-label={t("Your trip overview")}>
          <div className="trip-overview-content">
            <div className="trip-label">
              <span className="pulse-dot" />{t("YOUR ISTANBUL ADVENTURE")}</div>
            <h2>{settings.days}{t(" days of Istanbul. Let’s go.")}</h2>
            <div className="trip-facts">
              <span>
                <CalendarDays size={15} />
                {dayDate(settings.startDate, 1).toLocaleDateString("en-GB", {
                  timeZone: "Europe/Istanbul",
                  month: "short",
                  day: "numeric",
                })}{" "}
                –{" "}
                {dayDate(settings.startDate, settings.days).toLocaleDateString(
                  "en-GB",
                  {
                    timeZone: "Europe/Istanbul",
                    month: "short",
                    day: "numeric",
                  },
                )}
              </span>
              <span>
                <MapPin size={15} />{t("Staying in ")}{area.name}
              </span>
              <span className="pace-fact">
                <Footprints size={15} />
                {settings.pace[0].toUpperCase() + settings.pace.slice(1)}{t(" pace")}</span>
              <span><Clock3 size={17} />{t(" Start at ")}{settings.startTime ?? "09:00"}</span>
              {settings.coffeeStops && <span><Coffee size={17} />{t(" Coffee breaks included")}</span>}
            </div>
          </div>
          <Skyline />
          <div className="trip-progress">
            <span className="progress-icon">
              <Flag size={20} />
            </span>
            <strong>
              {visited}
              <span>/{total}</span>
            </strong>
            <span>{t("places explored")}</span>
            <div className="progress-track">
              <span
                style={{ width: `${total ? (visited / total) * 100 : 0}%` }}
              />
            </div>
          </div>
        </section>

        </details>
        <div className="day-toolbar">
          <div className="day-tabs" role="tablist" aria-label={t("Trip days")}>
            {days.map((d) => (
              <button
                key={d.id}
                role="tab"
                aria-selected={selectedDay === d.id}
                className={selectedDay === d.id ? "active" : ""}
                onClick={() => setSelectedDay(d.id)}
              >
                <span>{t("Day ")}{d.id}</span>
                <small>
                  {dayDate(settings.startDate, d.id).toLocaleDateString(
                    "en-GB",
                    {
                      timeZone: "Europe/Istanbul",
                      weekday: "short",
                      day: "numeric",
                    },
                  )}
                </small>
                {d.stops.every((s) => s.status !== "pending") && (
                  <CheckCircle2 size={13} />
                )}
              </button>
            ))}
          </div>
          <button
            className={`location-button ${tracking ? "tracking" : ""}`}
            onClick={toggleLocation}
          >
            <LocateFixed size={16} />
            <span>{tracking ? t("Following location") : t("Use my location")}</span>
          </button>
        </div>
        <div className="route-policy"><label>{t("Route order")}<select aria-label={t("Route order")} value={settings.routeMode??"keep"} onChange={e => {checkpoint();setSettings(old => ({...old,routeMode:e.target.value as "keep"|"optimize"}));}}><option value="keep">{t("Keep order")}</option><option value="optimize">{t("Optimize route")}</option></select></label><span>{settings.routeMode === "optimize" ? t("Suggestions need your approval before the order changes.") : t("Your stop order is kept as you move.")}</span><button onClick={() => setModal("journal")}><Heart size={17}/>{t("Explored today · ")}{day.stops.filter(s => s.status === "visited").length}</button></div>
        {routeSuggestion && <div className="route-suggestion" role="status"><Route size={22}/><div><strong>{t("Suggested route change")}</strong><p>{Math.abs(routeSuggestion.walkingDelta)}{t(" min ")}{routeSuggestion.walkingDelta >= 0 ? t("less") : t("more")}{t(" walking · ")}{Math.abs(routeSuggestion.travelDelta)}{t(" min ")}{routeSuggestion.travelDelta >= 0 ? t("less") : t("more")}{t(" travel. Planning estimates.")}</p><p>{routeSuggestion.day.stops.filter(s => s.status === "pending").map(s => translatePlace(s.placeId,language)).join(" → ")}</p></div><button className="secondary-button" onClick={() => {checkpoint();setDays(old => old.map(d => d.id === selectedDay ? routeSuggestion.day : d));setRouteSuggestion(null);setToast("Suggested order applied. Undo is available.");}}>{t("Apply suggested order")}</button></div>}
        {locationMessage && (
          <div className="location-note" role="status">
            <LocateFixed size={14} />
            {t(locationMessage)}
          </div>
        )}
        {near && (
          <div className="nearby-note">
            <MapPin size={18} />
            <span>{t("You’re near ")}<strong>{near.name}</strong>{t(". Have you explored it?")}</span>
            <button onClick={() => setStatus(near.id, "visited")}>{t("Mark visited ")}<Check size={14} />
            </button>
          </div>
        )}

        {tab === "map" ? <ExploreMap day={day} origin={origin} currentLocation={currentLocation} onSelectPlace={showPlace} onAddPlace={place=>addPlace(place,false)} onCoffee={chooseCafe}/> : tab === "guide" ? (
          <GuideView
            offlineStatus={offlineStatus}
            onPrepareOffline={async () => {setOfflineStatus({status:"preparing",cachedPhotos:0,totalPhotos:53,message:"Downloading your offline copy…"});setOfflineStatus(await prepareOffline(setOfflineStatus));}}
            installPrompt={installPrompt}
            onInstall={async () => {
              await installPrompt?.prompt();
              setInstallPrompt(null);
            }}
          />
        ) : (
          <div className="journey-grid">
            <section
              className="itinerary-section"
              aria-label={`Day ${selectedDay} itinerary`}
            >
              <div className="section-heading itinerary-heading">
                <div>
                  <span className="eyebrow">{t("DAY ")}{selectedDay} ·{" "}
                    {dayDate(settings.startDate, selectedDay)
                      .toLocaleDateString("en-GB", {
                        timeZone: "Europe/Istanbul",
                        weekday: "long",
                      })
                      .toUpperCase()}
                  </span>
                  <h2>{t(day.title)}</h2>
                  <p>{t(day.subtitle)}</p>
                </div>
                <span className="stops-pill">{pending.length}{t(" stops left")}</span>
              </div>
              <details className="day-details" open={view === "plan" ? true : undefined}><summary>{t("Walking, timing & budget ")}<ChevronDown size={17}/></summary><section className="walking-summary" aria-label={t("Daily walking and timing")}>
                <div className="walking-head"><span><Footprints size={22} />{t(" YOUR WALKING TODAY")}</span><span className="walking-estimate">{t("Planning estimate")}</span></div>
                <div className="walking-metrics">
                  <div><strong>{schedule.walkingKm.toFixed(1)} <small>{t("km")}</small></strong><span>{t("Total walking")}</span></div>
                  <div><strong>{schedule.walkingMinutes} <small>{t("min")}</small></strong><span>{t("On your feet")}</span></div>
                  <div><strong>{schedule.finishTime}</strong><span>{t("Estimated finish")}</span></div>
                </div>
                <div className="transport-budget"><Wallet size={18}/><strong>{t(money(schedule.budgetMin,schedule.budgetMax))}</strong><span>{t("Estimated transport budget · taxi per car, other fares per person · excludes tickets and extra connections")}</span></div><div className="journey-timing"><Clock3 size={17} /><span>{day.continuation?.startTime ?? settings.startTime ?? "09:00"}{t(" start · ")}{Math.round(schedule.visitMinutes / 60 * 10) / 10}{t("h at places")}{schedule.coffeeMinutes ? ` · ${schedule.coffeeMinutes} min coffee breaks` : ""}</span></div>
                <p>{t("Includes walks to stations and piers. Strolling inside attractions and your return to the hotel are extra.")}</p>
                {schedule.lateFinish && <p className="late-note">{t("This day may finish late. Skip a stop or choose a more relaxed pace. Venue opening hours can vary.")}</p>}
                <div className="maps-links">
                  {mapLinks.map((link, i) => <a className="maps-button" key={link.url} href={link.url} target="_blank" rel="noopener noreferrer"><Map size={19} />{mapLinks.length === 1 ? t("Open day in Google Maps") : `Google Maps · part ${i + 1} of ${mapLinks.length}`}<ArrowUpRight size={16} /></a>)}
                </div>
              </section>
              <p className="estimate-note">{t("Regular opening hours are verified for Istanbul Modern and Pera only. Holiday exceptions are unverified.")}</p><div className="price-availability"><Ticket size={16} /><span>{t("Ticket prices show their source and verification date. Unverified fees are marked. Transport fares are estimates.")}</span></div>
              <div className="day-meta"><MapPin size={17} /><span>{t("Next journey starts from ")}{currentLocation ? t("your location") : lastVisited ? findPlace(lastVisited.placeId)?.name : area.name}</span></div>
              </details>
              {!pending.length && (
                <div className="day-complete">
                  <CheckCircle2 size={27} />
                  <div>
                    <h3>{t("A day well explored.")}</h3>
                    <p>
                      {day.stops.some((s) => s.status === "visited")
                        ? t("Take a moment. You’ve made some lovely memories.")
                        : t("Your day is open. Add a place or restore a skipped stop.")}
                    </p>
                  </div>
                  {selectedDay < settings.days && (
                    <button
                      className="text-button"
                      onClick={() => setSelectedDay(selectedDay + 1)}
                    >{t("Next day ")}<ArrowRight size={15} />
                    </button>
                  )}
                </div>
              )}
              <ol className="stop-list">
                {day.stops.map((stop, index) => {
                  const place = findPlace(stop.placeId);
                  if (!place) return null;
                  const following = day.stops
                    .slice(index + 1)
                    .find((s) => s.status === "pending");
                  const followingPlace = following
                    ? findPlace(following.placeId)
                    : undefined;
                  const leg = followingPlace
                    ? schedule.legOptions[followingPlace.id] ?? getChosenTransport(place.coordinate, followingPlace, following?.transportMode, place.side)
                    : null;
                  return (
                    <li key={place.id} data-place-id={place.id} className={`stop-item ${stop.status}`}>
                      <div className="timeline">
                        <span className={`timeline-number ${stop.status}`}>
                          {stop.status === "visited" ? (
                            <Check size={15} />
                          ) : stop.status === "skipped" ? (
                            <SkipForward size={13} />
                          ) : (
                            index + 1
                          )}
                        </span>
                        <span className="timeline-line" />
                      </div>
                      <div className="stop-body">
                        <div className="stop-time">{stop.status === "pending" && <StopDragHandle placeId={place.id} onDrop={dragStop}/>}
                          <span>
                            {stop.status === "skipped"
                              ? t("SKIPPED")
                              : stop.status === "visited"
                                ? t("EXPLORED")
                                : (times[place.id] ?? t("FLEXIBLE"))}
                          </span>
                          <span className="time-line" />
                          <span>
                            {place.duration}{t(" min")}{stop.added ? t(" · Your discovery") : ""}
                          </span>
                        </div>
                        <article
                          className={`stop-card ${next?.id === place.id ? "next-stop" : ""}`}
                        >
                          <button
                            className="place-art"
                            style={
                              {
                                "--place-color": place.color,
                              } as React.CSSProperties
                            }
                            aria-label={`View ${translatePlace(place,language)}`}
                            onClick={() => showPlace(place)}
                          >
                            <PlacePhoto place={place} photo={venueInfo[place.id]?.photo} loading={index === 0 ? "eager" : "lazy"} />
                            <span className="art-category">
                              {categoryIcon(place.category, 14)}
                            </span>
                          </button>
                          <div className="stop-card-main">
                            <div className="place-tag">
                              {t(place.category)}
                              {next?.id === place.id && <span>{t("NEXT UP")}</span>}
                            </div>
                            <button
                              className="place-title"
                              onClick={() => showPlace(place)}
                            >
                              <h3>{translatePlace(place,language)}</h3>
                            </button>
                            <p>{getPlaceText(place,"description",language).split(/[.!?]/)[0]}.</p>
                            <div className="place-facts">
                              <span>
                                <MapPin size={12} />
                                {place.district}
                              </span>
                              <span>
                                <Ticket size={16} />
                                <VenuePriceLabel info={venueInfo[place.id]} compact />
                              </span>
                            </div>
                          </div>
                          <div className="stop-actions"><a className="stop-directions" href={getDirectionsUrl(schedule.legOrigins[place.id] ?? origin,place.coordinate,schedule.legOptions[place.id]?.mode === "walk" ? "walking" : schedule.legOptions[place.id]?.mode === "taxi" ? "driving" : "transit")} target="_blank" rel="noopener noreferrer"><Navigation size={16}/>{t("Directions")}</a><button className="detail-button" onClick={() => showPlace(place)}>{t("Details")}</button>

                            {stop.status === "pending" ? (
                              <>
                                <button
                                  className="visit-button"
                                  aria-label={`Mark ${translatePlace(place,language)} as visited`}
                                  onClick={() => setStatus(place.id, "visited")}
                                >
                                  <Check size={14} />{t("Visited")}</button>
                                <button
                                  className="skip-button"
                                  aria-label={`Skip ${translatePlace(place,language)}`}
                                  onClick={() => setStatus(place.id, "skipped")}
                                >
                                  <SkipForward size={13} />{t("Skip")}</button>
                              </>
                            ) : (
                              <button
                                className="restore-button"
                                aria-label={`Restore ${translatePlace(place,language)}`}
                                onClick={() => setStatus(place.id, "pending")}
                              >
                                <Undo2 size={13} />{t("Undo")}</button>
                            )}
                          </div>
                        </article>
                        {stop.status === "pending" && <div className="hours-notice"><Clock3 size={15}/><span>{t(schedule.openingChecks[place.id]?.message ?? "Hours unverified")}</span>{schedule.openingChecks[place.id]?.status !== "open" && <button onClick={() => {setReplacing(place);setModal("replace");}}>{t("See alternatives")}</button>}</div>}
                        {stop.status !== "visited" && <details className="stop-editor"><summary><Settings2 size={15}/>{t("Edit stop")}</summary><div className="stop-edit-actions">{stop.status === "pending" && <><button aria-label={`Move ${translatePlace(place,language)} up`} disabled={!day.stops.slice(0,index).some(s=>s.status === "pending")} onClick={() => applyAction(moveStopUpDown(days,selectedDay,place.id,"up"))}><ArrowUpRight size={16}/>{t("Move up")}</button><button aria-label={`Move ${translatePlace(place,language)} down`} disabled={!day.stops.slice(index+1).some(s=>s.status === "pending")} onClick={() => applyAction(moveStopUpDown(days,selectedDay,place.id,"down"))}><ArrowDown size={16}/>{t("Move down")}</button><button onClick={() => {setReplacing(place);setModal("replace");}}>{t("Replace stop")}</button></>}<select aria-label={`Move ${translatePlace(place,language)} to another day`} value="" onChange={e=>{if(e.target.value)applyAction(moveStopToDay(days,selectedDay,Number(e.target.value),place.id));}}><option value="">{stop.status === "skipped" ? t("Save for another day") : t("Move to another day")}</option>{days.filter(d=>d.id !== selectedDay).map(d=><option key={d.id} value={d.id}>{t("Day ")}{d.id}</option>)}</select></div></details>}
                        {stop.status === "visited" && <button className="memory-button" onClick={()=>setModal("journal")}><Heart size={17}/>{stop.memory?.note || stop.memory?.photo ? t("Open your memory") : t("Add a photo or note")}</button>}
                        {stop.status === "pending" && <label className="leg-choice">{t("Transport to this stop")}<select aria-label={`Transport to ${translatePlace(place,language)}`} value={schedule.legOptions[place.id]?.mode??"walk"} onChange={e=>chooseTransport(place.id,e.target.value as TransportMode)}>{(() => {const from=schedule.legOrigins[place.id]??origin;const recommendation=getTransport(from,place);return [recommendation.recommended,...recommendation.alternatives].map(option=><option key={option.mode} value={option.mode}>{t(option.mode[0].toUpperCase()+option.mode.slice(1))} · ~{option.duration}{t(" min")}</option>);})()}</select></label>}
                        {stop.status === "pending" && (followingPlace || day.coffeeBreaks?.find(b=>b.afterPlaceId===place.id)?.cafeId) && (
                          day.coffeeBreaks?.find((b) => b.afterPlaceId === place.id) ? (
                            <div className="coffee-break">
                              <Coffee size={23} />
                              <div><strong>{t("Coffee break")}</strong><span>{schedule.breakTimes[place.id]} · {day.coffeeBreaks?.find(b=>b.afterPlaceId === place.id)?.cafeId ? cafes.find(c=>c.id === day.coffeeBreaks?.find(b=>b.afterPlaceId === place.id)?.cafeId)?.name : t("Choose a nearby coffee stop below.")}{t(" Drinks cost extra.")}</span>{schedule.coffeeLegs[place.id] && <small>~{schedule.coffeeLegs[place.id].duration} {t("min")} · {t(schedule.coffeeLegs[place.id].mode)}</small>}{day.coffeeBreaks?.find(b=>b.afterPlaceId===place.id)?.cafeId && <a href={getDirectionsUrl(place.coordinate,cafes.find(c=>c.id===day.coffeeBreaks?.find(b=>b.afterPlaceId===place.id)?.cafeId)!.coordinate,schedule.coffeeLegs[place.id]?.mode==="walk"?"walking":schedule.coffeeLegs[place.id]?.mode==="taxi"?"driving":"transit")} target="_blank" rel="noopener noreferrer">{t("Directions")}</a>}</div>
                              <select aria-label={`Coffee break after ${translatePlace(place,language)}`} value={day.coffeeBreaks.find((b) => b.afterPlaceId === place.id)?.duration} onChange={(e) => setCoffeeBreak(place.id, Number(e.target.value))}>
                                {[10, 15, 20, 30, 45, 60].map((min) => <option key={min} value={min}>{min}{t(" min")}</option>)}
                              </select>
                              <button className="icon-button" aria-label={`Remove coffee break after ${translatePlace(place,language)}`} onClick={() => setCoffeeBreak(place.id, 0)}><X size={17} /></button>
                            </div>
                          ) : (
                            <button className="coffee-add" onClick={() => setCoffeeBreak(place.id, 20)}><Coffee size={18} />{t(" Add a coffee break ")}<Plus size={15} /></button>
                          )
                        )}
                        {stop.status === "pending" && followingPlace && day.coffeeBreaks?.some(b=>b.afterPlaceId===place.id) && <CoffeeSuggestions from={place.coordinate} to={followingPlace.coordinate} onSelect={cafe=>setCoffeeBreak(place.id,day.coffeeBreaks?.find(b=>b.afterPlaceId === place.id)?.duration??20,cafe.id)}/>}
                        {stop.status === "pending" && leg && (
                          <div className="between-stops">
                            {modeIcon(leg.mode, 12)}
                            <span>
                              ~{leg.duration}{t(" min")}{" "}
                              {leg.mode === "walk"
                                ? t("walk")
                                : `by ${leg.mode}`}
                            </span>
                            {leg.mode !== "walk" && <span><Footprints size={16} /> {leg.walkingKm?.toFixed(1) ?? "—"}{t(" km walking")}</span>}
                            {leg.mode === "walk" && <span>{leg.walkingKm?.toFixed(1) ?? distanceKm(place.coordinate,followingPlace!.coordinate).toFixed(1)}{t(" km")}</span>}
                            <span className="connector-line" />
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
              <button
                className="add-stop-button"
                onClick={() => setModal("add")}
              >
                <Plus size={17} />
                <div>
                  <strong>{t("A little detour?")}</strong>
                  <span>{t("Add a place, or record somewhere you’ve already been.")}</span>
                </div>
                <ArrowRight size={17} />
              </button>
              <div className="gentle-note">
                <Sparkles size={16} />
                <p>{t("It’s your day, not a checklist. Skip a stop or linger a little — your route will adapt.")}</p>
              </div>
            </section>
            <aside className="journey-sidebar">
              <RouteMap
                stops={day.stops}
                origin={origin}
                currentLocation={currentLocation}
                onSelect={showPlace}
              />
              {next && <a className="maps-button next-map-link" href={getDirectionsUrl(origin, next.coordinate, chosen?.mode === "walk" ? "walking" : chosen?.mode === "taxi" ? "driving" : "transit")} target="_blank" rel="noopener noreferrer"><Navigation size={19} />{t(" Navigate to next stop ")}<ArrowUpRight size={16} /></a>}
              {next && transport ? (
                <TransportCard
                  key={next.id + JSON.stringify(origin)}
                  place={next}
                  recommendation={transport}
                  selectedMode={pending[0]?.transportMode}
                  onChoose={mode => chooseTransport(next.id,mode)}
                  onDetails={(option) => showPlace(next, option)}
                  onGuide={() => setTab("guide")}
                />
              ) : (
                <div className="sidebar-complete">
                  <Flag size={26} />
                  <h3>{t("That’s your day.")}</h3>
                  <p>{t("Found somewhere special? Add it to your trip.")}</p>
                </div>
              )}
              {hasLiveTransit() && <LiveBusCard />}
              <button className="kart-teaser" onClick={() => setTab("guide")}>
                <span className="kart-mini">
                  <span>{t("istanbulkart")}</span>
                  <span className="kart-chip" />
                </span>
                <span>
                  <strong>{t("One card. A whole city.")}</strong>
                  <small>{t("Where to buy & how to use Istanbulkart")}</small>
                </span>
                <ArrowUpRight size={18} />
              </button>
            </aside>
          </div>
        )}
        <footer className="footer">
          <span>
            <Compass size={14} />{t("Made for the moments between destinations.")}</span>
          <span>{t("Fare & journey times are planning estimates.")}</span>
        </footer>
      </main>

      <nav className="mobile-nav" aria-label={t("Mobile navigation")}>
        {(
          [
            { key: "itinerary", label: "My day", Icon: Route },
            { key: "map", label: "Map", Icon: Map },
            { key: "guide", label: "Essentials", Icon: Ticket },
          ] as const
        ).map(({ key, label, Icon }) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => {
              setTab(key);
              if (key === "itinerary") setView("travel");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <Icon size={21} />
            <span>{t(label)}</span>
          </button>
        ))}
        <button onClick={() => {setView("plan");setTab("itinerary");}}><CalendarDays size={21}/><span>{t("Plan")}</span></button>
        <button onClick={() => setModal("settings")}>
          <Settings2 size={21} />
          <span>{t("My trip")}</span>
        </button>
      </nav>

      <dialog
        ref={dialog}
        className={`app-dialog ${modal === "place" ? "place-dialog" : ""}`}
        onCancel={() => {setModal(null);setPlanPreview(null);}}
        onClick={(e) => {
          if (e.target === dialog.current) {setModal(null);setPlanPreview(null);}
        }}
        aria-labelledby="dialog-title"
      >
        <button
          className="dialog-close icon-button"
          aria-label={t("Close dialog")}
          onClick={() => {setModal(null);setPlanPreview(null);}}
        >
          <X size={20} />
        </button>
        {modal === "settings" && (
          <TripForm settings={planPreview?.settings??settings} onSave={updateTrip} onPreview={previewTrip} firstRun={!hasPlan} error={settingsError} />
        )}
        {modal === "plan-preview" && planPreview && <div className="plan-preview"><span className="eyebrow">{t("NEW PLAN PREVIEW")}</span><h2 id="dialog-title">{t("Review before replacing your plan")}</h2><p>{t("Your current trip is still saved. Applying this preview replaces its route and history; you can undo the change.")}</p><div className="preview-days">{planPreview.days.map(d=><article key={d.id}><h3>{t("Day ")}{d.id} · {t(d.title)}</h3><p>{d.stops.map(stop=>translatePlace(stop.placeId,language)).join(" → ") || t("An open day to explore")}</p><span>{getDaySchedule(d,planPreview.settings,undefined,hoursById).walkingKm.toFixed(1)}{t(" km walking · ")}{getDaySchedule(d,planPreview.settings,undefined,hoursById).finishTime}{t(" estimated finish")}</span></article>)}</div><button className="primary-button" onClick={applyPreview}>{t("Apply this plan ")}<Check size={17}/></button><button className="secondary-button" onClick={()=>setModal("settings")}>{t("Back to settings")}</button></div>}
        {modal === "replace" && replacing && <div className="replacement-dialog"><h2 id="dialog-title">{t("I feel like something else")}</h2><p>{t("Nearby choices with a similar visit length. Your other stops stay in place.")}</p>{replacements.map(place=><button className="replacement-option" key={place.id} onClick={()=>{applyAction(replaceStop(days,selectedDay,replacing.id,place));setModal(null);}}><PlacePhoto place={place}/><span><strong>{translatePlace(place,language)}</strong><small>{place.duration}{t(" min · ")}{place.district} · ~{(distanceKm(replacing.coordinate,place.coordinate)*1.3/4.5*60).toFixed(0)}{t(" min away")}</small><span>{getPlaceText(place,"description",language)}</span></span><ArrowRight size={17}/></button>)}{!replacements.length&&<p>{t("No suitable alternatives left nearby. Add another place or save this stop for a different day.")}</p>}</div>}
        {modal === "journal" && <div><h2 id="dialog-title">{t("Day journal")}</h2><JournalEditor day={day} onSave={saveMemory} storageError={storageError}/></div>}
        {modal === "add" && (
          <AddPlace
            usedIds={days.flatMap((d) => d.stops.map((s) => s.placeId))}
            visitedIds={days.flatMap(d=>d.stops.filter(s=>s.status==="visited").map(s=>s.placeId))}
            todayIds={day.stops.map((s) => s.placeId)}
            weekday={dayDate(settings.startDate, selectedDay).getUTCDay()}
            onAdd={addPlace}
          />
        )}
        {modal === "place" && selectedPlace && (
          <PlaceDetails
            place={selectedPlace}
            venueInfo={venueInfo[selectedPlace.id]}
            origin={origin}
            selectedTransport={selectedTransport}
            onMarkVisited={() => {
              const existing = day.stops.find(
                (s) => s.placeId === selectedPlace.id,
              );
              if (existing) {
                setStatus(selectedPlace.id, "visited");
                setModal(null);
              } else addPlace(selectedPlace, true);
            }}
            isInToday={day.stops.some((s) => s.placeId === selectedPlace.id)}
          />
        )}
      </dialog>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {t(toast)}
          <button
            aria-label={t("Dismiss notification")}
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div></LanguageProvider>
  );
}

function VenuePriceLabel({ info, compact = false }: { info?: VenueInfo; compact?: boolean }) {
  const t=useTranslation();

  const price = info?.price;
  const amount = price?.amount !== undefined
    ? `${{ TRY: "₺", EUR: "€", USD: "$" }[price.currency ?? "TRY"]}${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(price.amount)}`
    : undefined;
  const current = price?.status === "verified" || price?.status === "free";
  if (compact) return <span title={price?.label} className={`price-amount ${current ? "" : "unconfirmed"}`}>{price?.status === "free" ? t("Free entry") : amount ? `${amount}${price?.status === "stale" ? " · Last checked" : ""}` : t("Fee not confirmed")}</span>;
  return <div className="venue-price">
    <strong className="price-amount">{price?.status === "free" ? t("Free entry") : amount ?? t("Current fee unavailable")}</strong>
    <p>{price?.label ?? t("We haven’t verified the current entrance fee.")}</p>
    <span className="price-status">{price?.status === "free" ? t("General entry guidance") : current ? t("Checked") : price?.status === "stale" ? t("Last verified") : t("Last attempted")}{(current ? price?.checkedAt : price?.verifiedAt ?? price?.checkedAt) ? ` ${new Date((current ? price?.checkedAt : price?.verifiedAt ?? price?.checkedAt)!).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Istanbul" })}` : price?.status === "free" ? "" : t(" · Awaiting a source check")}{price?.status === "stale" ? t(" · Recheck needed") : ""}</span>
    {price?.sourceUrl && <a className="price-source" href={price.sourceUrl} target="_blank" rel="noopener noreferrer">{t("Official venue source ")}<ArrowUpRight size={15} /></a>}
  </div>;
}

function TripForm({settings,onSave,onPreview,firstRun,error}: {settings:TripSettings;onSave:(settings:TripSettings)=>void;onPreview:(settings:TripSettings)=>void;firstRun:boolean;error:string}) {
  const [draft,setDraft]=useState<TripSettings>({...settings,startTime:settings.startTime??'09:00',coffeeStops:settings.coffeeStops??false,interests:settings.interests??[],routeMode:settings.routeMode??'keep'});
  const [step,setStep]=useState(0);
  const form=useRef<HTMLFormElement>(null);
  const t=(text:string)=>translate(text,draft.language??'en');
  const interests=[{id:'history',label:'History'},{id:'food',label:'Food'},{id:'views',label:'Views'},{id:'art',label:'Art'},{id:'shopping',label:'Shopping'}] as const;
  return <LanguageProvider language={draft.language??'en'}><form ref={form} className="trip-form" onSubmit={e=>{e.preventDefault();if(firstRun&&step<2){setStep(step+1);return;}firstRun?onPreview(draft):onSave(draft);}}>
    <span className="dialog-icon"><Compass size={24}/></span>
    <h2 id="dialog-title">{firstRun?t('Make Istanbul yours.'):t('Your trip preferences')}</h2>
    <p>{firstRun?t('A few choices, then your first plan.'):t('Save preferences while keeping your stops, visits and memories.')}</p>
    <label htmlFor="trip-language">{t("Language")}</label>
    <select id="trip-language" value={draft.language??'en'} onChange={e=>setDraft({...draft,language:e.target.value as 'en'|'tr'})}><option value="en">{t("English")}</option><option value="tr">{t("Türkçe")}</option></select>
    {firstRun&&<div className="setup-steps" aria-label={t("Setup progress")}>{['Your stay','Your interests','Your pace'].map((label,i)=><span key={t(label)} className={i===step?'active':''}>{i+1}. {t(label)}</span>)}</div>}
    {(!firstRun||step===0)&&<>
      <label htmlFor="start-date">{t("When does your adventure start?")}</label><input id="start-date" type="date" required value={draft.startDate} onChange={e=>setDraft({...draft,startDate:e.target.value})}/>
      <label>{t("How many days?")}</label><div className="day-stepper"><button type="button" aria-label={t("Fewer days")} disabled={draft.days<=1} onClick={()=>setDraft({...draft,days:draft.days-1})}><ChevronLeft size={19}/></button><span><strong>{draft.days}</strong> {t(draft.days===1?'day':'days')}</span><button type="button" aria-label={t("More days")} disabled={draft.days>=7} onClick={()=>setDraft({...draft,days:draft.days+1})}><ChevronRight size={19}/></button></div>
      <label htmlFor="stay-area">{t("Where are you staying?")}</label><div className="select-wrap"><MapPin size={17}/><select id="stay-area" value={draft.stayArea} onChange={e=>setDraft({...draft,stayArea:e.target.value,accommodation:undefined})}>{stayAreas.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><ChevronDown size={16}/></div>
      <details className="more-preferences"><summary>{t("Use an exact hotel or map point")}</summary><AccommodationPicker area={stayAreas.find(a=>a.id===draft.stayArea)??stayAreas[0]} value={draft.accommodation} onChange={value=>setDraft({...draft,accommodation:value})}/></details>
    </>}
    {(!firstRun||step===1)&&<><label>{t("Your interests")}</label><p className="field-hint">{t("Choose what you would love to discover.")}</p><div className="interest-options">{interests.map(interest=><button key={interest.id} type="button" aria-pressed={draft.interests?.includes(interest.id)} className={draft.interests?.includes(interest.id)?'selected':''} onClick={()=>setDraft({...draft,interests:draft.interests?.includes(interest.id)?draft.interests.filter(i=>i!==interest.id):[...(draft.interests??[]),interest.id]})}>{t(interest.label)}</button>)}</div>{!firstRun&&<p className="field-hint">{t("Interest changes shape a new plan. Your existing stops remain yours.")}</p>}</>}
    {(!firstRun||step===2)&&<>
      <label id="pace-label">{t("Your kind of pace")}</label><div className="pace-options" role="group" aria-labelledby="pace-label">{(['relaxed','balanced','packed'] as const).map(pace=><button type="button" key={pace} className={draft.pace===pace?'selected':''} aria-pressed={draft.pace===pace} onClick={()=>setDraft({...draft,pace})}><span>{pace==='relaxed'?'☕':pace==='balanced'?'☀':'↗'}</span><strong>{t(pace[0].toUpperCase()+pace.slice(1))}</strong><small>{t(pace==='relaxed'?'Time to linger':pace==='balanced'?'A little of everything':'See a little more')}</small></button>)}</div>
      <details className="more-preferences"><summary>{t("More preferences")}</summary><label htmlFor="start-time">{t("What time would you like to start each day?")}</label><input id="start-time" type="time" required value={draft.startTime} onChange={e=>setDraft({...draft,startTime:e.target.value})}/><p className="field-hint">{t("All times are local to Istanbul.")}</p><label className="coffee-setting"><input type="checkbox" checked={draft.coffeeStops} onChange={e=>setDraft({...draft,coffeeStops:e.target.checked})}/><Coffee size={23}/><span><strong>{t("Make time for coffee")}</strong><small>{t("New plans include 20-minute breaks. Existing pauses stay as you arranged them.")}</small></span></label><label htmlFor="route-mode">{t("Route order")}</label><select id="route-mode" value={draft.routeMode} onChange={e=>setDraft({...draft,routeMode:e.target.value as 'keep'|'optimize'})}><option value="keep">{t("Keep order")}</option><option value="optimize">{t("Suggest route optimization")}</option></select></details>
    </>}
    {error&&<p className="form-error" role="alert">{t(error)}</p>}
    <div className="settings-actions">{firstRun&&step>0&&<button type="button" className="secondary-button" onClick={()=>setStep(step-1)}>{t("Back")}</button>}<button className="primary-button" type="submit">{t(firstRun?step<2?'Next':'Preview new plan':'Save settings')}<ArrowRight size={17}/></button></div>
    {!firstRun&&<><p className="form-note"><ShieldCheck size={17}/>{t("Saving keeps your route and progress. Create a different itinerary using the separate preview below.")}</p><button className="secondary-button new-plan-button" type="button" onClick={()=>{if(form.current?.reportValidity())onPreview(draft);}}>{t("Preview new plan ")}<Sparkles size={17}/></button></>}
  </form></LanguageProvider>;
}

function AddPlace({
  visitedIds,
  usedIds,
  todayIds,
  weekday,
  onAdd,
}: {
  visitedIds: string[];
  usedIds: string[];
  todayIds: string[];
  weekday: number;
  onAdd: (place: Place, visited: boolean) => void;
}) {
  const t=useTranslation();
  const language=useLanguage();

  const [query, setQuery] = useState("");
  const [visited, setVisited] = useState(false);
  const available = places.filter(
    (p) =>
      !(visited ? [...todayIds,...visitedIds] : usedIds).includes(p.id) &&
      searchText(`${p.name} ${p.district} ${p.category}`).includes(
        searchText(query),
      ),
  );
  return (
    <div className="add-place-dialog">
      <div className="eyebrow">{t("FOLLOW YOUR CURIOSITY")}</div>
      <h2 id="dialog-title">{t("Make room for a detour.")}</h2>
      <p>{t("Found something you love? We’ll fit it into your day.")}</p>
      <div className="search-input">
        <Search size={18} />
        <input
          autoFocus
          placeholder={t("Search places or neighborhoods")}
          aria-label={t("Search places")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <label className="already-visited">
        <input
          type="checkbox"
          checked={visited}
          onChange={(e) => setVisited(e.target.checked)}
        />
        <span>{t("I’ve already visited this place")}</span>
      </label>
      <div className="available-places">
        {available.map((place) => (
          <button
            key={place.id}
            disabled={!visited && place.closedDays?.includes(weekday)}
            onClick={() => onAdd(place, visited)}
          >
            <span
              className="available-icon"
              style={{ background: place.color }}
            >
              {categoryIcon(place.category)}
            </span>
            <span>
              <strong>{translatePlace(place,language)}</strong>
              <small>
                {place.district} · {place.duration}{t(" min")}{place.closedDays?.includes(weekday)
                  ? t(" · Normally closed today")
                  : ""}
              </small>
            </span>
            <Plus size={18} />
          </button>
        ))}
        {!available.length && (
          <div className="empty-state">
            <Search size={24} />
            <h3>{t("No places found")}</h3>
            <p>{t("Try another name. Try marking an early visit to include places planned for another day.")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TransportCard({
  selectedMode,
  onChoose,
  place,
  recommendation,
  onDetails,
  onGuide,
}: {
  selectedMode?: TransportMode;
  onChoose: (mode:TransportMode)=>void;
  place: Place;
  recommendation: ReturnType<typeof getTransport>;
  onDetails: (option: TransportOption) => void;
  onGuide: () => void;
}) {
  const t=useTranslation();
  const language=useLanguage();

  const options = [recommendation.recommended, ...recommendation.alternatives];
  const choice = Math.max(0, options.findIndex(o => o.mode === selectedMode));
  const option = options[choice];
  return (
    <section className="transport-card">
      <div className="section-heading">
        <span className="eyebrow">{t("YOUR NEXT LITTLE JOURNEY")}</span>
        <Navigation size={17} />
      </div>
      <h3>{t("On to ")}{translatePlace(place,language)}</h3>
      <div className="transport-options">
        {options.map((o, i) => (
          <button
            key={o.mode + i}
            className={choice === i ? "selected" : ""}
            aria-pressed={choice === i}
            onClick={() => onChoose(o.mode)}
          >
            {modeIcon(o.mode, 14)}
            {o.mode === "marmaray"
              ? t("Marmaray")
              : o.mode[0].toUpperCase() + o.mode.slice(1)}
          </button>
        ))}
      </div>
      <div className="transport-main">
        <span className="transport-mode-icon">{modeIcon(option.mode, 25)}</span>
        <div>
          <strong>{t(option.title)}</strong>
          <span>
            {choice === 0 ? (
              <>
                <span className="recommended-dot" />{t("Our recommendation")}</>
            ) : (
              t("An alternative way")
            )}
          </span>
        </div>
      </div>
      <div className="transport-metrics">
        <span>
          <Clock3 size={15} />
          <strong>~{option.duration}{t(" min")}</strong>
        </span>
        <span>
          <Wallet size={15} />
          <strong>{t(money(option.price.min, option.price.max))}</strong>
          <small>{option.mode === "taxi" ? t(" / car") : t(" / person")}</small>
        </span>
      </div>
      <div className="next-walking"><Footprints size={22} /><span><strong>{(option.walkingKm ?? 0).toFixed(1)}{t(" km walking")}</strong><small>~{option.walkingMinutes ?? 0}{t(" min")}{option.mode === "walk" ? t(" to this stop") : t(" to / from stations or piers")}</small></span></div>
      <p className="transport-note">{t(option.note)}</p>
      <button className="transport-details" onClick={() => onDetails(option)}>{t("See the way there ")}<ArrowRight size={16} />
      </button>
      {option.mode !== "walk" && option.mode !== "taxi" && (
        <button className="text-button card-help" onClick={onGuide}>
          <Ticket size={14} />{t("How to pay with Istanbulkart")}</button>
      )}
      <small className="estimate-note">{t("Approximate time & fare. Not a live quote.")}</small>
    </section>
  );
}

function PlaceDetails({
  place,
  venueInfo,
  origin,
  selectedTransport,
  onMarkVisited,
  isInToday,
}: {
  place: Place;
  venueInfo?: VenueInfo;
  origin: Coordinate;
  selectedTransport: TransportOption | null;
  onMarkVisited: () => void;
  isInToday: boolean;
}) {
  const t=useTranslation();
  const language=useLanguage();

  const option = selectedTransport ?? getTransport(origin, place).recommended;
  return (
    <div className="place-details">
      <div
        className="detail-art"
        style={{ "--place-color": place.color } as React.CSSProperties}
      >
        <PlacePhoto place={place} photo={venueInfo?.photo} loading="eager" />
        <span>{place.district}</span>
      </div>
      <div className="detail-photo-credit"><PlacePhoto place={place} photo={venueInfo?.photo} className="credit-only-photo" showCredit /></div>
      <div className="eyebrow">
        {place.category.toUpperCase()} ·{" "}
        {place.side === "asia" ? t("ASIAN SIDE") : t("EUROPEAN SIDE")}
      </div>
      <h2 id="dialog-title">{translatePlace(place,language)}</h2>
      <p>{getPlaceText(place,"description",language)}</p>
      <VenuePriceLabel info={venueInfo} />
      <p className="price-update-note">{t("Ticket information includes its source and last verification date. Saved previews do not update prices automatically. Special exhibitions and extras may cost more.")}</p>
      <div className="detail-facts">
        <span>
          <Clock3 size={18} />
          <strong>{place.duration}{t(" min")}</strong>
          <small>{t("Take your time")}</small>
        </span>
        <span>
          <Ticket size={18} />
          <strong>{getPlaceText(place,"entry",language)}</strong>
          <small>{t("Entry guidance")}</small>
        </span>
      </div>
      <div className="insider-tip">
        <Sparkles size={18} />
        <div>
          <strong>{t("A little local wisdom")}</strong>
          <p>{getPlaceText(place,"tip",language)}</p>
          <small>{t("Best time: ")}{getPlaceText(place,"bestTime",language)}</small>
        </div>
      </div>
      <h3 className="detail-way">{t("Getting there")}</h3>
      <div className="detail-transport-heading">
        {modeIcon(option.mode)}
        <strong>{t(option.title)}</strong>
        <span>~{option.duration}{t(" min")}</span>
      </div>
      <ol className="direction-steps">
        {option.steps.map((step, i) => (
          <li key={i}>
            <span>{i + 1}</span>
            <p>{t(step)}</p>
          </li>
        ))}
      </ol>
      <p className="estimate-note">{t("Route guidance is approximate; station signs and service notices take priority. This is not turn-by-turn navigation.")}</p>
      <a className="maps-button" href={getDirectionsUrl(origin, place.coordinate, option.mode === "walk" ? "walking" : option.mode === "taxi" ? "driving" : "transit")} target="_blank" rel="noopener noreferrer"><Navigation size={19} />{t(" Directions in Google Maps ")}<ArrowUpRight size={16} /></a>
      <button className="primary-button" onClick={onMarkVisited}>
        <Check size={17} />
        {isInToday ? t("I’ve explored this place") : t("Add as visited")}
      </button>
    </div>
  );
}

function LiveBusCard() {
  const t=useTranslation();

  const [open, setOpen] = useState(false);
  const [stopId, setStopId] = useState("");
  const [state, setState] = useState<Awaited<ReturnType<typeof fetchArrivals>>>(
    { status: "unconfigured", arrivals: [] },
  );
  const [now, setNow] = useState(Date.now());
  const [lastFetchedAt, setLastFetchedAt] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (
      state.status === "available" &&
      (now - lastFetchedAt > 180000 ||
        state.arrivals.some((a) => now - Date.parse(a.updatedAt) > 180000))
    ) {
      setState({
        status: "error",
        arrivals: [],
        message:
          "These predictions have expired. Check again for fresh arrivals.",
      });
    }
  }, [now, state, lastFetchedAt]);
  async function refresh() {
    controller.current?.abort();
    controller.current = new AbortController();
    setState({ status: "loading", arrivals: [] });
    const signal = controller.current.signal;
    const result = await fetchArrivals(stopId.trim(), signal);
    if (!signal.aborted) {
      setLastFetchedAt(Date.now());
      setNow(Date.now());
      setState(result);
    }
  }
  return (
    <section className="live-bus-card">
      <button
        className="bus-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="bus-icon">
          <Bus size={18} />
        </span>
        <span>
          <strong>{t("At the bus stop?")}</strong>
          <small>
            {hasLiveTransit()
              ? t("Check live arrivals")
              : t("Live arrivals unavailable")}
          </small>
        </span>
        <ChevronDown size={16} className={open ? "rotate" : ""} />
      </button>
      {open && (
        <div className="bus-content">
          {!hasLiveTransit() ? (
            <p>{t("Live bus predictions aren’t available in this version. For a more predictable journey, choose the suggested rail or ferry route. We’ll never show a made-up countdown.")}</p>
          ) : (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  refresh();
                }}
              >
                <label htmlFor="bus-stop">{t("Stop code (on the bus stop sign)")}</label>
                <div>
                  <input
                    id="bus-stop"
                    required
                    maxLength={40}
                    placeholder={t("e.g. 110001")}
                    value={stopId}
                    onChange={(e) => {
                      controller.current?.abort();
                      setStopId(e.target.value);
                      setState({ status: "unconfigured", arrivals: [] });
                    }}
                  />
                  <button
                    className="primary-button"
                    disabled={state.status === "loading"}
                  >{t("Check")}</button>
                </div>
              </form>
              <div role="status">
                {state.status === "loading" ? (
                  <p>{t("Checking this stop…")}</p>
                ) : state.status === "error" ? (
                  <p>
                    {state.message ??
                      t("Arrivals are unavailable right now. Please try again.")}
                  </p>
                ) : (
                  state.status === "available" &&
                  (!state.arrivals.length ? (
                    <p>{t("No upcoming arrivals reported for this stop.")}</p>
                  ) : (
                    state.arrivals.map((a, i) => (
                      <div className="arrival" key={a.line + i}>
                        <strong>{a.line}</strong>
                        <span>{a.destination}</span>
                        <b>
                          {Math.max(
                            0,
                            a.minutes -
                              Math.floor(
                                Math.max(0, now - Date.parse(a.updatedAt)) /
                                  60000,
                              ),
                          ) === 0
                            ? t("Due")
                            : `${Math.max(0, a.minutes - Math.floor(Math.max(0, now - Date.parse(a.updatedAt)) / 60000))} min`}
                        </b>
                      </div>
                    ))
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function GuideView({
  offlineStatus,
  onPrepareOffline,
  installPrompt,
  onInstall,
}: {
  offlineStatus: OfflineStatus;
  onPrepareOffline: () => Promise<void>;
  installPrompt: Event | null;
  onInstall: () => void;
}) {
  const t=useTranslation();

  const [expanded, setExpanded] = useState<string | null>(
    guideSections[0]?.id ?? null,
  );
  return (
    <section className="guide-view">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{t("A LITTLE KNOW-HOW GOES A LONG WAY")}</span>
          <h2>{t("Your pocket guide to Istanbul")}</h2>
          <p>{t("From your first tap at the turnstile to the last ferry home.")}</p>
        </div>
        <Ticket size={27} />
      </div>
      <div className="guide-grid">
        <div className="guide-articles">
          {guideSections.map((guide, i) => (
            <article
              className={`guide-article ${expanded === guide.id ? "expanded" : ""}`}
              key={guide.id}
            >
              <button
                className="guide-toggle"
                aria-expanded={expanded === guide.id}
                aria-controls={`guide-${guide.id}`}
                onClick={() =>
                  setExpanded(expanded === guide.id ? null : guide.id)
                }
              >
                <span className="guide-icon">
                  {i === 0 ? (
                    <Ticket size={22} />
                  ) : i === 1 ? (
                    <TrainFront size={22} />
                  ) : i === 2 ? (
                    <Navigation size={22} />
                  ) : (
                    <ShieldCheck size={22} />
                  )}
                </span>
                <span>
                  <h3>{t(guide.title)}</h3>
                  <p>{t(guide.subtitle)}</p>
                </span>
                <ChevronDown size={19} />
              </button>
              {expanded === guide.id && (
                <div id={`guide-${guide.id}`} className="guide-body">
                  <ol>
                    {guide.steps.map((step, index) => (
                      <li key={index}>
                        <span>{index + 1}</span>
                        <p>{t(step)}</p>
                      </li>
                    ))}
                  </ol>
                  {guide.tips.map((tip, index) => (
                    <div className="guide-tip" key={index}>
                      <Info size={15} />
                      <p>{t(tip)}</p>
                    </div>
                  ))}
                  <a
                    href={guide.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >{t("Official operator: ")}{guide.sourceLabel}
                    <ArrowUpRight size={14} />
                  </a>
                </div>
              )}
            </article>
          ))}
        </div>
        <aside className="guide-aside">
          <div className="emergency-card">
            <ShieldCheck size={27} />
            <h3>{t("Just in case.")}</h3>
            <p>{t("Call ")}<strong>112</strong>{t(" for emergency assistance in Türkiye. Ask for an English-speaking operator.")}</p>
            <a href="tel:112">{t("Call 112 ")}<ArrowUpRight size={15} />
            </a>
          </div>
          <div className="local-tips">
            <span className="eyebrow">{t("GOOD TO KNOW")}</span>
            {travelTips.map((tip, i) => (
              <div key={i}>
                <h4>{t(tip.title)}</h4>
                <p>{t(tip.body)}</p>
              </div>
            ))}
          </div>
          <div className="install-card">
            <Compass size={25} />
            <h3>{t("Your buddy, in your pocket.")}</h3>
            <p>{t("Keep an offline copy of your itinerary, guide and venue photos. Maps, address search and fresh data still need a connection.")}</p>
            <p className="offline-status" role="status">{offlineStatus.status === "ready" ? t("Offline ready") : offlineStatus.status === "preview" ? t("Offline preview · app and photos included") : offlineStatus.message}</p>
            {offlineStatus.status !== "ready" && offlineStatus.status !== "preview" && offlineStatus.status !== "unsupported" && <button className="secondary-button" disabled={offlineStatus.status === "preparing"} onClick={onPrepareOffline}>{offlineStatus.status === "preparing" ? t("Downloading…") : t("Prepare offline")}</button>}
            {offlineStatus.status === "preview" ? <small>{t("Browser installation is available in the hosted app.")}</small> : installPrompt ? (
              <button className="secondary-button" onClick={onInstall}>{t("Install TravelBuddy ")}<ArrowDown size={15} />
              </button>
            ) : (
              <small>{t("iPhone: Share → Add to Home Screen.")}<br />{t("Android: browser menu → Install app.")}</small>
            )}
            <small>{t("Maps, current data and fresh location fixes may need a connection.")}</small>
          </div>
        </aside>
      </div>
      <p className="guide-disclaimer">{t("This guide helps you plan. Fare ranges are estimates, not verified current tariffs. Opening hours, closures and ticket rules may change.")}</p>
    </section>
  );
}

export default App;

function CoffeeSuggestions({from,to,onSelect}:{from:Coordinate;to:Coordinate;onSelect:(cafe:Cafe)=>void}) {
  const t=useTranslation();
  const options=getCoffeeSuggestions(from,to,3);
  return <div className="coffee-suggestions"><strong>{t('Coffee along the way')}</strong>{options.length?options.map(({cafe,extraMinutes})=><div key={cafe.id}><span><strong>{cafe.name}</strong><small>~{extraMinutes} {t('min off the route · walking estimate')}</small></span><button onClick={()=>onSelect(cafe)}>{t('Choose')}</button><a href={getDirectionsUrl(from,cafe.coordinate,'walking')} target="_blank" rel="noopener noreferrer">{t('Directions')}<ArrowUpRight size={14}/></a></div>):<p>{t('No curated coffee stop near this walking leg. Use Nearby on the map for other options.')}</p>}</div>;
}
