import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Timeline } from "@/components/timeline";
import { Notice, Progress, StatusPill } from "@/components/status";
import { campaignTimeline, campaignView } from "@/lib/campaigns";
import { formatInt, formatWhen, formatMoney, satsToFiat } from "@/lib/format";
import { familyTokenHash } from "@/lib/secrets";
import { store } from "@/lib/store";
import { ConfirmButton } from "./confirm-button";

export const metadata = { title: "Family page", robots: { index: false, follow: false } };

export default function FamilyPage({ params }: PageProps<"/family/[token]">) {
  return (
    <Suspense fallback={<div className="container-page min-h-[60vh]" />}>
      <Family params={params} />
    </Suspense>
  );
}

async function Family({ params }: { params: PageProps<"/family/[token]">["params"] }) {
  await connection();
  const { token } = await params;
  const c = await store.getCampaignByFamilyTokenHash(familyTokenHash(token));
  if (!c) notFound();
  const v = await campaignView(c);
  const entries = await campaignTimeline(v);
  const money = (n: number) => formatMoney(n, c.currency);
  const sats = (s: number) => money(satsToFiat(s, v.rate.fiatPerBtc));
  const toConfirm = v.withdrawals.filter((w) => w.status === "sent" && !w.familyConfirmedAt);

  return (
    <div className="container-page max-w-4xl py-12">
      <p className="eyebrow">Private family page · don&apos;t share this link</p>
      <h1 className="mt-3 text-[2.3rem]">{c.title}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <StatusPill status={c.status} />
        <span className="text-[0.9rem] text-ink-3">{v.hospital.name} · bill {c.billReference}</span>
      </div>

      <div className="mt-6 space-y-3">
        {c.status === "pending_verification" && (
          <Notice>
            Waiting for {v.hospital.name} to confirm the bill. We&apos;ll email {c.campaignerEmail} when
            it&apos;s live.
          </Notice>
        )}
        {c.status === "rejected" && (
          <Notice tone="error">
            The hospital could not confirm this bill{c.rejectionReason ? `: ${c.rejectionReason}` : "."} Please
            check the reference with the billing office.
          </Notice>
        )}
        {c.status === "frozen" && (
          <Notice tone="error">This campaign is paused while Ireti reviews it. Its balance is safe and locked.</Notice>
        )}
      </div>

      {c.status !== "pending_verification" && c.status !== "rejected" && (
        <>
          <section className="mt-8 rounded-[24px] bg-white p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[1.8rem]">{money(v.raised)}</p>
              <p className="text-ink-3">of {money(c.goalAmount)}</p>
            </div>
            <div className="mt-3"><Progress percent={v.percent} label={`${v.percent}% raised`} /></div>
            <dl className="mt-5 grid grid-cols-3 gap-4 text-[0.95rem]">
              <div><dt className="text-ink-3">Donations</dt><dd className="font-semibold">{v.totals.donorCount}</dd></div>
              <div><dt className="text-ink-3">Paid to hospital</dt><dd className="font-semibold">{sats(v.totals.withdrawnSats)}</dd></div>
              <div><dt className="text-ink-3">In escrow</dt><dd className="font-semibold">{sats(v.totals.availableSats)}</dd></div>
            </dl>
            <p className="mt-5 text-[0.9rem]">
              Public page:{" "}
              <Link className="text-green underline underline-offset-4" href={`/c/${c.slug}`}>/c/{c.slug}</Link>
            </p>
          </section>

          {toConfirm.length > 0 && (
            <section className="mt-8">
              <h2 className="text-[1.5rem]">Please confirm with the hospital</h2>
              <p className="mt-1 text-ink-2">
                Ask the billing office whether each payment below was credited to the bill. Your
                confirmation is shown publicly, so donors know.
              </p>
              <ul className="mt-5 space-y-3">
                {toConfirm.map((w) => (
                  <li key={w.id} className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-line bg-card p-4">
                    <div>
                      <p className="font-medium">{money(satsToFiat(w.amountSats, w.fiatPerBtcAtWithdrawal))} withdrawn</p>
                      <p className="text-[0.88rem] text-ink-3">{formatInt(w.amountSats)} sats · {w.sentAt ? formatWhen(w.sentAt) : ""}</p>
                    </div>
                    <ConfirmButton token={token} withdrawalId={w.id} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-10">
            <h2 className="text-[1.5rem]">Everything that has happened</h2>
            <div className="mt-6">
              <Timeline entries={entries} fiatPerBtc={v.rate.fiatPerBtc} currency={c.currency} hospitalName={v.hospital.name} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
