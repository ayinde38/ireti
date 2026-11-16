import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CampaignCard } from "@/components/campaign-card";
import { listPublicCampaigns } from "@/lib/campaigns";
import { formatInt, formatMoney, satsToFiat, shortHash } from "@/lib/format";
import { getRate } from "@/lib/rates";
import { photos, unsplashUrl } from "@/lib/photos";
import { transparencyData } from "@/lib/transparency";

const journey = [
  {
    who: "Family",
    title: "Opens a fundraiser",
    body: "They pick the hospital and enter the bill reference. No diagnosis is asked for.",
  },
  {
    who: "Hospital",
    title: "Confirms the bill",
    body: "The billing office checks the reference and amount. Only then does the page go live.",
  },
  {
    who: "You",
    title: "Give from any wallet",
    body: "Scan the code with a Bitcoin Lightning wallet. Your gift waits in that campaign's escrow.",
  },
  {
    who: "Hospital",
    title: "Withdraws and posts a receipt",
    body: "Payouts go only to the hospital's own account, and the receipt appears on the page.",
  },
];

const faqs = [
  {
    q: "Does the money ever go to the family?",
    a: "No. Donations wait in escrow for that campaign, and only the hospital that confirmed the bill can withdraw them, to its own verified account.",
  },
  {
    q: "Why Bitcoin?",
    a: "Most crowdfunding platforms don't operate across Africa, and international cards are often declined. The Lightning network lets someone in London, Lagos or Nairobi give the price of a meal in seconds for almost no fee, and every payment carries a proof that cannot be faked.",
  },
  {
    q: "I don't have Bitcoin. Can I still give?",
    a: "Yes. Apps such as Strike, Cash App and Wallet of Satoshi let you buy and send in a minute. Scan the code on the campaign page with the app.",
  },
  {
    q: "How do I know the money is really there?",
    a: "Every donation and withdrawal is listed on the campaign page with its payment proof, and the transparency page compares our wallet balance with what campaigns are owed every hour.",
  },
  {
    q: "What if a campaign doesn't reach its goal?",
    a: "What was raised stays in escrow for the same hospital to use for that patient's care, with a receipt posted the same way.",
  },
];

