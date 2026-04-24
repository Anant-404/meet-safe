import { TrackingPanel } from "@/components/TrackingPanel";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="sticky top-0 z-30 glass border-b border-[color:var(--border)]">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
              style={{ background: "var(--accent)" }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M12 1L3 5v6c0 5.25 3.75 10.15 9 11.25C17.25 21.15 21 16.25 21 11V5l-9-4zm-1 13l-3-3 1.41-1.41L11 11.17l4.59-4.58L17 8l-6 6z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 600 }} className="text-sm leading-tight">
                SafetyNet
              </div>
              <div className="text-[10px] leading-tight" style={{ color: "var(--muted)" }}>
                Personal safety companion
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden sm:flex items-center gap-2">
              <span className="chip">
                <span className="pulse-dot" />
                Location private
              </span>
              <span className="chip">Email fallback</span>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6">
        <TrackingPanel />
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-5 text-center text-[10px] sm:px-6" style={{ color: "var(--muted)" }}>
        Your location never leaves your device · Emails only fire if you don&apos;t arrive
      </footer>
    </div>
  );
}