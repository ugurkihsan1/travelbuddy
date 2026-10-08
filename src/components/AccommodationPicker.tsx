import { useEffect, useId, useRef, useState } from 'react';
import L from 'leaflet';
import { Check, MapPin, Search, X } from 'lucide-react';
import type { Coordinate, StayArea } from '../types';
import { hasAddressSearch, searchAccommodation } from '../lib/geocoding';
import type { AccommodationResult } from '../lib/geocoding';
import { useTranslation } from '../lib/i18n';
import './AccommodationPicker.css';

type Props = {
  value?: { label: string; coordinate: Coordinate };
  onChange: (value?: { label: string; coordinate: Coordinate }) => void;
  area: StayArea;
};

const inIstanbul = (point: Coordinate) => Number.isFinite(point.lat) && Number.isFinite(point.lng)
  && point.lat >= 40.75 && point.lat <= 41.4 && point.lng >= 28.4 && point.lng <= 29.5;
const parseCoordinate = (text: string) => text.trim() ? Number(text.trim().replace(',', '.')) : NaN;

/** Exact accommodation is optional; the selected district remains the fallback. */
export function AccommodationPicker({ value, onChange, area }: Props) {
  const t = useTranslation();
  const id = useId();
  const initialPoint = value?.coordinate ?? area.coordinate;
  const [query, setQuery] = useState('');
  const [label, setLabel] = useState(value?.label ?? '');
  const [latitude, setLatitude] = useState(initialPoint.lat.toFixed(6));
  const [longitude, setLongitude] = useState(initialPoint.lng.toFixed(6));
  const [pin, setPin] = useState<Coordinate | null>(value?.coordinate ?? null);
  const [hasDraftPoint, setHasDraftPoint] = useState(!!value);
  const [results, setResults] = useState<AccommodationResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState('');
  const [mapUnavailable, setMapUnavailable] = useState(!navigator.onLine);
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const request = useRef<AbortController | null>(null);
  const initialCenter = useRef(initialPoint);
  const addressSearch = hasAddressSearch();

  function choosePoint(point: Coordinate) {
    if (!inIstanbul(point)) { setMessage('Choose a stay location within Istanbul.'); return; }
    setPin(point); setHasDraftPoint(true);
    setLatitude(point.lat.toFixed(6)); setLongitude(point.lng.toFixed(6));
    setMessage('Point selected. Save this stay location below.');
  }
  const choosePointRef = useRef(choosePoint);
  choosePointRef.current = choosePoint;

  useEffect(() => {
    const point = value?.coordinate ?? area.coordinate;
    setLabel(value?.label ?? ''); setPin(value?.coordinate ?? null); setHasDraftPoint(!!value);
    setLatitude(point.lat.toFixed(6)); setLongitude(point.lng.toFixed(6));
    map.current?.setView([point.lat, point.lng], value ? 16 : 14, { animate: false });
  }, [value?.label, value?.coordinate.lat, value?.coordinate.lng, area.id, area.coordinate.lat, area.coordinate.lng]);

  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current, { scrollWheelZoom: false, zoomControl: false,
      maxBounds: [[40.75, 28.4], [41.4, 29.5]], maxBoundsViscosity: 0.8,
    }).setView([initialCenter.current.lat, initialCenter.current.lng], 14);
    L.imageOverlay('/istanbul-map.svg', [[40.94, 28.86], [41.15, 29.16]], { interactive: false }).addTo(instance);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
      maxZoom: 19,
    }).on('tileerror', () => setMapUnavailable(true)).on('tileload', () => setMapUnavailable(false)).addTo(instance);
    instance.on('click', (event: L.LeafletMouseEvent) => choosePointRef.current({ lat: event.latlng.lat, lng: event.latlng.lng }));
    map.current = instance;
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(element.current);
    return () => { observer.disconnect(); instance.remove(); map.current = null; marker.current = null; };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    const zoom = L.control.zoom({ position: 'bottomright', zoomInTitle: t('Zoom in'), zoomOutTitle: t('Zoom out') }).addTo(map.current);
    return () => { zoom.remove(); };
  }, [t]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    marker.current?.remove(); marker.current = null;
    if (pin) {
      const next = L.marker([pin.lat, pin.lng], {
        draggable: true,
        title: t('Your selected stay location'),
        icon: L.divIcon({ className: 'accommodation-pin', html: '<span aria-hidden="true">●</span>',
          iconSize: [30, 30], iconAnchor: [15, 15] }),
      }).addTo(instance).bindTooltip(t('Your selected stay location'));
      next.on('dragend', () => {
        const point = next.getLatLng();
        const coordinate = { lat: point.lat, lng: point.lng };
        if (!inIstanbul(coordinate)) next.setLatLng([pin.lat, pin.lng]);
        choosePointRef.current(coordinate);
      });
      marker.current = next;
    }
  }, [pin, t]);

  useEffect(() => () => request.current?.abort(), []);

  async function search() {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setSearching(true); setResults([]); setMessage('Searching Istanbul addresses…');
    try {
      const result = await searchAccommodation(query, controller.signal);
      if (controller.signal.aborted) return;
      setResults(result.results);
      setMessage(result.message ?? (result.results.length ? 'Choose the matching hotel or address below.' : 'No matching addresses found. Try the full address, or select a map point.'));
    } finally { if (!controller.signal.aborted) setSearching(false); }
  }

  function chooseResult(result: AccommodationResult) {
    setLabel(result.label); choosePoint(result.coordinate); setResults([]);
    map.current?.setView([result.coordinate.lat, result.coordinate.lng], 16, { animate: false });
  }
  function savePoint() {
    const point = { lat: parseCoordinate(latitude), lng: parseCoordinate(longitude) };
    if (!inIstanbul(point)) { setMessage('Enter a valid Istanbul latitude (40.75–41.4) and longitude (28.4–29.5).'); return; }
    const stayLabel = label.trim().slice(0, 200) || t('Selected stay location');
    onChange({ label: stayLabel, coordinate: point }); setLabel(stayLabel); setPin(point);
    map.current?.setView([point.lat, point.lng], 16, { animate: false });
    setMessage('Exact stay location saved. Your route will start here.');
  }
  function clear() {
    request.current?.abort(); setSearching(false); setResults([]); setQuery(''); setLabel('');
    setPin(null); setHasDraftPoint(false); setLatitude(area.coordinate.lat.toFixed(6)); setLongitude(area.coordinate.lng.toFixed(6));
    onChange(undefined); map.current?.setView([area.coordinate.lat, area.coordinate.lng], 14, { animate: false });
    setMessage('Using the selected district as your starting point.');
  }
  function handlePointKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') { event.preventDefault(); if (hasDraftPoint) savePoint(); }
  }

  return <fieldset className="accommodation-picker">
    <legend><MapPin size={16}/>{t('Your exact stay location')} <span>{t('Optional')}</span></legend>
    <p className="accommodation-intro">{t('Find your hotel or select its location to start the route at your door.')}</p>
    <label htmlFor={`${id}-search`}>{t('Hotel name or full address')}</label>
    <div className="accommodation-search">
      <input id={`${id}-search`} type="search" value={query} maxLength={200} disabled={!addressSearch}
        placeholder={t('e.g. hotel name, street and district')}
        onChange={event => { request.current?.abort(); setSearching(false); setQuery(event.target.value); setResults([]); setMessage(''); }}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (addressSearch && !searching) void search(); } }}/>
      <button type="button" disabled={!addressSearch || searching || query.trim().length < 3} onClick={() => void search()}><Search size={15}/>{t(searching ? 'Searching…' : 'Search')}</button>
    </div>
    {!addressSearch && <p className="accommodation-help">{t('Address search needs the online app. Select a point on the map or enter coordinates.')}</p>}
    {!!results.length && <ul className="accommodation-results">{results.map((result, index) => <li key={`${result.coordinate.lat}-${result.coordinate.lng}-${index}`}><button type="button" onClick={() => chooseResult(result)}><MapPin size={15}/><span>{result.label}</span></button></li>)}</ul>}
    <div className="accommodation-map-wrap"><div ref={element} className="accommodation-map" aria-label={t('Select your stay location on the map')}/>
      {mapUnavailable && <p className="accommodation-map-note">{t('Street map unavailable. Coordinates and the schematic still work.')}</p>}
    </div>
    <div className="accommodation-map-actions"><span>{t('Click the map, or drag the pin.')}</span><button type="button" onClick={() => { const point = map.current?.getCenter(); if (point) choosePoint({ lat: point.lat, lng: point.lng }); }}>{t('Use map center')}</button></div>
    <label htmlFor={`${id}-label`}>{t('Name or address for this point')}</label>
    <input id={`${id}-label`} value={label} maxLength={200} placeholder={t('Your hotel or accommodation')} onChange={event => setLabel(event.target.value)} onKeyDown={handlePointKey}/>
    <details className="accommodation-coordinates"><summary>{t('Enter coordinates')}</summary><div>
      <label htmlFor={`${id}-latitude`}>{t('Latitude')}<input id={`${id}-latitude`} inputMode="decimal" value={latitude} onChange={event => { setLatitude(event.target.value); setHasDraftPoint(true); }} onKeyDown={handlePointKey}/></label>
      <label htmlFor={`${id}-longitude`}>{t('Longitude')}<input id={`${id}-longitude`} inputMode="decimal" value={longitude} onChange={event => { setLongitude(event.target.value); setHasDraftPoint(true); }} onKeyDown={handlePointKey}/></label>
    </div><p>{t('Latitude')} 40.75–41.4 · {t('Longitude')} 28.4–29.5</p></details>
    <div className="accommodation-save"><button type="button" className="accommodation-use" disabled={!hasDraftPoint} onClick={savePoint}><Check size={15}/>{t('Use this stay location')}</button>{(value || hasDraftPoint) && <button type="button" className="accommodation-clear" onClick={clear}><X size={14}/>{t('Clear')}</button>}</div>
    {value && <p className="accommodation-saved"><Check size={14}/><span>{t('Saved:')} {value.label}</span></p>}
    {message && <p className="accommodation-message" role="status">{t(message)}</p>}
    {addressSearch && <small className="accommodation-attribution">{t('Address search:')} © {t('OpenStreetMap contributors')} · Nominatim</small>}
  </fieldset>;
}
