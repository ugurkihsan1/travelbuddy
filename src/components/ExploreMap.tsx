import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Coffee, MapPin, Plus, X, ExternalLink, Maximize2, WifiOff } from 'lucide-react';
import { findPlace } from '../data/places';
import { cafes, type Cafe } from '../data/amenities';
import { discoveryOrigin, getCoffeeSuggestions, getNearbyDiscoveries, isIstanbulCoordinate, type Discovery, type DiscoveryFilter } from '../lib/discovery';
import type { Coordinate, Place, TripDay } from '../types';
import { getPlaceText, translatePlace, useLanguage, useTranslation } from '../lib/i18n';

type Props = {
  day: TripDay;
  origin: Coordinate;
  currentLocation: Coordinate | null;
  onSelectPlace: (place: Place) => void;
  onAddPlace: (place: Place) => void;
  onCoffee: (cafe: Cafe) => void;
};

const filters: { id: DiscoveryFilter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'cafe', label: 'Cafés' }, { id: 'food', label: 'Food' },
  { id: 'museum', label: 'Museums' }, { id: 'views', label: 'Views' }, { id: 'free', label: 'Free' },
];

const pillStyle = (active: boolean): React.CSSProperties => ({
  padding: '9px 13px', minHeight: 42, borderRadius: 22, background: active ? '#225bdd' : '#f2f5fa',
  color: active ? '#fff' : '#536176', fontWeight: active ? 700 : 550, fontSize: 13, whiteSpace: 'nowrap',
});

