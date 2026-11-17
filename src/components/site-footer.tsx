import { ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";
import { network } from "@/lib/lightning";

const columns = [
  {
    title: "Give",
    links: [
      ["Campaigns", "/campaigns"],
      ["How it works", "/#how-it-works"],
      ["Questions", "/#faq"],
    ],
  },
  {
    title: "Raise",
    links: [
      ["Start a fundraiser", "/start"],
      ["For hospitals", "/hospital"],
      ["Register a hospital", "/hospital/register"],
    ],
  },
  {
    title: "Trust",
    links: [
      ["Transparency report", "/transparency"],
      ["Proof of reserves", "/transparency"],
    ],
  },
] as const;

function Mark() {
  return (
    <svg width="36" height="36" viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="8" fill="rgba(255,255,255,0.08)" />
      <path d="M7 18.5h14" stroke="var(--sun)" strokeWidth="2" strokeLinecap="round" />
      <path d="M9.5 18.5a4.5 4.5 0 0 1 9 0" fill="var(--sun)" />
    </svg>
  );
}

export function SiteFooter() {
  const testNet = network() === "mutinynet";
  return (
    <footer className="mt-24 bg-indigo text-indigo-ink">
      <div className="container-page grid gap-12 pb-10 pt-16 lg:grid-cols-[1.3fr_2fr]">
        <div className="max-w-sm">
          <Link href="/" aria-label="Ireti home" className="inline-flex items-center gap-3">
            <Mark />
            <span className="font-[family-name:var(--font-display)] text-[1.6rem] font-bold tracking-[-0.03em]">Ireti</span>
          </Link>
          <p className="mt-4 text-[0.98rem] text-indigo-muted">
            <span className="text-sun">Ireti</span> is Yoruba for hope. Medical fundraising on Bitcoin&apos;s Lightning
            Network: every donation goes to a verified hospital, with a public receipt.
          </p>
          <Link
            href="/start"
            className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-sun px-5 py-2.5 text-[0.92rem] font-semibold text-ink transition-transform hover:-translate-y-0.5"
          >
            Start a fundraiser
            <ArrowUpRightIcon className="size-4" aria-hidden="true" />
          </Link>
        </div>

        <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {columns.map((c) => (
            <div key={c.title}>
              <p className="label-mono text-sun">{c.title}</p>
              <ul className="mt-4 space-y-2.5">
                {c.links.map(([label, href]) => (
                  <li key={label}>
                    <Link href={href} className="text-[0.95rem] text-indigo-ink/85 transition-colors hover:text-sun">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-3 py-6 text-[0.85rem] text-indigo-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © 2026 Ireti · Built in Kaduna, Nigeria
            {testNet && <span> · Pilot on the Mutinynet test network</span>}
          </p>
          <a
            href="https://github.com/ayinde38/ireti"
            className="inline-flex items-center gap-1 hover:text-sun"
            target="_blank"
            rel="noreferrer"
          >
            Source on GitHub
            <ArrowUpRightIcon className="size-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  );
}
