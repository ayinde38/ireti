import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { VerifyProof } from "@/components/verify-proof";
import { campaignView } from "@/lib/campaigns";
import { formatInt, formatNgn, satsToNgn } from "@/lib/format";
import { store } from "@/lib/store";

export const metadata = { title: "Donation receipt", robots: { index: false } };

export default function ReceiptPage({ params }: PageProps<"/d/[hash]">) {
  return (
    <Suspense fallback={<div className="container-page min-h-[60vh]" />}>
      <Receipt params={params} />
    </Suspense>
  );
}

async function Receipt({ params }: { params: PageProps<"/d/[hash]">["params"] }) {
  await connection();
  const { hash } = await params;
  if (!/^[0-9a-f]{64}$/i.test(hash)) notFound();
  const d = await store.getDonationByHash(hash.toLowerCase());
  if (!d) notFound();
  const c = await store.getCampaign(d.campaignId);
  if (!c) notFound();
  const v = await campaignView(c);
  const rate = d.ngnPerBtcAtPayment ?? v.rate.ngnPerBtc;

  const rows: [string, React.ReactNode][] = [
    ["Amount", <>{formatNgn(satsToNgn(d.amountSats, rate))} <span className="text-ink-3">({formatInt(d.amountSats)} sats)</span></>],
    ["Status", d.status === "paid" ? "Paid into escrow" : d.status === "pending" ? "Waiting for payment" : "Expired, not paid"],
    ["Time", d.paidAt ? new Date(d.paidAt).toUTCString() : "—"],
    ["Campaign", <Link key="c" className="text-green underline underline-offset-4" href={`/c/${c.slug}`}>{c.title}</Link>],
    ["Held for", `${v.hospital.name}, ${v.hospital.city}`],
    ["From", d.donorName ?? "Anonymous"],
  ];

  return (
    <div className="container-page max-w-3xl py-12">
      <p className="eyebrow">Donation receipt</p>
      <h1 className="mt-3 text-[2.6rem] tracking-[-0.045em]">
        {d.status === "paid" ? "Your gift reached escrow." : "This donation was not completed."}
      </h1>
      <p className="mt-3 text-ink-2">
        Anyone with this link can see this receipt. It doesn&apos;t show your email, and it never
        will.
      </p>

      <div className="mt-8 rounded-[24px] bg-white">
        <dl className="divide-y divide-line">
          {rows.map(([k, val]) => (
            <div key={k} className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr]">
              <dt className="text-[0.9rem] text-ink-3">{k}</dt>
              <dd>{val}</dd>
            </div>
          ))}
          <div className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr]">
            <dt className="text-[0.9rem] text-ink-3">Payment hash</dt>
            <dd className="hash">{d.paymentHash}</dd>
          </div>
          {d.preimage && (
            <div className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr]">
              <dt className="text-[0.9rem] text-ink-3">Payment proof (preimage)</dt>
              <dd className="hash text-ink-2">{d.preimage}</dd>
            </div>
          )}
        </dl>
      </div>

      {d.status === "paid" && d.preimage && (
        <div className="mt-8">
          <VerifyProof preimage={d.preimage} paymentHash={d.paymentHash} />
        </div>
      )}

      <p className="mt-10 text-[0.95rem] text-ink-2">
        What happens next: when {v.hospital.name} withdraws from this campaign&apos;s escrow, the
        withdrawal and its receipt appear on the{" "}
        <Link className="text-green underline underline-offset-4" href={`/c/${c.slug}#timeline`}>
          campaign ledger
        </Link>
        .
      </p>
    </div>
  );
}
