"use client";

import { ActiveMap } from "@/components/ActiveMap";
import { MapPicker } from "@/components/MapPicker";
import { useGeolocation, type GeoPosition } from "@/hooks/useGeolocation";
import { useWakeLock } from "@/hooks/useWakeLock";
import { distanceInMeters } from "@/lib/distance";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type LatLng = { lat: number; lng: number };

type Target = {
  lat: number;
  lng: number;
  address: string;
};

type Status = "idle" | "armed" | "checking" | "alerting" | "safe";

type EmailLog = {
  at: number;
  ok: boolean;
  error?: string;
};

const SAFE_RADIUS_M = 1000;
const PROD_INTERVAL_MS = 7 * 60 * 1000;
const TEST_INTERVAL_MS = 30 * 1000;

function defaultMeetingTime(): string {
  const d = new Date(Date.now() + 30 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseMeetingTime(hhmm: string): Date | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const [, hh, mm] = m;
  const h = Number(hh);
  const mi = Number(mm);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  const now = new Date();
  const t = new Date();
  t.setHours(h, mi, 0, 0);
  // Only roll to tomorrow if the picked time is far in the past (>6h back) —
  // otherwise treat a slightly-past time as "check now" so the user can arm
  // immediately instead of waiting ~24h.
  if (now.getTime() - t.getTime() > 6 * 60 * 60 * 1000) {
    t.setDate(t.getDate() + 1);
  }
  return t;
}

function formatDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${Math.round(m)} m`;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0s";
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r}s`;
  return `${m}m ${r.toString().padStart(2, "0")}s`;
}

