import Link from "next/link";
import { network } from "@/lib/lightning";

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

const nav = [
  { href: "/campaigns", label: "Campaigns", show: "sm:block" },
  { href: "/#how-it-works", label: "How it works", show: "lg:block" },
  { href: "/transparency", label: "Transparency", show: "md:block" },
  { href: "/hospital", label: "For hospitals", show: "md:block" },
];

export function SiteHeader() {
  const net = network();
  const demo = net === "demo";
  const notice = demo
    ? ["Demo", "Sample hospitals and campaigns. No real money moves."]
    : net === "mutinynet"
      ? ["Test network", "Payments use Mutinynet test coins, which have no value."]
      : null;
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur">
      {notice && (
        <div className="bg-ink text-[0.8125rem] text-paper">
          <p className="container-page py-1.5">
            <span className="font-semibold text-sun">{notice[0]}</span>
            <span className="opacity-80"> · {notice[1]}</span>
          </p>
        </div>
      )}
      <div className="container-page flex h-[68px] items-center justify-between gap-6">
        <Link href="/" aria-label="Ireti home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={`hidden px-3 py-2 text-[0.95rem] font-medium text-ink-2 hover:text-ink ${n.show}`}>
              {n.label}
            </Link>
          ))}
          <Link href="/start" className="btn btn-secondary ml-2 !min-h-11 !px-4 !py-2 text-[0.92rem]">
            Start a fundraiser
          </Link>
        </nav>
      </div>
    </header>
  );
}
