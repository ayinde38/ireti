import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DonatePanel } from "@/components/donate-panel";
import { ShareLinks } from "@/components/share-links";
import { Timeline } from "@/components/timeline";
import { Notice, Progress, StatusPill, VerifiedBadge } from "@/components/ui";
import { campaignTimeline, campaignView, canDonate, isPublic } from "@/lib/campaigns";
import { daysLeft, formatDate, formatInt, formatNgn } from "@/lib/format";
import { network } from "@/lib/lightning";
import { appUrl } from "@/lib/notify";
import { store } from "@/lib/store";

export async function generateMetadata({ params }: PageProps<"/c/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const c = await store.getCampaignBySlug(slug);
  if (!c || !(isPublic(c) || c.status === "frozen")) return { title: "Campaign not found" };
  return {
    title: c.title,
    description: `${c.story.split("\n")[0].slice(0, 150)}…`,
  };
}

export default function CampaignPage({ params }: PageProps<"/c/[slug]">) {
  return (
    <Suspense fallback={<div className="container-page min-h-[70vh] py-12" />}>
      <Campaign params={params} />
    </Suspense>
  );
}

async function Campaign({ params }: { params: PageProps<"/c/[slug]">["params"] }) {
  await connection();
  const { slug } = await params;
  const c = await store.getCampaignBySlug(slug);
  if (!c || !(isPublic(c) || c.status === "frozen")) notFound();

  const v = await campaignView(c);
  const entries = await campaignTimeline(v);
  const { hospital, totals, rate } = v;
  const open = canDonate(c);

  return (
    <div className="container-page py-10 md:py-14">
      <div className="grid gap-10 lg:grid-cols-[1fr_380px] lg:gap-x-14">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <div className="flex flex-wrap items-center gap-3 text-[0.9rem] text-ink-3">
            <StatusPill status={c.status} />
            <span>
              {hospital.name} · {hospital.city}, {hospital.state}
            </span>
          </div>
          <h1 className="mt-4 text-[2.4rem] sm:text-[3.2rem] tracking-[-0.045em]">{c.title}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <VerifiedBadge hospital={hospital.name} />
            <span className="text-[0.85rem] text-ink-3">Bill ref. {c.billReference}</span>
          </div>

          {c.status === "frozen" && (
            <div className="mt-6">
              <Notice tone="error">
                This campaign is paused while Ireti reviews it. Donations are closed and its escrow
                balance is locked until the review ends.
              </Notice>
            </div>
          )}

          <div className="prose-story mt-8 max-w-2xl text-[1.06rem] text-ink">
            {c.story.split(/\n+/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <p className="mt-6 text-[0.9rem] text-ink-3">
            Started by {c.campaignerName} on {formatDate(c.createdAt)}. Confirmed by the hospital on{" "}
            {c.verifiedAt ? formatDate(c.verifiedAt) : "—"}.
          </p>
        </div>

        {/* Donate column: right after the story on phones, sticky beside it on desktop */}
        <aside className="lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <div className="rounded-[24px] bg-white p-6">
            <p className="text-[2rem] leading-none">{formatNgn(v.raisedNgn)}</p>
            <p className="mt-2 text-[0.95rem] text-ink-2">raised of {formatNgn(c.goalNgn)} goal</p>
            <div className="mt-4">
              <Progress percent={v.percent} label={`${v.percent}% of goal raised`} />
            </div>
            <p className="mt-3 flex justify-between text-[0.9rem] text-ink-3">
              <span>{totals.donorCount} donations</span>
              {open && <span>{daysLeft(c.deadline)} days left</span>}
            </p>
            <div className="mt-6 border-t border-line pt-6">
              {open ? (
                <DonatePanel
                  slug={c.slug}
                  ngnPerBtc={rate.ngnPerBtc}
                  rateLive={rate.live}
                  network={network()}
                  patientName={c.patientDisplayName}
                />
              ) : (
                <p className="text-[0.95rem] text-ink-2">
                  {c.status === "frozen"
                    ? "Donations are closed while this campaign is reviewed."
                    : "This campaign has closed. Thank you to everyone who gave."}
                </p>
              )}
            </div>
          </div>
          <div className="mt-4">
            <ShareLinks url={`${appUrl()}/c/${c.slug}`} title={c.title} />
          </div>
        </aside>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">

          {/* Escrow summary */}
          <section aria-labelledby="escrow" className="rounded-[24px] bg-white p-6">
            <h2 id="escrow" className="text-[1.4rem]">Where the money is</h2>
            <p className="mt-1 text-[0.95rem] text-ink-2">
              Donations wait in escrow for this campaign only. Only {hospital.name} can withdraw them,
              and only to its own verified account.
            </p>
            <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-line pt-5">
              <div>
                <dt className="text-[0.85rem] text-ink-3">Raised</dt>
                <dd className="mt-1 text-[1.15rem] font-semibold">{formatNgn(v.raisedNgn)}</dd>
                <dd className="text-[0.8rem] text-ink-3">{formatInt(totals.raisedSats)} sats</dd>
              </div>
              <div>
                <dt className="text-[0.85rem] text-ink-3">Paid to hospital</dt>
                <dd className="mt-1 text-[1.15rem] font-semibold">{formatNgn(v.withdrawnNgn)}</dd>
                <dd className="text-[0.8rem] text-ink-3">{formatInt(totals.withdrawnSats)} sats</dd>
              </div>
              <div>
                <dt className="text-[0.85rem] text-ink-3">In escrow, today</dt>
                <dd className="mt-1 text-[1.15rem] font-semibold">{formatNgn(v.availableNgn)}</dd>
                <dd className="text-[0.8rem] text-ink-3">{formatInt(totals.availableSats)} sats</dd>
              </div>
            </dl>
            <p className="mt-4 text-[0.82rem] text-ink-3">
              Gifts and withdrawals are valued in naira at the moment they happened; the escrow at
              today&apos;s rate.
            </p>
            {v.receiptsPending > 0 && (
              <p className="mt-5 rounded-[20px] bg-gold-soft px-3 py-2 text-[0.9rem] text-ink">
                <strong className="font-semibold">
                  {v.receiptsPending} withdrawal{v.receiptsPending > 1 ? "s" : ""} awaiting a receipt.
                </strong>{" "}
                The hospital has been reminded to post it.
              </p>
            )}
          </section>

          {/* Timeline */}
          <section id="timeline" aria-labelledby="timeline-h" className="mt-12 scroll-mt-24">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="timeline-h" className="text-[1.6rem]">Every naira in and out</h2>
                <p className="mt-1 text-[0.95rem] text-ink-2">
                  The full ledger for this campaign. Entries are never edited or deleted.
                </p>
              </div>
              <p className="text-[0.9rem]">
                Download:{" "}
                <a className="font-medium text-green underline-offset-4 hover:underline" href={`/api/campaigns/${c.slug}/ledger?format=csv`}>
                  CSV
                </a>{" "}
                ·{" "}
                <a className="font-medium text-green underline-offset-4 hover:underline" href={`/api/campaigns/${c.slug}/ledger`}>
                  JSON
                </a>
              </p>
            </div>
            <div className="mt-8">
              <Timeline entries={entries} ngnPerBtc={rate.ngnPerBtc} hospitalName={hospital.name} />
            </div>
          </section>
        </div>

      </div>
    </div>
  );
}
