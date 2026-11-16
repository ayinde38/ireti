"use client";

import { ChevronDownIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

/**
 * Long text, clamped to a few lines with a "Show more" toggle. The toggle
 * appears only when the text is actually cut off, so nothing is hidden silently.
 */
export function ExpandableText({ text, lines = 5, className = "" }: { text: string; lines?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setClipped(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  const paragraphs = text.split(/\n+/);
  return (
    <div className={className}>
      <div className="relative">
        <div
          ref={ref}
          className="space-y-3 leading-relaxed"
          // Height-based clamp: works across several paragraphs, unlike line-clamp.
          style={open ? undefined : { maxHeight: `${lines * 1.625}em`, overflow: "hidden" }}
        >
          {paragraphs.map((p, i) => (
            <p key={i} className="whitespace-pre-wrap wrap-break-word">{p}</p>
          ))}
        </div>
        {!open && clipped && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-white to-transparent" aria-hidden="true" />
        )}
      </div>
      {(clipped || open) && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="mt-2 inline-flex items-center gap-1 text-[0.92rem] font-semibold text-indigo underline-offset-4 hover:underline"
        >
          {open ? "Show less" : "Show more"}
          <ChevronDownIcon className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    </div>
  );
}
