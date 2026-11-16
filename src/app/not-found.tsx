import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page max-w-xl py-24 text-center">
      <p className="eyebrow">Not found</p>
      <h1 className="mt-3 text-[2.6rem] tracking-[-0.045em]">We couldn&apos;t find that page.</h1>
      <p className="mt-3 text-ink-2">
        The campaign may not be verified yet, or the link may be mistyped.
      </p>
      <Link href="/campaigns" className="btn btn-secondary mt-8">
        Browse campaigns
      </Link>
    </div>
  );
}
