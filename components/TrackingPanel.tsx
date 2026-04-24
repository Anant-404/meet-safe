"use client";

import { ActiveMap } from "@/components/ActiveMap";
import { MapPicker } from "@/components/MapPicker";
import { useGeolocation, type GeoPosition } from "@/hooks/useGeolocation";
import { useWakeLock } from "@/hooks/useWakeLock";
import { distanceInMeters } from "@/lib/distance";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Target = { lat: number; lng: number; address: string };
type Status = "idle" | "armed" | "checking" | "alerting" | "safe";
type EmailLog = { at: number; ok: boolean; error?: string };

const DEFAULT_RADIUS_M = 500;
const PROD_INTERVAL_MS = 7 * 60 * 1000;
const TEST_INTERVAL_MS = 30 * 1000;
const MAX_CONTACTS = 5;

const AVATAR_COLORS = [
  { bg: "rgba(14,164,114,0.15)", color: "#0a7a55" },
  { bg: "rgba(20,130,230,0.12)", color: "#0d5fa3" },
  { bg: "rgba(160,60,200,0.12)", color: "#7a1faa" },
  { bg: "rgba(230,140,20,0.12)", color: "#a05c00" },
  { bg: "rgba(220,60,60,0.12)", color: "#9e1c1c" },
];

function defaultMeetingTime() {
  const d = new Date(Date.now() + 30 * 60 * 1000);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function parseMeetingTime(hhmm: string): Date | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]); const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  const t = new Date(); t.setHours(h, mi, 0, 0);
  if (Date.now() - t.getTime() > 6 * 3600000) t.setDate(t.getDate() + 1);
  return t;
}

function fmtDist(m: number) { return m >= 1000 ? `${(m/1000).toFixed(2)} km` : `${Math.round(m)} m`; }
function fmtCountdown(ms: number) {
  if (ms <= 0) return "0s";
  const s = Math.ceil(ms / 1000); const m = Math.floor(s / 60);
  return m === 0 ? `${s % 60}s` : `${m}m ${String(s % 60).padStart(2,"0")}s`;
}

function getInitial(email: string) { return email.trim()[0]?.toUpperCase() ?? "?"; }

