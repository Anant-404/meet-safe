"use client";

import { Circle, GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { useEffect, useMemo, useState } from "react";

type LatLng = { lat: number; lng: number };
type Props = { target: LatLng; current: LatLng | null; radiusMeters: number; };

const CONTAINER_STYLE = { width: "100%", height: "100%" };
const LIBRARIES: ("places")[] = ["places"];

const DARK_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0f1a13" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#080f0b" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#5a7a68" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1a2e20" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#080f0b" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

export function ActiveMap({ target, current, radiusMeters }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: apiKey, libraries: LIBRARIES });
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  const circleOpts = useMemo<google.maps.CircleOptions>(() => ({
    strokeColor: "#0ea472", strokeOpacity: 0.8, strokeWeight: 2,
    fillColor: "#0ea472", fillOpacity: 0.08, clickable: false, radius: radiusMeters,
  }), [radiusMeters]);

  const mapOpts = useMemo<google.maps.MapOptions>(() => ({
    disableDefaultUI: true, clickableIcons: false, zoomControl: true,
    gestureHandling: "greedy", styles: isDark ? DARK_STYLES : undefined,
  }), [isDark]);

  if (!apiKey || !isLoaded) return (
    <div className="map-shell flex h-[240px] w-full items-center justify-center text-sm" style={{ color: "var(--muted)" }}>
      Map unavailable
    </div>
  );

  return (
    <div className="map-shell h-[240px] w-full sm:h-[300px]">
      <GoogleMap mapContainerStyle={CONTAINER_STYLE} center={current ?? target} zoom={14} options={mapOpts}>
        <Marker position={target} label={{ text: "T", color: "#fff" }} />
        <Circle center={target} options={circleOpts} />
        {current && (
          <Marker position={current} icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8, fillColor: "#0ea472", fillOpacity: 1,
            strokeColor: "#080f0b", strokeWeight: 2,
          }} />
        )}
      </GoogleMap>
    </div>
  );
}