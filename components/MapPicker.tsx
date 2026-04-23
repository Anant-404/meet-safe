"use client";

import {
  Autocomplete,
  Circle,
  GoogleMap,
  Marker,
  useJsApiLoader,
} from "@react-google-maps/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type LatLng = { lat: number; lng: number };

type Props = {
  onLocationSelected: (lat: number, lng: number, address: string) => void;
  selectedLocation: LatLng | null;
};

const LIBRARIES: ("places")[] = ["places"];

const CONTAINER_STYLE = {
  width: "100%",
  height: "100%",
};

const DEFAULT_CENTER: LatLng = { lat: 40.7128, lng: -74.006 };

const LIGHT_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
];

const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1f2430" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0f1218" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#a1a7b5" }] },
  { featureType: "poi", stylers: [{ visibility: "simplified" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a3040" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9aa3b2" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0b1220" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

export function MapPicker({ onLocationSelected, selectedLocation }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries: LIBRARIES,
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isDark, setIsDark] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const onAutocompleteLoad = useCallback(
    (ac: google.maps.places.Autocomplete) => {
      autocompleteRef.current = ac;
    },
    []
  );

  const onPlaceChanged = useCallback(() => {
    const ac = autocompleteRef.current;
    if (!ac) return;
    const place = ac.getPlace();
    if (!place.geometry?.location) return;
    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();
    const address = place.formatted_address || place.name || `${lat}, ${lng}`;
    setInputValue(address);
    onLocationSelected(lat, lng, address);
    if (mapRef.current) {
      mapRef.current.panTo({ lat, lng });
      mapRef.current.setZoom(15);
    }
  }, [onLocationSelected]);

  const onMapClick = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      const address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      setInputValue(address);
      onLocationSelected(lat, lng, address);
    },
    [onLocationSelected]
  );

  const onMarkerDragEnd = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      const address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      setInputValue(address);
      onLocationSelected(lat, lng, address);
    },
    [onLocationSelected]
  );

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation unavailable");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = p.coords.latitude;
        const lng = p.coords.longitude;
        const address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        setInputValue(address);
        onLocationSelected(lat, lng, address);
        if (mapRef.current) {
          mapRef.current.panTo({ lat, lng });
          mapRef.current.setZoom(15);
        }
        setLocating(false);
      },
      (err) => {
        setGeoError(err.message);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [onLocationSelected]);

  const mapOptions = useMemo<google.maps.MapOptions>(
    () => ({
      disableDefaultUI: false,
      clickableIcons: false,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      zoomControl: true,
      styles: isDark ? DARK_MAP_STYLES : LIGHT_MAP_STYLES,
      gestureHandling: "greedy",
    }),
    [isDark]
  );

  const circleOptions = useMemo<google.maps.CircleOptions>(
    () => ({
      strokeColor: "#6366f1",
      strokeOpacity: 0.9,
      strokeWeight: 2,
      fillColor: "#818cf8",
      fillOpacity: 0.18,
      clickable: false,
      draggable: false,
      editable: false,
      visible: true,
      radius: 1000,
      zIndex: 1,
    }),
    []
  );

  if (!apiKey) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
        Missing <code>NEXT_PUBLIC_GOOGLE_MAPS_KEY</code> env var.
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
        Failed to load Google Maps: {loadError.message}
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="map-shell flex h-[360px] w-full items-center justify-center bg-black/5 text-sm text-[color:var(--muted)] dark:bg-white/5 sm:h-[420px]">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Loading map…
        </span>
      </div>
    );
  }

  const center = selectedLocation ?? DEFAULT_CENTER;

  return (
    <div className="space-y-2">
      <div className="map-shell relative h-[360px] w-full sm:h-[460px]">
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start gap-2">
          <div className="glass pointer-events-auto flex flex-1 items-center gap-2 rounded-xl px-2.5 py-1.5 shadow-lg">
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              className="ml-1 text-[color:var(--muted)]"
              fill="currentColor"
              aria-hidden
            >
              <path d="M10 2a8 8 0 1 1-5.3 14l-3.4 3.4-1.4-1.4L3.3 14.7A8 8 0 0 1 10 2zm0 2a6 6 0 1 0 .1 12A6 6 0 0 0 10 4z" />
            </svg>
            <Autocomplete
              onLoad={onAutocompleteLoad}
              onPlaceChanged={onPlaceChanged}
              options={{ fields: ["geometry", "formatted_address", "name"] }}
              className="flex-1"
            >
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Search for a place or address…"
                className="w-full bg-transparent px-1 py-2 text-sm text-[color:var(--foreground)] placeholder:text-[color:var(--muted)] focus:outline-none"
              />
            </Autocomplete>
          </div>
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            title="Use my location"
            className="glass pointer-events-auto flex h-10 w-10 items-center justify-center rounded-xl text-[color:var(--foreground)] shadow-lg transition hover:bg-[color:var(--card)] disabled:opacity-60 sm:h-auto sm:w-auto sm:px-3 sm:py-2 sm:text-xs sm:font-medium"
          >
            {locating ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <>
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="currentColor"
                  aria-hidden
                  className="sm:mr-1.5"
                >
                  <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.9 3A9 9 0 0 0 13 3.1V1h-2v2.1A9 9 0 0 0 3.1 11H1v2h2.1A9 9 0 0 0 11 20.9V23h2v-2.1A9 9 0 0 0 20.9 13H23v-2h-2.1zM12 19a7 7 0 1 1 0-14 7 7 0 0 1 0 14z" />
                </svg>
                <span className="hidden sm:inline">My location</span>
              </>
            )}
          </button>
        </div>

        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex justify-center">
          <div className="chip pointer-events-auto">
            {selectedLocation
              ? "Drag the pin to fine-tune — blue circle = 1 km safe zone"
              : "Tap the map, drag the pin, or search to pick the meeting spot"}
          </div>
        </div>

        <GoogleMap
          mapContainerStyle={CONTAINER_STYLE}
          center={center}
          zoom={selectedLocation ? 15 : 12}
          onLoad={onMapLoad}
          onClick={onMapClick}
          options={mapOptions}
        >
          {selectedLocation && (
            <>
              <Marker
                position={selectedLocation}
                draggable
                onDragEnd={onMarkerDragEnd}
              />
              <Circle center={selectedLocation} options={circleOptions} />
            </>
          )}
        </GoogleMap>
      </div>
      {geoError && (
        <p className="text-xs text-red-400">Location: {geoError}</p>
      )}
    </div>
  );
}
