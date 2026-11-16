export function ShareLinks({ url, title }: { url: string; title: string }) {
  const text = `${title} — every naira goes straight to the hospital, with a public receipt.`;
  const links = [
    { label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}` },
    { label: "X", href: `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
  ];
  return (
    <div className="rounded-[24px] bg-white p-4">
      <p className="text-[0.9rem] font-medium">Share this campaign</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {links.map((l) => (
          <a
            key={l.label}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center rounded-md border border-line-2 px-4 text-[0.9rem] hover:bg-paper-2"
          >
            {l.label}
          </a>
        ))}
      </div>
    </div>
  );
}
