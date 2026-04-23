"use client";

import {
  Circle,
  GoogleMap,
  Marker,
  useJsApiLoader,
} from "@react-google-maps/api";
import { useEffect, useMemo, useState } from "react";

type LatLng = { lat: number; lng: number };

type Props = {
  target: LatLng;
  current: LatLng | null;
};

const CONTAINER_STYLE = {
  width: "100%",
  height: "100%",
};

const LIBRARIES: ("places")[] = ["places"];

const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1f2430" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0f1218" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#a1a7b5" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a3040" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9aa3b2" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0b1220" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

export function ActiveMap({ target, current }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries: LIBRARIES,
  });

  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const circleOptions = useMemo<google.maps.CircleOptions>(
    () => ({
      strokeColor: "#6366f1",
      strokeOpacity: 0.9,
      strokeWeight: 2,
      fillColor: "#818cf8",
      fillOpacity: 0.18,
      clickable: false,
      radius: 1000,
    }),
    []
  );

  const mapOptions = useMemo<google.maps.MapOptions>(
    () => ({
      disableDefaultUI: true,
      clickableIcons: false,
      zoomControl: true,
      gestureHandling: "greedy",
      styles: isDark ? DARK_MAP_STYLES : undefined,
    }),
    [isDark]
  );

  if (!apiKey || !isLoaded) {
    return (
      <div className="map-shell flex h-[260px] w-full items-center justify-center bg-black/5 text-sm text-[color:var(--muted)] dark:bg-white/5">
        Map unavailable
      </div>
    );
  }

  const center = current ?? target;

  return (
    <div className="map-shell h-[260px] w-full sm:h-[320px]">
      <GoogleMap
        mapContainerStyle={CONTAINER_STYLE}
        center={center}
        zoom={14}
        options={mapOptions}
      >
        <Marker position={target} label={{ text: "T", color: "#fff" }} />
        <Circle center={target} options={circleOptions} />
        {current && (
          <Marker
            position={current}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: "#22c55e",
              fillOpacity: 1,
              strokeColor: "#0f172a",
              strokeWeight: 2,
            }}
          />
        )}
      </GoogleMap>
    </div>
  );
}
