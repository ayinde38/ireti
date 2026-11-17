"use client";

import { ArrowRightIcon, MenuIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const nav = [
  { href: "/campaigns", label: "Campaigns" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/transparency", label: "Transparency" },
  { href: "/hospital", label: "For hospitals" },
];

function isActive(pathname: string, href: string) {
  if (href.startsWith("/#")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop links, mobile menu and the scrolled shadow for the sticky header. */
export function SiteNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (v: boolean) => setOpenOn(v ? pathname : null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close with Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className={`border-b transition-[box-shadow,border-color] duration-300 ${scrolled || open ? "border-line shadow-[0_8px_30px_-12px_rgba(22,27,51,0.18)]" : "border-transparent"}`}>
      <div className="container-page flex h-[72px] items-center justify-between gap-6">
        {children}
        <nav aria-label="Main" className="hidden items-center gap-1 rounded-full border border-line bg-white/70 p-1 md:flex">
          {nav.map((n) => {
            const active = isActive(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-4 py-2 text-[0.92rem] font-medium transition-colors ${
                  active ? "bg-indigo text-indigo-ink" : "text-ink-2 hover:bg-sand hover:text-ink"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <span className="hidden sm:block">
            <Link href="/start" className="btn btn-secondary group !min-h-11 !px-4 !py-2 text-[0.92rem]">
              Start a fundraiser
              <ArrowRightIcon className="ml-1.5 size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </span>
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-full border border-line bg-white md:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen(!open)}
          >
            {open ? <XIcon className="size-5" aria-hidden="true" /> : <MenuIcon className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-menu" aria-label="Mobile" className="container-page animate-[menu-in_.2s_ease-out] pb-5 md:hidden">
          <ul className="space-y-1 rounded-[20px] border border-line bg-white p-2">
            {nav.map((n) => {
              const active = isActive(pathname, n.href);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center justify-between rounded-[14px] px-4 py-3 text-[1rem] font-medium ${
                      active ? "bg-sand text-ink" : "text-ink-2 hover:bg-sand"
                    }`}
                  >
                    {n.label}
                    <ArrowRightIcon className="size-4 opacity-40" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link href="/start" onClick={() => setOpen(false)} className="btn btn-secondary mt-3 w-full">
            Start a fundraiser
          </Link>
        </nav>
      )}
    </div>
  );
}