export function TrackingPanel() {
  const [status, setStatus] = useState<Status>("idle");
  const [target, setTarget] = useState<Target | null>(null);
  const [meetingTime, setMeetingTime] = useState<string>(defaultMeetingTime);
  const [email, setEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [testMode, setTestMode] = useState(false);
  const [armedDeadline, setArmedDeadline] = useState<Date | null>(null);
  const [nextEmailAt, setNextEmailAt] = useState<number | null>(null);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  const geo = useGeolocation();
  const wake = useWakeLock();

  const latestPositionRef = useRef<GeoPosition | null>(null);
  const statusRef = useRef<Status>("idle");
  const armDeadlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const emailIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const targetRef = useRef<Target | null>(null);
  const meetingTimeRef = useRef<string>("");
  const emailRef = useRef<string>("");
  const userNameRef = useRef<string>("");
  const testModeRef = useRef<boolean>(false);

  useEffect(() => {
    latestPositionRef.current = geo.position;
  }, [geo.position]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const distance = useMemo<number | null>(() => {
    if (!target || !geo.position) return null;
    return distanceInMeters(
      geo.position.lat,
      geo.position.lng,
      target.lat,
      target.lng
    );
  }, [target, geo.position]);

  const sendEmail = useCallback(async () => {
    const tgt = targetRef.current;
    const pos = latestPositionRef.current;
    const to = emailRef.current;
    if (!tgt || !pos || !to) return;
    const dist = distanceInMeters(pos.lat, pos.lng, tgt.lat, tgt.lng);
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          lat: pos.lat,
          lng: pos.lng,
          meetingLocation: tgt.address,
          meetingTime: meetingTimeRef.current,
          distanceMeters: dist,
          userName: userNameRef.current || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !data.success) {
        setEmailLogs((l) =>
          [
            ...l,
            { at: Date.now(), ok: false, error: data.error || `HTTP ${res.status}` },
          ].slice(-10)
        );
      } else {
        setEmailLogs((l) => [...l, { at: Date.now(), ok: true }].slice(-10));
      }
    } catch (err) {
      setEmailLogs((l) =>
        [
          ...l,
          {
            at: Date.now(),
            ok: false,
            error: err instanceof Error ? err.message : "Network error",
          },
        ].slice(-10)
      );
    } finally {
      const interval = testModeRef.current ? TEST_INTERVAL_MS : PROD_INTERVAL_MS;
      setNextEmailAt(Date.now() + interval);
    }
  }, []);

  const clearTimers = useCallback(() => {
    if (armDeadlineTimerRef.current) {
      clearTimeout(armDeadlineTimerRef.current);
      armDeadlineTimerRef.current = null;
    }
    if (emailIntervalRef.current) {
      clearInterval(emailIntervalRef.current);
      emailIntervalRef.current = null;
    }
  }, []);

  const beginAlerting = useCallback(() => {
    setStatus("alerting");
    const interval = testModeRef.current ? TEST_INTERVAL_MS : PROD_INTERVAL_MS;
    setNextEmailAt(Date.now() + interval);
    sendEmail();
    if (emailIntervalRef.current) clearInterval(emailIntervalRef.current);
    emailIntervalRef.current = setInterval(sendEmail, interval);
  }, [sendEmail]);

  const finishSafe = useCallback(() => {
    clearTimers();
    setStatus("safe");
    setNextEmailAt(null);
    wake.release();
    geo.stopWatching();
  }, [clearTimers, wake, geo]);

  const runCheck = useCallback(() => {
    const tgt = targetRef.current;
    const pos = latestPositionRef.current;
    if (!tgt) return;
    setStatus("checking");
    if (!pos) {
      setTimeout(() => {
        if (statusRef.current !== "checking") return;
        const p = latestPositionRef.current;
        if (!p) {
          beginAlerting();
          return;
        }
        const d = distanceInMeters(p.lat, p.lng, tgt.lat, tgt.lng);
        if (d <= SAFE_RADIUS_M) finishSafe();
        else beginAlerting();
      }, 8000);
      return;
    }
    const d = distanceInMeters(pos.lat, pos.lng, tgt.lat, tgt.lng);
    if (d <= SAFE_RADIUS_M) finishSafe();
    else beginAlerting();
  }, [beginAlerting, finishSafe]);

  useEffect(() => {
    if (status !== "alerting") return;
    const pos = geo.position;
    const tgt = targetRef.current;
    if (!pos || !tgt) return;
    const d = distanceInMeters(pos.lat, pos.lng, tgt.lat, tgt.lng);
    if (d <= SAFE_RADIUS_M) {
      setToast("You arrived, alerts stopped.");
      finishSafe();
    }
  }, [status, geo.position, finishSafe]);

  const canStart = useMemo(() => {
    return (
      !!target &&
      !!email &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
      !!parseMeetingTime(meetingTime)
    );
  }, [target, email, meetingTime]);

  const handleStart = useCallback(async () => {
    if (!target) return;
    const deadline = parseMeetingTime(meetingTime);
    if (!deadline) return;

    targetRef.current = target;
    meetingTimeRef.current = meetingTime;
    emailRef.current = email.trim();
    userNameRef.current = userName.trim();
    testModeRef.current = testMode;

    setEmailLogs([]);
    setNextEmailAt(null);
    setArmedDeadline(deadline);
    setToast(null);
    setStatus("armed");

    geo.startWatching();
    try {
      await wake.request();
    } catch {
      // ignore — wake lock optional
    }

    const delay = Math.max(0, deadline.getTime() - Date.now());
    if (armDeadlineTimerRef.current) clearTimeout(armDeadlineTimerRef.current);
    armDeadlineTimerRef.current = setTimeout(() => {
      runCheck();
    }, delay);
  }, [email, geo, meetingTime, runCheck, target, testMode, userName, wake]);

  const handleStop = useCallback(() => {
    clearTimers();
    geo.stopWatching();
    wake.release();
    setStatus("idle");
    setNextEmailAt(null);
    setArmedDeadline(null);
    setToast(null);
  }, [clearTimers, geo, wake]);

  useEffect(() => {
    return () => {
      if (armDeadlineTimerRef.current) clearTimeout(armDeadlineTimerRef.current);
      if (emailIntervalRef.current) clearInterval(emailIntervalRef.current);
    };
  }, []);

  const lastEmail = emailLogs[emailLogs.length - 1];
  const emailsSent = emailLogs.filter((l) => l.ok).length;

  return (
    <div className="mx-auto w-full">
      {toast && (
        <div className="mb-4 rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-200">
          {toast}
        </div>
      )}

      {status === "idle" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canStart) handleStart();
          }}
          className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]"
        >
          <div className="order-2 lg:order-1">
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-[color:var(--muted)]">
              Meeting location
            </label>
            <MapPicker
              selectedLocation={
                target ? { lat: target.lat, lng: target.lng } : null
              }
              onLocationSelected={(lat, lng, address) =>
                setTarget({ lat, lng, address })
              }
            />
            {target && (
              <p className="mt-3 truncate text-xs text-[color:var(--muted)]">
                Selected:{" "}
                <span className="text-[color:var(--foreground)]">
                  {target.address}
                </span>
              </p>
            )}
          </div>

          <aside className="order-1 space-y-4 lg:order-2">
            <div className="card p-5">
              <h2 className="mb-4 text-sm font-semibold">New check-in</h2>

              <label className="mb-1 block text-xs font-medium text-[color:var(--muted)]">
                Meeting time (24h)
              </label>
              <input
                type="time"
                value={meetingTime}
                onChange={(e) => setMeetingTime(e.target.value)}
                className="input mb-4 w-full px-3 py-2.5 text-sm"
                required
              />

              <label className="mb-1 block text-xs font-medium text-[color:var(--muted)]">
                Emergency contact email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="trusted@example.com"
                className="input mb-4 w-full px-3 py-2.5 text-sm"
                required
              />

              <label className="mb-1 block text-xs font-medium text-[color:var(--muted)]">
                Your name (optional)
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Alex"
                className="input mb-4 w-full px-3 py-2.5 text-sm"
              />

              <label className="mb-4 flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={testMode}
                  onChange={(e) => setTestMode(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-indigo-500"
                />
                <span>
                  <span className="font-medium">Test mode</span>
                  <span className="block text-xs text-[color:var(--muted)]">
                    Email every 30s instead of 7 min
                  </span>
                </span>
              </label>

              <button
                type="submit"
                disabled={!canStart}
                className="btn-primary w-full rounded-xl px-4 py-3 text-sm font-semibold"
              >
                Start tracking
              </button>

              {geo.error && (
                <p className="mt-3 text-xs text-red-400">
                  Location error: {geo.error}
                </p>
              )}
            </div>

            <div className="card p-4 text-xs text-[color:var(--muted)]">
              <div className="mb-1 font-medium text-[color:var(--foreground)]">
                How it works
              </div>
              Pin the meeting spot, set a time, add a trusted email. At the
              deadline we check your location — if you&apos;re outside the 1 km
              safe zone, we email your contact every {PROD_INTERVAL_MS / 60000}{" "}
              minutes with your live GPS until you arrive.
            </div>
          </aside>
        </form>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
          <div className="order-2 lg:order-1">
            {target && (
              <ActiveMap
                target={{ lat: target.lat, lng: target.lng }}
                current={
                  geo.position
                    ? { lat: geo.position.lat, lng: geo.position.lng }
                    : null
                }
              />
            )}
            {target && (
              <p className="mt-3 truncate text-xs text-[color:var(--muted)]">
                Target:{" "}
                <span className="text-[color:var(--foreground)]">
                  {target.address}
                </span>
              </p>
            )}
          </div>

          <aside className="order-1 space-y-4 lg:order-2">
            <div className="card overflow-hidden">
              <div className="p-5">
                <StatusHeader
                  status={status}
                  armedDeadline={armedDeadline}
                  now={now}
                />

                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <Stat
                    label="Distance"
                    value={distance != null ? formatDistance(distance) : "—"}
                  />
                  <Stat
                    label="Next email"
                    value={
                      status === "alerting" && nextEmailAt != null
                        ? formatCountdown(nextEmailAt - now)
                        : "—"
                    }
                  />
                  <Stat label="Emails sent" value={String(emailsSent)} />
                  <Stat
                    label="Last email"
                    value={
                      lastEmail
                        ? lastEmail.ok
                          ? "Sent ✓"
                          : `Failed`
                        : "—"
                    }
                    tone={
                      lastEmail
                        ? lastEmail.ok
                          ? "ok"
                          : "err"
                        : undefined
                    }
                    hint={lastEmail && !lastEmail.ok ? lastEmail.error : undefined}
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[color:var(--muted)]">
                  <span className="chip">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        wake.isLocked ? "bg-green-500" : "bg-[color:var(--muted)]"
                      }`}
                    />
                    Wake lock{" "}
                    {wake.isLocked
                      ? "on"
                      : wake.isSupported
                        ? "off"
                        : "unsupported"}
                  </span>
                  <span className="chip">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        geo.isWatching ? "bg-green-500" : "bg-[color:var(--muted)]"
                      }`}
                    />
                    GPS {geo.isWatching ? "watching" : "idle"}
                  </span>
                  {geo.position && (
                    <span className="chip">
                      Acc {Math.round(geo.position.accuracy)}m
                    </span>
                  )}
                </div>

                {geo.error && (
                  <p className="mt-3 text-xs text-red-400">
                    Location error: {geo.error}
                  </p>
                )}
              </div>

              {status !== "safe" && (
                <button
                  type="button"
                  onClick={handleStop}
                  className="btn-danger flex w-full items-center justify-center gap-2 px-4 py-3.5 text-sm font-bold uppercase tracking-wider"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path d="M6 6h12v12H6z" />
                  </svg>
                  Stop tracking
                </button>
              )}
            </div>

            {status === "safe" && (
              <div className="card border-green-500/40 bg-green-500/10 p-5 text-center">
                <p className="text-lg font-semibold text-green-200">
                  ✓ You made it
                </p>
                <p className="text-sm text-green-200/80">
                  Alerts stopped. You can close this tab.
                </p>
                <button
                  type="button"
                  onClick={() => setStatus("idle")}
                  className="btn-ghost mt-3 rounded-lg px-3 py-2 text-sm"
                >
                  Start over
                </button>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function StatusHeader({
  status,
  armedDeadline,
  now,
}: {
  status: Status;
  armedDeadline: Date | null;
  now: number;
}) {
  let label: string;
  let sub: string;
  let tone: "armed" | "check" | "alert" | "safe";
  switch (status) {
    case "armed": {
      const remaining = armedDeadline ? armedDeadline.getTime() - now : 0;
      label = "Armed";
      sub = `Waiting until ${
        armedDeadline
          ? armedDeadline.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—"
      } · ${formatCountdown(Math.max(0, remaining))}`;
      tone = "armed";
      break;
    }
    case "checking":
      label = "Checking location";
      sub = "Reading current position…";
      tone = "check";
      break;
    case "alerting":
      label = "Outside safe zone";
      sub = "Emailing contact with your live location";
      tone = "alert";
      break;
    case "safe":
      label = "Inside safe zone";
      sub = "You arrived — alerts stopped";
      tone = "safe";
      break;
    default:
      label = "";
      sub = "";
      tone = "armed";
  }

  const toneClasses: Record<typeof tone, string> = {
    armed: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30",
    check: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    alert: "bg-red-500/10 text-red-300 border-red-500/30",
    safe: "bg-green-500/10 text-green-300 border-green-500/30",
  };

  return (
    <div className={`rounded-xl border px-3 py-3 ${toneClasses[tone]}`}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        {tone === "alert" ? (
          <span className="pulse-dot red" />
        ) : tone === "armed" || tone === "check" ? (
          <span className="pulse-dot" />
        ) : (
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
          </svg>
        )}
        {label}
      </div>
      <div className="mt-0.5 text-xs opacity-90">{sub}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "ok" | "err";
  hint?: string;
}) {
  const toneCls =
    tone === "ok"
      ? "text-green-400"
      : tone === "err"
        ? "text-red-400"
        : "";
  return (
    <div
      className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)]/60 p-3"
      title={hint}
    >
      <div className="text-[10px] font-medium uppercase tracking-wider text-[color:var(--muted)]">
        {label}
      </div>
      <div className={`mt-0.5 text-base font-semibold ${toneCls}`}>{value}</div>
    </div>
  );
}
