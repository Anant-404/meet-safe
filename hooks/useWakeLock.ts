"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", fn: () => void) => void;
  removeEventListener: (type: "release", fn: () => void) => void;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

type UseWakeLockReturn = {
  isLocked: boolean;
  isSupported: boolean;
  request: () => Promise<void>;
  release: () => Promise<void>;
};

export function useWakeLock(): UseWakeLockReturn {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const wantedRef = useRef(false);

  useEffect(() => {
    setIsSupported(
      typeof navigator !== "undefined" &&
        "wakeLock" in navigator &&
        typeof (navigator as NavigatorWithWakeLock).wakeLock?.request ===
          "function"
    );
  }, []);

  const acquire = useCallback(async () => {
    if (typeof navigator === "undefined") return;
    const nav = navigator as NavigatorWithWakeLock;
    if (!nav.wakeLock) return;
    try {
      const sentinel = await nav.wakeLock.request("screen");
      sentinelRef.current = sentinel;
      setIsLocked(true);
      sentinel.addEventListener("release", () => {
        setIsLocked(false);
      });
    } catch (err) {
      console.warn("Wake lock request failed:", err);
      setIsLocked(false);
    }
  }, []);

  const request = useCallback(async () => {
    wantedRef.current = true;
    await acquire();
  }, [acquire]);

  const release = useCallback(async () => {
    wantedRef.current = false;
    const sentinel = sentinelRef.current;
    sentinelRef.current = null;
    if (sentinel && !sentinel.released) {
      try {
        await sentinel.release();
      } catch (err) {
        console.warn("Wake lock release failed:", err);
      }
    }
    setIsLocked(false);
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (
        wantedRef.current &&
        document.visibilityState === "visible" &&
        (!sentinelRef.current || sentinelRef.current.released)
      ) {
        acquire();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [acquire]);

  useEffect(() => {
    return () => {
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      wantedRef.current = false;
      if (sentinel && !sentinel.released) {
        sentinel.release().catch(() => {});
      }
    };
  }, []);

  return { isLocked, isSupported, request, release };
}
