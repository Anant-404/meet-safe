import { TrackingPanel } from "@/components/TrackingPanel";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="sticky top-0 z-30 glass">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/30">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
                <path d="M12 2c-4.4 0-8 3.5-8 7.9 0 5.7 7.1 11.5 7.4 11.7.2.2.6.2.8 0 .3-.2 7.8-6 7.8-11.7C20 5.5 16.4 2 12 2zm0 10.8a2.9 2.9 0 1 1 0-5.8 2.9 2.9 0 0 1 0 5.8z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">Safety Check-In</div>
              <div className="text-xs text-[color:var(--muted)]">
                Meeting safety companion
              </div>
            </div>
          </div>
          <a
            href="#how"
            className="chip hidden sm:inline-flex"
            aria-label="How it works"
          >
            <span className="pulse-dot" />
            Live location • Email fallback
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <TrackingPanel />
      </main>

      <footer
        id="how"
        className="mx-auto w-full max-w-6xl px-4 pb-8 text-center text-xs text-[color:var(--muted)] sm:px-6"
      >
        Location stays on your device. Emails only fire if you don&apos;t arrive.
      </footer>
    </div>
  );
}
