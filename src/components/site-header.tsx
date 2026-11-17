import Link from "next/link";
import { network } from "@/lib/lightning";
import { Suspense } from "react";
import { SiteNav } from "./site-nav";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <rect width="28" height="28" rx="8" fill="var(--indigo)" />
        <path d="M7 18.5h14" stroke="var(--sun)" strokeWidth="2" strokeLinecap="round" />
        <path d="M9.5 18.5a4.5 4.5 0 0 1 9 0" fill="var(--sun)" />
      </svg>
      <span className="font-[family-name:var(--font-display)] text-[1.35rem] font-bold tracking-[-0.03em]">
        Ireti
      </span>
    </span>
  );
}

export function SiteHeader() {
  const net = network();
  const demo = net === "demo";
  const notice = demo
    ? ["Demo", "Sample hospitals and campaigns. No real money moves."]
    : net === "mutinynet"
      ? ["Test network", "Payments use Mutinynet test coins, which have no value."]
      : null;
  return (
    <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur-md">
      {notice && (
        <div className="bg-ink text-[0.8125rem] text-paper">
          <p className="container-page flex items-baseline gap-2 py-1.5">
            <span className="relative top-[-1px] inline-flex size-2 shrink-0 self-center" aria-hidden="true">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-sun opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex size-2 rounded-full bg-sun" />
            </span>
            <span>
              <span className="font-semibold text-sun">{notice[0]}</span>
              <span className="opacity-80"> · {notice[1]}</span>
            </span>
          </p>
        </div>
      )}
      {/* The nav reads the current path, which is only known at request time. */}
      <Suspense fallback={<StaticBar>{home}</StaticBar>}>
        <SiteNav>{home}</SiteNav>
      </Suspense>
    </header>
  );
}

const home = (
  <Link href="/" aria-label="Ireti home" className="shrink-0">
    <Logo />
  </Link>
);

/** Same height and layout as SiteNav, shown until it hydrates on dynamic routes. */
function StaticBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-transparent">
      <div className="container-page flex h-[72px] items-center justify-between gap-6">
        {children}
        <span className="hidden sm:block">
          <Link href="/start" className="btn btn-secondary !min-h-11 !px-4 !py-2 text-[0.92rem]">
            Start a fundraiser
          </Link>
        </span>
      </div>
    </div>
  );
}