export function TrackingPanel() {
  const [status, setStatus] = useState<Status>("idle");
  const [target, setTarget] = useState<Target | null>(null);
  const [meetingTime, setMeetingTime] = useState(defaultMeetingTime);
  const [contacts, setContacts] = useState<string[]>(["","","","",""]);
  const [userName, setUserName] = useState("");
  const [testMode, setTestMode] = useState(false);
  const [radius, setRadius] = useState(DEFAULT_RADIUS_M);
  const [armedDeadline, setArmedDeadline] = useState<Date | null>(null);
  const [nextEmailAt, setNextEmailAt] = useState<number | null>(null);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [now, setNow] = useState(Date.now());

  const geo = useGeolocation();
  const wake = useWakeLock();

  const posRef = useRef<GeoPosition | null>(null);
  const statusRef = useRef<Status>("idle");
  const deadlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const targetRef = useRef<Target | null>(null);
  const meetingTimeRef = useRef("");
  const contactsRef = useRef<string[]>([]);
  const userNameRef = useRef("");
  const testModeRef = useRef(false);
  const radiusRef = useRef(DEFAULT_RADIUS_M);

  useEffect(() => { posRef.current = geo.position; }, [geo.position]);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { radiusRef.current = radius; }, [radius]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  const validContacts = useMemo(() => contacts.filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())), [contacts]);

  const distance = useMemo<number | null>(() => {
    if (!target || !geo.position) return null;
    return distanceInMeters(geo.position.lat, geo.position.lng, target.lat, target.lng);
  }, [target, geo.position]);

  const sendEmails = useCallback(async () => {
    const tgt = targetRef.current; const pos = posRef.current;
    const tos = contactsRef.current.filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()));
    if (!tgt || !pos || !tos.length) return;
    const dist = distanceInMeters(pos.lat, pos.lng, tgt.lat, tgt.lng);
    await Promise.all(tos.map(async (to) => {
      try {
        const res = await fetch("/api/send-email", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: to.trim(), lat: pos.lat, lng: pos.lng, meetingLocation: tgt.address, meetingTime: meetingTimeRef.current, distanceMeters: dist, userName: userNameRef.current || undefined }),
        });
        const data = await res.json().catch(() => ({})) as { success?: boolean; error?: string };
        setEmailLogs(l => [...l, { at: Date.now(), ok: res.ok && !!data.success, error: data.error }].slice(-20));
      } catch (err) {
        setEmailLogs(l => [...l, { at: Date.now(), ok: false, error: err instanceof Error ? err.message : "Network error" }].slice(-20));
      }
    }));
    setNextEmailAt(Date.now() + (testModeRef.current ? TEST_INTERVAL_MS : PROD_INTERVAL_MS));
  }, []);

  const clearTimers = useCallback(() => {
    if (deadlineTimerRef.current) { clearTimeout(deadlineTimerRef.current); deadlineTimerRef.current = null; }
    if (emailTimerRef.current) { clearInterval(emailTimerRef.current); emailTimerRef.current = null; }
  }, []);

  const markSafe = useCallback(() => {
    if (emailTimerRef.current) { clearInterval(emailTimerRef.current); emailTimerRef.current = null; }
    setStatus("safe"); setNextEmailAt(null);
  }, []);

  const beginAlerting = useCallback(() => {
    setStatus("alerting");
    const iv = testModeRef.current ? TEST_INTERVAL_MS : PROD_INTERVAL_MS;
    setNextEmailAt(Date.now() + iv); sendEmails();
    if (emailTimerRef.current) clearInterval(emailTimerRef.current);
    emailTimerRef.current = setInterval(sendEmails, iv);
  }, [sendEmails]);

  const runCheck = useCallback(() => {
    const tgt = targetRef.current; const pos = posRef.current; const r = radiusRef.current;
    if (!tgt) return;
    setStatus("checking");
    if (!pos) {
      setTimeout(() => {
        if (statusRef.current !== "checking") return;
        const p = posRef.current;
        if (!p) { beginAlerting(); return; }
        distanceInMeters(p.lat, p.lng, tgt.lat, tgt.lng) <= r ? markSafe() : beginAlerting();
      }, 8000);
      return;
    }
    distanceInMeters(pos.lat, pos.lng, tgt.lat, tgt.lng) <= r ? markSafe() : beginAlerting();
  }, [beginAlerting, markSafe]);

  useEffect(() => {
    if ((status === "safe" || status === "alerting") && geo.position && targetRef.current) {
      const dist = distanceInMeters(geo.position.lat, geo.position.lng, targetRef.current.lat, targetRef.current.lng);
      const isInside = dist <= radiusRef.current;
      
      if (status === "alerting" && isInside) {
        setToast({ msg: "You entered the safe zone — alerts paused.", ok: true });
        markSafe();
      } else if (status === "safe" && !isInside) {
        setToast({ msg: "You left the safe zone — alerting contacts.", ok: false });
        beginAlerting();
      }
    }
  }, [status, geo.position, markSafe, beginAlerting]);

  const canStart = useMemo(() => !!target && validContacts.length > 0 && !!parseMeetingTime(meetingTime), [target, validContacts, meetingTime]);

  const handleStart = useCallback(async () => {
    if (!target) return;
    const deadline = parseMeetingTime(meetingTime); if (!deadline) return;
    targetRef.current = target; meetingTimeRef.current = meetingTime;
    contactsRef.current = contacts; userNameRef.current = userName.trim();
    testModeRef.current = testMode; radiusRef.current = radius;
    setEmailLogs([]); setNextEmailAt(null); setArmedDeadline(deadline); setToast(null); setStatus("armed");
    geo.startWatching();
    try { await wake.request(); } catch { /* optional */ }
    if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
    deadlineTimerRef.current = setTimeout(runCheck, Math.max(0, deadline.getTime() - Date.now()));
  }, [contacts, geo, meetingTime, radius, runCheck, target, testMode, userName, wake]);

  const handleStop = useCallback(() => {
    clearTimers(); geo.stopWatching(); wake.release();
    setStatus("idle"); setNextEmailAt(null); setArmedDeadline(null); setToast(null);
  }, [clearTimers, geo, wake]);

  useEffect(() => () => {
    if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
    if (emailTimerRef.current) clearInterval(emailTimerRef.current);
  }, []);

  const emailsSent = emailLogs.filter(l => l.ok).length;
  const lastEmail = emailLogs[emailLogs.length - 1];
  const updateContact = (i: number, v: string) => setContacts(p => { const n = [...p]; n[i] = v; return n; });

  return (
    <div className="mx-auto w-full">
      {toast && (
        <div className={`mb-4 fade-up flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm ${toast.ok ? "border-green-500/25 bg-[color:var(--safe-soft)] text-green-700 dark:text-green-400" : "border-red-500/25 bg-[color:var(--danger-soft)] text-red-600"}`}>
          {toast.ok ? "✓" : "⚠"} {toast.msg}
        </div>
      )}

      {status === "idle" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
          <div className="order-2 lg:order-1 fade-up fade-up-2">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--muted)" }}>Meeting location</p>
            <MapPicker
              selectedLocation={target ? { lat: target.lat, lng: target.lng } : null}
              onLocationSelected={(lat, lng, addr) => setTarget({ lat, lng, address: addr })}
              radiusMeters={radius}
              onRadiusChange={setRadius}
            />
            {target && <p className="mt-2 truncate text-xs" style={{ color: "var(--muted)" }}>📍 <span style={{ color: "var(--foreground)" }}>{target.address}</span></p>}
          </div>

          <aside className="order-1 space-y-3 lg:order-2 fade-up fade-up-1">
            <div className="card p-4">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--accent-soft)" }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" style={{ fill: "var(--accent)" }}>
                    <path d="M12 1L3 5v6c0 5.25 3.75 10.15 9 11.25C17.25 21.15 21 16.25 21 11V5l-9-4z"/>
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-semibold leading-tight" style={{ fontFamily: "var(--font-display)" }}>New check-in</div>
                  <div className="text-[11px]" style={{ color: "var(--muted)" }}>Set up your safety session</div>
                </div>
              </div>

              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Meeting time</label>
              <input type="time" value={meetingTime} onChange={e => setMeetingTime(e.target.value)} className="input mb-3 w-full px-3 py-2 text-sm" required />

              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Your name <span className="font-normal normal-case tracking-normal">(optional)</span>
              </label>
              <input type="text" value={userName} onChange={e => setUserName(e.target.value)} placeholder="Alex" className="input mb-3 w-full px-3 py-2 text-sm" />

              <div className="mb-2 flex items-center justify-between">
                <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Emergency contacts</label>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>up to {MAX_CONTACTS}</span>
              </div>
              <div className="mb-2 space-y-1.5">
                {contacts.map((c, i) => {
                  const av = AVATAR_COLORS[i];
                  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.trim());
                  return (
                    <div key={i} className="contact-row">
                      <div className="contact-avatar" style={{ background: av.bg, color: av.color }}>
                        {c.trim() ? getInitial(c) : String(i + 1)}
                      </div>
                      <input
                        type="email" value={c} onChange={e => updateContact(i, e.target.value)}
                        placeholder={i === 0 ? "Primary contact email" : `Contact ${i + 1} (optional)`}
                        className="flex-1 bg-transparent text-sm focus:outline-none"
                        style={{ color: "var(--foreground)" }}
                      />
                      {valid && (
                        <svg viewBox="0 0 24 24" width="13" height="13" style={{ fill: "var(--safe)", flexShrink: 0 }}>
                          <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/>
                        </svg>
                      )}
                    </div>
                  );
                })}
              </div>
              {validContacts.length > 0 && (
                <p className="mb-3 text-[11px]" style={{ color: "var(--muted)" }}>
                  <span className="font-semibold" style={{ color: "var(--safe)" }}>{validContacts.length}</span> contact{validContacts.length !== 1 ? "s" : ""} will receive alerts
                </p>
              )}

              <label className="mb-3 flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--border)", background: "var(--card-2)" }}>
                <input type="checkbox" checked={testMode} onChange={e => setTestMode(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-[color:var(--accent)]" />
                <span>
                  <span className="text-xs font-medium">Test mode</span>
                  <span className="block text-[11px]" style={{ color: "var(--muted)" }}>Alerts every 30 s instead of 7 min</span>
                </span>
              </label>

              <button type="button" onClick={() => canStart && handleStart()} disabled={!canStart} className="btn-primary w-full rounded-xl px-4 py-3 text-sm">
                {canStart ? "Start SafetyNet →" : "Set location & contact to start"}
              </button>
              {geo.error && <p className="mt-2 text-xs text-red-400">{geo.error}</p>}
            </div>

            <div className="card p-4">
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>How it works</div>
              <div className="space-y-2">
                {[
                  ["📍", "Pin your meeting spot on the map"],
                  ["⏰", "Set the time you should arrive by"],
                  ["👥", "Add up to 5 trusted contacts"],
                  ["🛡️", "At deadline we check — if you're outside your safe zone, all contacts get alerted every 7 min"],
                ].map(([icon, text]) => (
                  <div key={String(text)} className="flex items-start gap-2 text-xs" style={{ color: "var(--muted)" }}>
                    <span className="shrink-0">{icon}</span>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
          <div className="order-2 lg:order-1 fade-up fade-up-2">
            {target && <>
              <ActiveMap target={{ lat: target.lat, lng: target.lng }} current={geo.position ? { lat: geo.position.lat, lng: geo.position.lng } : null} radiusMeters={radius} />
              <p className="mt-2 truncate text-xs" style={{ color: "var(--muted)" }}>📍 <span style={{ color: "var(--foreground)" }}>{target.address}</span></p>
            </>}
          </div>

          <aside className="order-1 space-y-3 lg:order-2 fade-up fade-up-1">
            <div className="card overflow-hidden">
              <div className="p-4">
                <StatusHeader status={status} armedDeadline={armedDeadline} now={now} />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Stat label="Distance" value={distance != null ? fmtDist(distance) : "—"} />
                  <Stat label="Next alert" value={status === "alerting" && nextEmailAt != null ? fmtCountdown(nextEmailAt - now) : "—"} />
                  <Stat label="Alerts sent" value={String(emailsSent)} />
                  <Stat label="Last alert" value={lastEmail ? (lastEmail.ok ? "Sent ✓" : "Failed") : "—"} tone={lastEmail ? (lastEmail.ok ? "ok" : "err") : undefined} hint={lastEmail && !lastEmail.ok ? lastEmail.error : undefined} />
                </div>

                <div className="mt-3 rounded-xl border p-2.5" style={{ borderColor: "var(--border)", background: "var(--card-2)" }}>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Alerting contacts</div>
                  <div className="flex flex-wrap gap-1.5">
                    {contactsRef.current.filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())).map((e, i) => {
                      const av = AVATAR_COLORS[i];
                      return (
                        <span key={i} className="chip text-[10px]">
                          <span className="contact-avatar" style={{ width: 16, height: 16, fontSize: 9, background: av.bg, color: av.color }}>{getInitial(e)}</span>
                          {e.split("@")[0]}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <span className="chip">
                    <span className={`h-1.5 w-1.5 rounded-full`} style={{ background: wake.isLocked ? "var(--safe)" : "var(--muted)" }} />
                    Wake {wake.isLocked ? "on" : "off"}
                  </span>
                  <span className="chip">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: geo.isWatching ? "var(--safe)" : "var(--muted)" }} />
                    GPS {geo.isWatching ? "on" : "idle"}
                  </span>
                  {geo.position && <span className="chip">±{Math.round(geo.position.accuracy)} m</span>}
                </div>
                {geo.error && <p className="mt-2 text-xs text-red-400">{geo.error}</p>}
              </div>

              <button type="button" onClick={handleStop} className="btn-danger flex w-full items-center justify-center gap-2 px-4 py-3.5 text-sm tracking-widest border-t-0 rounded-t-none">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>
                STOP TRACKING
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function StatusHeader({ status, armedDeadline, now }: { status: Status; armedDeadline: Date | null; now: number }) {
  let label = "", sub = "", tone: "armed"|"check"|"alert"|"safe" = "armed";
  switch (status) {
    case "armed": {
      const rem = armedDeadline ? armedDeadline.getTime() - now : 0;
      label = "Armed & watching";
      sub = `Until ${armedDeadline?.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) ?? "—"} · ${fmtCountdown(Math.max(0,rem))}`;
      tone = "armed"; break;
    }
    case "checking": label = "Checking location…"; sub = "Reading your GPS position"; tone = "check"; break;
    case "alerting": label = "Outside safe zone"; sub = "Emailing all contacts with your location"; tone = "alert"; break;
    case "safe": label = "Inside safe zone"; sub = "Tracking continues if you leave"; tone = "safe"; break;
  }
  const styles = {
    armed: { bg: "var(--accent-soft)", color: "var(--accent)", border: "rgba(14,164,114,0.2)" },
    check: { bg: "var(--warn-soft)", color: "var(--warn)", border: "rgba(217,119,6,0.2)" },
    alert: { bg: "var(--danger-soft)", color: "var(--danger)", border: "rgba(220,38,38,0.2)" },
    safe:  { bg: "var(--safe-soft)", color: "var(--safe)", border: "rgba(14,164,114,0.2)" },
  }[tone];
  return (
    <div className="rounded-xl border px-3.5 py-2.5" style={{ background: styles.bg, color: styles.color, borderColor: styles.border }}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        {tone === "alert" ? <span className="pulse-dot red" />
          : tone === "safe" ? <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>
          : <span className={`pulse-dot ${tone === "check" ? "amber" : ""}`} />}
        {label}
      </div>
      <div className="mt-0.5 text-[11px] opacity-75">{sub}</div>
    </div>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: "ok"|"err"; hint?: string }) {
  return (
    <div className="card-inner p-2.5" title={hint}>
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="mt-1 text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: tone === "ok" ? "var(--safe)" : tone === "err" ? "var(--danger)" : "var(--foreground)" }}>
        {value}
      </div>
    </div>
  );
}