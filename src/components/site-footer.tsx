import Link from "next/link";
import { Logo } from "./site-header";

const links = [
  ["Campaigns", "/campaigns"],
  ["Start a fundraiser", "/start"],
  ["Transparency", "/transparency"],
  ["For hospitals", "/hospital"],
  ["Questions", "/#faq"],
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="container-page flex flex-col gap-8 py-10 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-3 text-[0.92rem] text-ink-2">
            Ireti means hope. Every naira goes to a verified hospital, with a public receipt.
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-2 text-[0.92rem] text-ink-2 sm:grid-cols-3">
          {links.map(([label, href]) => (
            <Link key={href} href={href} className="hover:text-ink hover:underline">
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="container-page pb-8 text-[0.85rem] text-ink-3">© 2026 Ireti. Pilot service.</p>
    </footer>
  );
}
