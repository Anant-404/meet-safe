"use client";

import {
  Autocomplete, Circle, GoogleMap, Marker, useJsApiLoader,
} from "@react-google-maps/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type LatLng = { lat: number; lng: number };
type Props = {
  onLocationSelected: (lat: number, lng: number, address: string) => void;
  selectedLocation: LatLng | null;
  radiusMeters: number;
  onRadiusChange: (r: number) => void;
};

const LIBRARIES: ("places")[] = ["places"];
const CONTAINER_STYLE = { width: "100%", height: "100%" };
const DEFAULT_CENTER: LatLng = { lat: 40.7128, lng: -74.006 };
const SLIDER_MIN = 20;
const SLIDER_MAX = 2000;

const LIGHT_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "geometry", stylers: [{ color: "#eef2ee" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#7a9088" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#c8dfd4" }] },
  { featureType: "landscape.natural", stylers: [{ color: "#dceee5" }] },
];

const DARK_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0f1a13" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#080f0b" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#5a7a68" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1a2e20" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#5a7a68" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#080f0b" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

function fmtRadius(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

export function MapPicker({ onLocationSelected, selectedLocation, radiusMeters, onRadiusChange }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
  const { isLoaded, loadError } = useJsApiLoader({ googleMapsApiKey: apiKey, libraries: LIBRARIES });

  const mapRef = useRef<google.maps.Map | null>(null);
  const acRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [input, setInput] = useState("");
  const [isDark, setIsDark] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoErr, setGeoErr] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  const onMapLoad = useCallback((m: google.maps.Map) => { mapRef.current = m; }, []);
  const onAcLoad = useCallback((ac: google.maps.places.Autocomplete) => { acRef.current = ac; }, []);

  const onPlaceChanged = useCallback(() => {
    const ac = acRef.current; if (!ac) return;
    const place = ac.getPlace(); if (!place.geometry?.location) return;
    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();
    const addr = place.formatted_address || place.name || `${lat}, ${lng}`;
    setInput(addr); onLocationSelected(lat, lng, addr);
    mapRef.current?.panTo({ lat, lng }); mapRef.current?.setZoom(15);
  }, [onLocationSelected]);

  const onMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    const lat = e.latLng.lat(); const lng = e.latLng.lng();
    const addr = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setInput(addr); onLocationSelected(lat, lng, addr);
  }, [onLocationSelected]);

  const onDragEnd = useCallback((e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    const lat = e.latLng.lat(); const lng = e.latLng.lng();
    const addr = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setInput(addr); onLocationSelected(lat, lng, addr);
  }, [onLocationSelected]);

  const myLocation = useCallback(() => {
    if (!navigator.geolocation) { setGeoErr("Unavailable"); return; }
    setLocating(true); setGeoErr(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = p.coords.latitude; const lng = p.coords.longitude;
        const addr = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        setInput(addr); onLocationSelected(lat, lng, addr);
        mapRef.current?.panTo({ lat, lng }); mapRef.current?.setZoom(15);
        setLocating(false);
      },
      (err) => { setGeoErr(err.message); setLocating(false); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [onLocationSelected]);

  const mapOpts = useMemo<google.maps.MapOptions>(() => ({
    disableDefaultUI: false, clickableIcons: false, streetViewControl: false,
    mapTypeControl: false, fullscreenControl: false, zoomControl: true,
    styles: isDark ? DARK_STYLES : LIGHT_STYLES, gestureHandling: "greedy",
  }), [isDark]);

  const circleOpts = useMemo<google.maps.CircleOptions>(() => ({
    strokeColor: "#0ea472", strokeOpacity: 0.8, strokeWeight: 2,
    fillColor: "#0ea472", fillOpacity: 0.08,
    clickable: false, draggable: false, editable: false, visible: true,
    radius: radiusMeters, zIndex: 1,
  }), [radiusMeters]);

  if (!apiKey) return <div className="rounded-lg border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-400">Missing NEXT_PUBLIC_GOOGLE_MAPS_KEY</div>;
  if (loadError) return <div className="rounded-lg border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-400">Maps failed: {loadError.message}</div>;
  if (!isLoaded) return (
    <div className="map-shell flex h-[300px] w-full items-center justify-center text-sm" style={{ color: "var(--muted)" }}>
      <span className="inline-flex items-center gap-2">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Loading map…
      </span>
    </div>
  );

  return (
    <div className="space-y-2.5">
      <div className="map-shell relative h-[300px] w-full sm:h-[380px]">
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex gap-2">
          <div className="glass pointer-events-auto flex flex-1 items-center gap-2 rounded-xl px-2.5 py-1.5 shadow-md">
            <svg viewBox="0 0 24 24" width="15" height="15" className="ml-1 shrink-0" style={{ fill: "var(--muted)" }}>
              <path d="M10 2a8 8 0 1 1-5.3 14l-3.4 3.4-1.4-1.4L3.3 14.7A8 8 0 0 1 10 2zm0 2a6 6 0 1 0 .1 12A6 6 0 0 0 10 4z" />
            </svg>
            <Autocomplete onLoad={onAcLoad} onPlaceChanged={onPlaceChanged} options={{ fields: ["geometry", "formatted_address", "name"] }} className="flex-1">
              <input
                type="text" value={input} onChange={(e) => setInput(e.target.value)}
                placeholder="Search location…"
                className="w-full bg-transparent px-1 py-1.5 text-sm focus:outline-none"
                style={{ color: "var(--foreground)" }}
              />
            </Autocomplete>
          </div>
          <button type="button" onClick={myLocation} disabled={locating}
            className="glass pointer-events-auto flex h-9 w-9 items-center justify-center rounded-xl shadow-md transition hover:bg-[color:var(--card)] disabled:opacity-50 sm:h-auto sm:w-auto sm:px-2.5 sm:py-1.5"
          >
            {locating
              ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              : <>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" className="sm:mr-1">
                    <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.9 3A9 9 0 0 0 13 3.1V1h-2v2.1A9 9 0 0 0 3.1 11H1v2h2.1A9 9 0 0 0 11 20.9V23h2v-2.1A9 9 0 0 0 20.9 13H23v-2h-2.1zM12 19a7 7 0 1 1 0-14 7 7 0 0 1 0 14z" />
                  </svg>
                  <span className="hidden sm:inline text-xs font-medium">My location</span>
                </>
            }
          </button>
        </div>
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex justify-center">
          <span className="chip text-[10px]">
            {selectedLocation ? `Safe zone: ${fmtRadius(radiusMeters)} radius` : "Tap map or search to pick meeting spot"}
          </span>
        </div>
        <GoogleMap mapContainerStyle={CONTAINER_STYLE} center={selectedLocation ?? DEFAULT_CENTER} zoom={selectedLocation ? 15 : 12} onLoad={onMapLoad} onClick={onMapClick} options={mapOpts}>
          {selectedLocation && <>
            <Marker position={selectedLocation} draggable onDragEnd={onDragEnd} />
            <Circle center={selectedLocation} options={circleOpts} />
          </>}
        </GoogleMap>
      </div>

      <div className="card-inner px-3.5 py-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs" style={{ color: "var(--muted)" }}>Safe zone radius</span>
          <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}>{fmtRadius(radiusMeters)}</span>
        </div>
        <input type="range" className="slider" min={SLIDER_MIN} max={SLIDER_MAX} step={20} value={radiusMeters} onChange={(e) => onRadiusChange(Number(e.target.value))} />
        <div className="mt-1 flex justify-between text-[10px]" style={{ color: "var(--muted)" }}>
          <span>20 m</span><span>2 km</span>
        </div>
      </div>
      {geoErr && <p className="text-xs text-red-400">Location: {geoErr}</p>}
    </div>
  );
}