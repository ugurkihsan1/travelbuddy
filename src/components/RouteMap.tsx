import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { Coordinate, Place, PlannedStop } from "../types";
import { findPlace } from "../data/places";
import { LocateFixed, MapPin, Maximize2, WifiOff } from "lucide-react";

type Props = {
  stops: PlannedStop[];
  origin: Coordinate;
  currentLocation: Coordinate | null;
  onSelect: (place: Place) => void;
};

export function RouteMap({ stops, origin, currentLocation, onSelect }: Props) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current, {
      zoomControl: false,
      scrollWheelZoom: false,
      attributionControl: true,
    }).setView([41.015, 28.98], 13);
    L.control.zoom({ position: "bottomright" }).addTo(instance);
    L.imageOverlay(
      "/istanbul-map.svg",
      [
        [40.94, 28.86],
        [41.15, 29.16],
      ],
      { interactive: false, opacity: 1 },
    ).addTo(instance);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
      maxZoom: 19,
    })
      .on("tileerror", () => setOffline(true))
      .on("tileload", () => setOffline(false))
      .addTo(instance);
    map.current = instance;
    layer.current = L.layerGroup().addTo(instance);
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    const group = layer.current;
    if (!instance || !group) return;
    group.clearLayers();
    const points: L.LatLngTuple[] = [[origin.lat, origin.lng]];
    L.marker([origin.lat, origin.lng], {
      icon: L.divIcon({
        className: "origin-marker",
        html: '<span aria-label="Starting point">⌂</span>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    })
      .addTo(group)
      .bindTooltip("Your starting point");
    stops.forEach((stop, i) => {
      const place = findPlace(stop.placeId);
      if (!place || stop.status === "skipped") return;
      const point: L.LatLngTuple = [place.coordinate.lat, place.coordinate.lng];
      if (stop.status === "pending") points.push(point);
      const marker = L.marker(point, {
        icon: L.divIcon({
          className: `route-marker ${stop.status}`,
          html: `<span>${stop.status === "visited" ? "✓" : i + 1}</span>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        }),
      }).addTo(group);
      marker.bindTooltip(place.name);
      marker.on("click", () => select.current(place));
      if (marker.getElement()) {
        marker.getElement()!.setAttribute("aria-label", `View ${place.name}`);
        marker.getElement()!.setAttribute("role", "button");
      }
    });
    if (points.length > 1)
      L.polyline(points, {
        color: "#225bdd",
        weight: 3,
        dashArray: "6 8",
        opacity: 0.65,
      }).addTo(group);
    if (currentLocation) {
      L.circleMarker([currentLocation.lat, currentLocation.lng], {
        color: "#fff",
        fillColor: "#3b82f6",
        fillOpacity: 1,
        weight: 3,
        radius: 8,
      })
        .addTo(group)
        .bindTooltip("Your location");
      points.push([currentLocation.lat, currentLocation.lng]);
    }
    instance.fitBounds(L.latLngBounds(points), {
      padding: [36, 36],
      maxZoom: 14,
      animate: false,
    });
  }, [stops, origin, currentLocation]);

  return (
    <section className="map-card" aria-label="Daily route map">
      <div className="section-heading map-heading">
        <div>
          <span className="eyebrow">THE BIG PICTURE</span>
          <h2>Your day, mapped out</h2>
        </div>
        <MapPin size={19} />
      </div>
      <div className="map-container">
        <div
          ref={element}
          className="leaflet-map"
          aria-label="Map of your Istanbul stops"
        />
        {offline && (
          <div className="map-offline">
            <WifiOff size={14} /> Offline schematic · approximate coastline,
            real stop locations.
          </div>
        )}
        <button
          className="map-fit icon-button"
          aria-label="Fit all stops on the map"
          onClick={() => {
            const points = stops
              .filter((s) => s.status !== "skipped")
              .map((s) => findPlace(s.placeId))
              .filter((p): p is Place => !!p)
              .map(
                (p) => [p.coordinate.lat, p.coordinate.lng] as L.LatLngTuple,
              );
            if (currentLocation)
              points.push([currentLocation.lat, currentLocation.lng]);
            if (points.length)
              map.current?.fitBounds(
                L.latLngBounds([...points, [origin.lat, origin.lng]]),
                { padding: [36, 36], maxZoom: 14 },
              );
          }}
        >
          <Maximize2 size={16} />
        </button>
        <div className="map-legend">
          <span className="legend-dot" />
          Your route
          <span className="legend-origin" />
          <LocateFixed size={12} />
          Start
        </div>
      </div>
      <p className="map-footnote">
        A stop overview. Connecting lines aren’t turn-by-turn paths.
      </p>
    </section>
  );
}