export default function Home() {
  return (
    <>
      {/* Hero: the promise on the left, a live receipt on the right */}
      <section className="container-page grid gap-12 pb-6 pt-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:pt-16">
        <div>
          <p className="label-mono text-ink-3">Medical fundraising · Across Africa</p>
          <h1 className="display mt-4 text-[2.7rem] sm:text-[3.9rem] lg:text-[4.6rem]">
            Help pay a hospital bill. <span className="mark">Follow every payment.</span>
          </h1>
          <p className="mt-6 max-w-lg text-[1.1rem] leading-relaxed text-ink-2">
            On Ireti, donations go only to the hospital that confirmed the bill. Never to the
            family, never to us. Each payment gets a public receipt.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/campaigns" className="btn btn-primary">
              Give to a campaign
            </Link>
            <Link href="/start" className="btn btn-ghost">
              Raise money for a bill
            </Link>
          </div>
          <p className="mt-6 text-[0.9rem] text-ink-3">
            Works with Strike, Cash App, Phoenix, Wallet of Satoshi and any other Lightning wallet.
          </p>
        </div>

        <div className="relative">
          <div className="relative aspect-[5/4] overflow-hidden rounded-[24px] bg-sand lg:aspect-[4/5]">
            <Image
              src={unsplashUrl(photos.motherAndChild.id, 1400)}
              alt={photos.motherAndChild.alt}
              fill
              priority
              className="object-cover object-[28%_50%]"
              sizes="(min-width: 1024px) 45vw, 100vw"
            />
          </div>
          <Suspense fallback={null}>
            <HeroSlip />
          </Suspense>
        </div>
      </section>

      {/* Live numbers */}
      <section className="mt-16 bg-indigo text-indigo-ink">
        <Suspense fallback={<div className="h-[136px]" />}>
          <Numbers />
        </Suspense>
      </section>

      {/* Campaigns */}
      <section className="container-page pt-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="display text-[2.1rem] sm:text-[2.8rem]">Raising now</h2>
            <p className="mt-2 text-ink-2">Each campaign is tied to a bill its hospital has confirmed.</p>
          </div>
          <Link href="/campaigns" className="font-semibold underline decoration-sun decoration-2 underline-offset-4">
            See all campaigns
          </Link>
        </div>
        <Suspense fallback={<div className="mt-8 h-[340px]" />}>
          <LiveCampaigns />
        </Suspense>
      </section>

      {/* Journey of one donation */}
      <section id="how-it-works" className="container-page scroll-mt-24 pt-24">
        <h2 className="display max-w-2xl text-[2.1rem] sm:text-[2.8rem]">
          The path of one donation, <span className="mark">start to receipt.</span>
        </h2>
        <ol className="mt-12 grid md:grid-cols-4">
          {journey.map((s, i) => (
            <li
              key={s.title}
              className="relative border-l-2 border-indigo pb-10 pl-7 last:pb-0 md:border-l-0 md:border-t-2 md:pb-0 md:pl-0 md:pr-8 md:pt-8"
            >
              <span className="absolute -left-[9px] top-0 h-4 w-4 rounded-full bg-sun ring-4 ring-paper md:-top-[9px] md:left-0" aria-hidden="true" />
              <p className="label-mono text-ink-3">
                {String(i + 1).padStart(2, "0")} · {s.who}
              </p>
              <h3 className="mt-2 text-[1.3rem] tracking-[-0.02em]">{s.title}</h3>
              <p className="mt-2 text-[0.97rem] text-ink-2">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Proof, with live data */}
      <section className="container-page pt-24">
        <h2 className="display max-w-2xl text-[2.1rem] sm:text-[2.8rem]">
          Don&apos;t take our word for it. <span className="mark">Check.</span>
        </h2>
        <Suspense fallback={<div className="mt-10 h-[420px]" />}>
          <Proof />
        </Suspense>
      </section>

      {/* Hospitals */}
      <section className="container-page pt-24">
        <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
          <div className="relative aspect-[4/3] overflow-hidden rounded-[24px] bg-sand">
            <Image
              src={unsplashUrl(photos.surgeon.id, 1200)}
              alt={photos.surgeon.alt}
              fill
              className="object-cover object-[50%_22%]"
              sizes="(min-width: 768px) 48vw, 100vw"
            />
          </div>
          <div>
            <p className="label-mono text-ink-3">For hospitals</p>
            <h2 className="display mt-3 text-[2.1rem] sm:text-[2.8rem]">Fewer unpaid bills, no cash to handle.</h2>
            <ul className="mt-7 divide-y divide-line border-y border-line text-[1.02rem]">
              {[
                "Confirm or reject each bill from one dashboard",
                "See each campaign's escrow and withdraw whenever you choose",
                "Paid in bitcoin over Lightning now; local-currency bank payouts are coming",
                "No fees during the pilot",
              ].map((t) => (
                <li key={t} className="flex gap-3 py-3.5">
                  <span className="font-semibold text-green" aria-hidden="true">✓</span>
                  {t}
                </li>
              ))}
            </ul>
            <Link href="/hospital" className="btn btn-secondary mt-8">
              Hospital sign-in
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="container-page scroll-mt-24 pt-24">
        <div className="grid gap-10 md:grid-cols-[0.8fr_1.2fr]">
          <h2 className="display text-[2.1rem] sm:text-[2.8rem]">Common questions</h2>
          <div className="divide-y divide-line border-y border-line">
            {faqs.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[1.05rem] font-semibold [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <svg className="shrink-0 text-ink-3 transition-transform group-open:rotate-180" width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                </summary>
                <p className="mt-3 max-w-2xl text-ink-2">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Closing call */}
      <section className="container-page pt-24">
        <div className="flex flex-col items-start justify-between gap-8 rounded-[24px] bg-indigo p-8 text-indigo-ink sm:p-12 md:flex-row md:items-center">
          <div>
            <h2 className="display text-[2rem] sm:text-[2.6rem]">Someone&apos;s bill is waiting.</h2>
            <p className="mt-3 max-w-md text-indigo-muted">
              It takes about a minute, and the hospital sees your gift in seconds.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/campaigns" className="btn btn-primary">
              Find a campaign
            </Link>
            <Link href="/start" className="btn border-indigo-ink/30 text-indigo-ink hover:bg-indigo-ink/10">
              Start a fundraiser
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

/** A live paper receipt for the featured campaign: the real last few ledger lines. */
async function HeroSlip() {
  await connection();
  const all = await listPublicCampaigns();
  const v = all.find((x) => x.campaign.status === "live") ?? all[0];
  if (!v) return null;
  const rows = v.donations.slice(0, 3);
  return (
    <div className="slip-shadow relative mx-4 -mt-20 sm:absolute sm:bottom-6 sm:left-6 sm:mx-0 sm:mt-0 sm:w-[19rem] lg:-left-12">
      <div className="slip">
        <p className="font-semibold">{v.campaign.title}</p>
        <p className="text-ink-3">{v.hospital.name}</p>
        <p className="text-ink-3">Bill {v.campaign.billReference}</p>
        <div className="my-3 border-t border-dashed border-line-2" />
        {rows.map((d) => (
          <p key={d.id} className="flex justify-between gap-3">
            <span className="truncate">{d.donorName ?? "Anonymous"}</span>
            <span>{formatMoney(satsToFiat(d.amountSats, d.fiatPerBtcAtPayment ?? v.rate.fiatPerBtc), v.campaign.currency)}</span>
          </p>
        ))}
        <div className="my-3 border-t border-dashed border-line-2" />
        <p className="flex justify-between font-semibold">
          <span>In escrow</span>
          <span>{formatMoney(v.available, v.campaign.currency)}</span>
        </p>
        <p className="flex justify-between">
          <span>Paid to hospital</span>
          <span>{formatMoney(v.withdrawn, v.campaign.currency)}</span>
        </p>
        <p className="flex justify-between">
          <span>Paid to family</span>
          <span>{formatMoney(0, v.campaign.currency)}</span>
        </p>
        <p className="mt-3 text-green">✓ Bill confirmed by hospital</p>
      </div>
    </div>
  );
}

async function Numbers() {
  await connection();
  const all = await listPublicCampaigns();
  const usdRate = await getRate("USD");
  const usd = (s: number) => formatMoney(satsToFiat(s, usdRate.fiatPerBtc), "USD");
  const items = [
    [usd(all.reduce((s, v) => s + v.totals.withdrawnSats, 0)), "paid directly to hospitals"],
    [String(all.reduce((s, v) => s + v.totals.donorCount, 0)), "donations, each with a public proof"],
    [String(new Set(all.map((v) => v.hospital.id)).size), "partner hospitals"],
  ];
  return (
    <dl className="container-page grid gap-8 py-10 sm:grid-cols-3">
      {items.map(([n, l]) => (
        <div key={l}>
          <dt className="sr-only">{l}</dt>
          <dd className="font-[family-name:var(--font-display)] text-[2.4rem] font-extrabold leading-none tracking-[-0.04em] text-sun">{n}</dd>
          <dd className="mt-2 text-[0.95rem] text-indigo-muted">{l}</dd>
        </div>
      ))}
    </dl>
  );
}

async function LiveCampaigns() {
  await connection();
  const all = await listPublicCampaigns();
  const open = all.filter((v) => v.campaign.status === "live" || v.campaign.status === "funded");
  const list = [...open, ...all.filter((v) => !open.includes(v))].slice(0, 3);
  if (list.length === 0) {
    return (
      <p className="mt-8 rounded-[20px] border border-line bg-white p-8 text-ink-2">
        No campaigns are live yet. The first one appears here as soon as a hospital confirms its bill.
      </p>
    );
  }
  return (
    <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {list.map((v) => (
        <CampaignCard key={v.campaign.id} v={v} />
      ))}
    </div>
  );
}

async function Proof() {
  await connection();
  const [all, t] = await Promise.all([listPublicCampaigns(), transparencyData()]);
  const usdRate = await getRate("USD");
  const usd = (s: number) => formatMoney(satsToFiat(s, usdRate.fiatPerBtc), "USD");
  const donations = all.flatMap((v) => v.donations);
  const withdrawals = all.flatMap((v) => v.withdrawals.filter((w) => w.status === "sent"));
  const withReceipt = withdrawals.filter((w) => w.receiptUploadedAt).length;
  const latest = [...donations].sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""))[0];
  const snap = t.latest;
  const backed = !snap || snap.differenceSats >= 0;

  return (
    <div className="mt-10 grid gap-4 lg:grid-cols-3">
      <article className="rounded-[24px] bg-indigo p-7 text-indigo-ink sm:p-9 lg:col-span-2">
        <p className="label-mono text-sun">Proof of reserves · checked hourly</p>
        <h3 className="mt-3 text-[1.7rem] tracking-[-0.03em]">
          {backed ? "The escrow wallet holds everything campaigns are owed." : "Shortfall detected. The team has been alerted."}
        </h3>
        <dl className="mt-8 grid gap-6 sm:grid-cols-2">
          <div>
            <dt className="text-[0.9rem] text-indigo-muted">Owed to all campaigns</dt>
            <dd className="mt-1 font-[family-name:var(--font-display)] text-[2rem] font-extrabold tracking-[-0.04em]">{usd(t.ledgerTotalSats)}</dd>
            <dd className="font-[family-name:var(--font-mono)] text-[0.8rem] text-indigo-muted">{formatInt(t.ledgerTotalSats)} sats</dd>
          </div>
          <div>
            <dt className="text-[0.9rem] text-indigo-muted">In the escrow wallet</dt>
            <dd className="mt-1 font-[family-name:var(--font-display)] text-[2rem] font-extrabold tracking-[-0.04em]">{snap ? usd(snap.walletBalanceSats) : "—"}</dd>
            <dd className="font-[family-name:var(--font-mono)] text-[0.8rem] text-indigo-muted">{snap ? `${formatInt(snap.walletBalanceSats)} sats` : ""}</dd>
          </div>
        </dl>
        <Link href="/transparency" className="mt-8 inline-block font-semibold underline decoration-sun decoration-2 underline-offset-4">
          Open the transparency report
        </Link>
      </article>

      <article className="flex flex-col rounded-[24px] bg-sun p-7 sm:p-9">
        <p className="label-mono">Sats paid to families or to us</p>
        <p className="mt-2 font-[family-name:var(--font-display)] text-[5.5rem] font-extrabold leading-none tracking-[-0.06em]">0</p>
        <p className="mt-auto pt-6 text-[1.02rem]">
          Withdrawals can only go to the hospital that confirmed the bill.
        </p>
      </article>

      <article className="rounded-[24px] border border-line bg-white p-7">
        <p className="font-[family-name:var(--font-display)] text-[2.2rem] font-extrabold tracking-[-0.04em]">
          {donations.length + withdrawals.length}
        </p>
        <h3 className="mt-1 text-[1.15rem] tracking-[-0.01em]">ledger entries, none edited</h3>
        <p className="mt-2 text-[0.95rem] text-ink-2">Entries are only ever added. The database itself refuses changes and deletions.</p>
      </article>

      <article className="rounded-[24px] border border-line bg-white p-7">
        <p className="font-[family-name:var(--font-display)] text-[2.2rem] font-extrabold tracking-[-0.04em]">
          {withReceipt} of {withdrawals.length}
        </p>
        <h3 className="mt-1 text-[1.15rem] tracking-[-0.01em]">withdrawals have a receipt</h3>
        <p className="mt-2 text-[0.95rem] text-ink-2">Any payout still waiting for its receipt is flagged in amber on the campaign page.</p>
      </article>

      <article className="rounded-[24px] border border-line bg-white p-7">
        <p className="hash text-ink-3">{latest ? shortHash(latest.paymentHash) : ""}</p>
        <h3 className="mt-2 text-[1.15rem] tracking-[-0.01em]">Verify a payment yourself</h3>
        <p className="mt-2 text-[0.95rem] text-ink-2">Every donation has a proof you can check in your browser.</p>
        {latest && (
          <Link href={`/d/${latest.paymentHash}`} className="mt-3 inline-block font-semibold underline decoration-sun decoration-2 underline-offset-4">
            Check the latest donation
          </Link>
        )}
      </article>
    </div>
  );
}