export function ExploreMap({ day, origin, currentLocation, onSelectPlace, onAddPlace, onCoffee }: Props) {
  const t = useTranslation();
  const language = useLanguage();
  const [mode, setMode] = useState<'route' | 'nearby'>('route');
  const [filter, setFilter] = useState<DiscoveryFilter>('all');
  const [selected, setSelected] = useState<Discovery | null>(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const element = useRef<HTMLDivElement>(null);
  const instance = useRef<L.Map | null>(null);
  const layers = useRef<L.LayerGroup | null>(null);
  const base = discoveryOrigin(currentLocation, origin);
  const validGps = isIstanbulCoordinate(currentLocation);
  const routePlaces = useMemo(() => day.stops.filter(stop => stop.status !== 'skipped').map(stop => findPlace(stop.placeId)).filter((place): place is Place => !!place), [day.stops]);
  const visible = useMemo<Discovery[]>(() => {
    if (mode === 'nearby') return getNearbyDiscoveries(base, filter, 3);
    const places: Discovery[] = routePlaces.map(item => ({ kind: 'place', item, distanceKm: 0 }));
    const breaks = new Map<string, Cafe>();
    for (const pause of day.coffeeBreaks ?? []) {
      if (!routePlaces.some(place => place.id === pause.afterPlaceId)) continue;
      const savedCafe = cafes.find(cafe => cafe.id === pause.cafeId);
      if (savedCafe) breaks.set(savedCafe.id, savedCafe);
    }
    let previous = origin;
    for (const place of routePlaces) {
      for (const suggestion of getCoffeeSuggestions(previous, place.coordinate, 3)) breaks.set(suggestion.cafe.id, suggestion.cafe);
      previous = place.coordinate;
    }
    return [...places, ...[...breaks.values()].map(item => ({ kind: 'cafe' as const, item, distanceKm: 0 }))];
  }, [mode, filter, base.lat, base.lng, routePlaces, origin.lat, origin.lng, day.coffeeBreaks]);

  useEffect(() => {
    if (!element.current) return;
    const map = L.map(element.current, { zoomControl: false, scrollWheelZoom: false }).setView([origin.lat, origin.lng], 13);
    L.imageOverlay('/istanbul-map.svg', [[40.94, 28.86], [41.15, 29.16]], { interactive: false }).addTo(map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>', maxZoom: 19,
    }).on('tileerror', () => setOffline(true)).on('tileload', () => setOffline(false)).addTo(map);
    instance.current = map;
    layers.current = L.layerGroup().addTo(map);
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(element.current);
    return () => { resize.disconnect(); map.remove(); instance.current = null; layers.current = null; };
  }, []);

  useEffect(() => {
    if (!instance.current) return;
    const zoom = L.control.zoom({ position: 'bottomright', zoomInTitle: t('Zoom in'), zoomOutTitle: t('Zoom out') }).addTo(instance.current);
    return () => { zoom.remove(); };
  }, [t]);

  function fitMap() {
    const points: L.LatLngTuple[] = visible.map(discovery => [discovery.item.coordinate.lat, discovery.item.coordinate.lng]);
    const anchor = mode === 'nearby' ? base : origin;
    points.push([anchor.lat, anchor.lng]);
    if (validGps && currentLocation) points.push([currentLocation.lat, currentLocation.lng]);
    instance.current?.fitBounds(L.latLngBounds(points), { padding: [35, 35], maxZoom: mode === 'nearby' ? 15 : 14, animate: false });
  }

  useEffect(() => {
    const group = layers.current;
    if (!group || !instance.current) return;
    group.clearLayers();
    L.marker([origin.lat, origin.lng], { icon: L.divIcon({ className: 'origin-marker', html: '<span>⌂</span>', iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(group).bindTooltip(t('Your stay / starting point'));
    for (const discovery of visible) {
      const { item } = discovery;
      const routeIndex = routePlaces.findIndex(place => place.id === item.id);
      const isCoffee = discovery.kind === 'cafe';
      const label = isCoffee ? (item.category === 'food' ? '✦' : '☕') : routeIndex >= 0 ? String(routeIndex + 1) : '●';
      const background = isCoffee ? '#b77a43' : filter === 'free' ? '#168b73' : '#225bdd';
      const marker = L.marker([item.coordinate.lat, item.coordinate.lng], {
        icon: L.divIcon({ className: 'explore-marker', html: `<span style="display:grid;place-items:center;width:32px;height:32px;border:3px solid white;border-radius:50%;background:${background};color:white;font-weight:750;font-size:14px;box-shadow:0 2px 9px #102c4b38">${label}</span>`, iconSize: [32, 32], iconAnchor: [16, 16] }),
      }).addTo(group);
      const name = discovery.kind === 'place' ? translatePlace(discovery.item, language) : t(item.name);
      const tooltip = document.createElement('span'); tooltip.textContent = name;
      marker.bindTooltip(tooltip).on('click', () => setSelected(discovery));
      marker.getElement()?.setAttribute('aria-label', `${t('View details')}: ${name}`);
      marker.getElement()?.setAttribute('role', 'button');
    }
    if (mode === 'route') {
      const pendingPlaces = day.stops.filter(stop => stop.status === 'pending').map(stop => findPlace(stop.placeId)).filter((place): place is Place => !!place);
      const start = validGps && currentLocation ? currentLocation : origin;
      const points: L.LatLngTuple[] = [[start.lat, start.lng], ...pendingPlaces.map(place => [place.coordinate.lat, place.coordinate.lng] as L.LatLngTuple)];
      if (points.length > 1) L.polyline(points, { color: '#225bdd', weight: 3, dashArray: '6 8', opacity: 0.6 }).addTo(group);
    }
    if (validGps && currentLocation) L.circleMarker([currentLocation.lat, currentLocation.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#3b82f6', fillOpacity: 1 }).addTo(group).bindTooltip(t('Your location'));
    fitMap();
  }, [visible, mode, filter, day.stops, origin.lat, origin.lng, currentLocation?.lat, currentLocation?.lng, language, t]);

  const inDay = selected?.kind === 'place' && day.stops.some(stop => stop.placeId === selected.item.id && stop.status !== 'skipped');

  return (
    <section className="map-card explore-map" aria-label={t('Explore Istanbul map')}>
      <div className="section-heading map-heading"><div><span className="eyebrow">{t('A LITTLE ROOM TO DISCOVER')}</span><h2>{t('Your day, mapped out')}</h2></div><MapPin size={20} /></div>
      <div style={{ padding: '0 20px 14px', display: 'flex', gap: 8 }} role="group" aria-label={t('Map mode')}>
        <button type="button" style={pillStyle(mode === 'route')} aria-pressed={mode === 'route'} onClick={() => { setMode('route'); setSelected(null); }}>{t('My route')}</button>
        <button type="button" style={pillStyle(mode === 'nearby')} aria-pressed={mode === 'nearby'} onClick={() => { setMode('nearby'); setSelected(null); }}>{t('Nearby')}</button>
      </div>
      {mode === 'nearby' && <div style={{ padding: '0 20px 14px', display: 'flex', flexWrap: 'wrap', gap: 6 }} role="group" aria-label={t('Nearby category filters')}>
        {filters.map(option => <button type="button" key={option.id} style={pillStyle(filter === option.id)} aria-pressed={filter === option.id} onClick={() => { setFilter(option.id); setSelected(null); }}>{t(option.label)}</button>)}
      </div>}
      <div className="map-container" style={{ minHeight: 320 }}>
        <div ref={element} className="leaflet-map" aria-label={t(mode === 'route' ? 'Daily route with curated coffee stops' : 'Nearby places and curated cafés')} />
        {offline && <div className="map-offline"><WifiOff size={14} /> {t('Offline schematic · real pins, approximate coastline')}</div>}
        <button className="map-fit icon-button" type="button" aria-label={t('Fit visible places on map')} onClick={fitMap}><Maximize2 size={16} /></button>
        <div className="map-legend" style={{ maxWidth: 'calc(100% - 60px)', fontSize: 11 }}><span className="legend-dot" /> {t(mode === 'route' ? 'Stop order, not walking paths' : 'Within 3 km · straight-line distance')}</div>
      </div>
      {selected && <div className="explore-selection" style={{ padding: 18, borderTop: '1px solid #e7edf5', background: '#fff' }} aria-live="polite">
        <div style={{ display: 'flex', alignItems: 'start', gap: 12 }}><div style={{ flex: 1 }}><span className="eyebrow">{(selected.kind === 'cafe' ? t(selected.item.category === 'food' ? 'FOOD & A PAUSE' : 'COFFEE BREAK') : t(selected.item.category)).toLocaleUpperCase(language === 'tr' ? 'tr-TR' : 'en-GB')}</span><h3 style={{ fontSize: 20, marginTop: 5 }}>{selected.kind === 'place' ? translatePlace(selected.item, language) : t(selected.item.name)}</h3><p style={{ color: '#708096', fontSize: 13, marginTop: 5 }}>{selected.item.district}{mode === 'nearby' ? ` · ~${selected.distanceKm < 1 ? Math.round(selected.distanceKm * 1000) + ' m' : selected.distanceKm.toLocaleString(language === 'tr' ? 'tr-TR' : 'en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km'} ${t('away, straight-line')}` : ''}</p></div><button className="icon-button" type="button" aria-label={t('Close map place card')} onClick={() => setSelected(null)}><X size={17} /></button></div>
        <p style={{ fontSize: 14, marginTop: 10 }}>{selected.kind === 'place' ? getPlaceText(selected.item, 'description', language) : t(selected.item.description)}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 15 }}>
          {selected.kind === 'place' ? <>
            <button type="button" style={pillStyle(true)} disabled={inDay} onClick={() => { onAddPlace(selected.item); setSelected(null); }}><span style={{ display: 'flex', gap: 7, alignItems: 'center' }}><Plus size={16} />{t(inDay ? 'In your day' : 'Add to today')}</span></button>
            <button type="button" style={pillStyle(false)} onClick={() => onSelectPlace(selected.item)}>{t('Details')}</button>
          </> : <>
            <button type="button" style={pillStyle(true)} onClick={() => { onCoffee(selected.item); setSelected(null); }}><span style={{ display: 'flex', gap: 7, alignItems: 'center' }}><Coffee size={16} />{t('Add coffee break')}</span></button>
            <a href={selected.item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', gap: 5, fontSize: 13 }}>{t('Venue website')} <ExternalLink size={13} /></a>
          </>}
        </div>
      </div>}
      <p className="map-footnote">{mode === 'nearby' ? t('{count} curated suggestions near {location}.').replace('{count}', String(visible.length)).replace('{location}', t(validGps ? 'your location' : 'your stay')) : t('Tap a numbered place or a coffee pin to explore.')} {t('Café pins are approximate; opening hours and menus can change.')}</p>
      {mode === 'nearby' && visible.length === 0 && <p className="map-footnote">{t('No curated matches within 3 km. Try another category.')}</p>}
    </section>
  );
}
