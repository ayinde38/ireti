import { randomUUID } from "node:crypto";
import { CheckIcon, Clock3Icon, LockIcon, XIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ExpandableText } from "@/components/expandable-text";
import { StatusPill } from "@/components/status";
import { currentHospitalUser } from "@/lib/auth";
import { campaignView, canWithdraw } from "@/lib/campaigns";
import { countryName, flag } from "@/lib/countries";
import { formatDate, formatInt, formatMoney, formatWhen, satsToFiat, shortHash } from "@/lib/format";
import { network, testHospitalWallet, walletKind } from "@/lib/lightning";
import { photos, unsplashUrl } from "@/lib/photos";
import { sampleData, store } from "@/lib/store";
import type { Hospital, HospitalUser } from "@/lib/types";
import { hospitalReview } from "@/lib/types";
import { signOut } from "./actions";
import { ReceiptForm, ReviewForm, SignInForm, WithdrawForm, type PayoutOption } from "./forms";

export const metadata = { title: "Hospital dashboard", robots: { index: false } };

export default function HospitalPage() {
  return (
    <Suspense fallback={<div className="container-page min-h-[70vh]" />}>
      <HospitalRoute />
    </Suspense>
  );
}

async function HospitalRoute() {
  await connection();
  const session = await currentHospitalUser();
  if (!session) return <SignIn />;
  if (!session.hospital.verified) return <UnderReview {...session} />;
  return <Dashboard {...session} />;
}

function Header({ user, hospital, children }: { user: HospitalUser; hospital: Hospital; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="eyebrow">Hospital dashboard</p>
        <h1 className="mt-2 text-[2.1rem]">{hospital.name}</h1>
        <p className="mt-1 text-[0.95rem] text-ink-3">
          {flag(hospital.country)} {hospital.city}, {countryName(hospital.country)} · Signed in as {user.name} ({user.email})
        </p>
        {children}
      </div>
      <form action={signOut}>
        <button className="btn btn-ghost">Sign out</button>
      </form>
    </div>
  );
}

/** A registered hospital waiting for Ireti: what happens next, and what it sent. */
function UnderReview({ user, hospital }: { user: HospitalUser; hospital: Hospital }) {
  const rejected = hospitalReview(hospital) === "rejected";
  const steps = [
    { title: "Registration received", body: `Submitted ${formatDate(hospital.createdAt)}.`, state: "done" },
    {
      title: "Ireti checks your licence and contact details",
      body: rejected
        ? `Not approved: ${hospital.rejectionReason}`
        : "We look up your registration number and call your main phone number. Usually within two working days.",
      state: rejected ? "failed" : "current",
    },
    { title: "Your Lightning address is tested", body: "So withdrawals can't go astray.", state: "todo" },
    { title: "Families can choose your hospital", body: "Bills they submit appear here for you to confirm.", state: "todo" },
  ] as const;
  const details: [string, string | null][] = [
    ["Country", `${countryName(hospital.country)} (bills in ${hospital.currency})`],
    ["Address", [hospital.address, hospital.city, hospital.state].filter(Boolean).join(", ")],
    ["Licence number", hospital.registrationNumber],
    ["Issued by", hospital.registrationAuthority],
    ["Phone", hospital.phone],
    ["Website", hospital.website],
    ["Payout address", hospital.lightningAddress],
    ["Billing contact", `${user.name}${user.role ? `, ${user.role}` : ""}`],
  ];
  return (
    <div className="container-page py-10">
      <Header user={user} hospital={hospital} />
      <div className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="rounded-[24px] bg-white p-6 sm:p-8">
          <p className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[0.85rem] font-medium ${rejected ? "bg-clay-soft text-clay" : "bg-gold-soft text-gold"}`}>
            {rejected ? <XIcon className="size-3.5" /> : <Clock3Icon className="size-3.5" />}
            {rejected ? "Registration not approved" : "Under review"}
          </p>
          <h2 className="mt-4 text-[1.6rem]">
            {rejected ? "We couldn't verify this hospital" : "Thanks. We're checking your hospital."}
          </h2>
          <p className="mt-2 text-ink-2">
            {rejected
              ? "Correct the details and send them again. Your registration goes straight back into the review queue."
              : "You don't need to do anything. This page updates by itself when the review is done."}
          </p>
          {rejected && (
            <Link href="/hospital/register" className="btn btn-secondary mt-5">
              Correct and resubmit
            </Link>
          )}
          <ol className="mt-8 space-y-0">
            {steps.map((s, i) => (
              <li key={s.title} className="relative flex gap-4 pb-7 last:pb-0">
                {i < steps.length - 1 && <span className="absolute left-[13px] top-8 h-[calc(100%-2rem)] w-px bg-line-2" aria-hidden="true" />}
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
                    s.state === "done"
                      ? "bg-green text-white"
                      : s.state === "failed"
                        ? "bg-clay text-white"
                        : s.state === "current"
                          ? "bg-sun text-ink"
                          : "border border-line-2 bg-white text-ink-3"
                  }`}
                >
                  {s.state === "done" ? <CheckIcon className="size-4" /> : s.state === "failed" ? <XIcon className="size-4" /> : <span className="font-mono text-[0.8rem]">{i + 1}</span>}
                </span>
                <div className="pt-0.5">
                  <p className={`font-medium ${s.state === "todo" ? "text-ink-3" : ""}`}>{s.title}</p>
                  <p className="text-[0.92rem] text-ink-2">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className="rounded-[24px] border border-line bg-paper p-6 sm:p-8">
          <h2 className="font-sans text-[1rem] font-semibold tracking-normal">What you sent us</h2>
          <dl className="mt-4 divide-y divide-line text-[0.93rem]">
            {details.map(([k, val]) => (
              <div key={k} className="grid grid-cols-[8.5rem_1fr] gap-3 py-2.5">
                <dt className="text-ink-3">{k}</dt>
                <dd className="break-words">{val || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}

async function Dashboard({ user, hospital }: { user: HospitalUser; hospital: Hospital }) {
  const campaigns = await store.listCampaigns({ hospitalId: hospital.id });
  const pending = campaigns.filter((c) => c.status === "pending_verification");
  const views = await Promise.all(campaigns.filter((c) => canWithdraw(c) || c.status === "frozen").map(campaignView));
  const active = views.filter((v) => v.campaign.status !== "frozen");
  const frozen = views.filter((v) => v.campaign.status === "frozen");
  const needReceipt = views.flatMap((v) =>
    v.withdrawals.filter((w) => w.status === "sent" && !w.receiptUploadedAt).map((w) => ({ w, v })),
  );
  const money = (n: number) => formatMoney(n, hospital.currency);
  const held = views.reduce((s, v) => s + v.available, 0);
  const heldSats = views.reduce((s, v) => s + v.totals.availableSats, 0);
  const payoutOptions = payoutOptionsFor(hospital);

  return (
    <div className="container-page py-10">
      <Header user={user} hospital={hospital}>
        <p className="mt-1 text-[0.95rem] text-ink-3">
          Payouts to <span className="font-medium text-ink-2">{hospital.lightningAddress}</span>{" "}
          {hospital.lightningAddressVerified ? (
            <span className="text-green">(checked)</span>
          ) : (
            <span className="text-gold">(not checked yet)</span>
          )}
        </p>
      </Header>

      <dl className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Bills to review" value={String(pending.length)} warn={pending.length > 0} />
        <Stat label="Held in escrow for you" value={money(held)} sub={`${formatInt(heldSats)} sats across ${views.length} campaign${views.length === 1 ? "" : "s"}`} />
        <Stat label="Receipts to post" value={String(needReceipt.length)} warn={needReceipt.length > 0} />
      </dl>

      <section className="mt-12">
        <h2 className="text-[1.5rem]">Bills waiting for you</h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-ink-3">Nothing to review. New bills appear here as families submit them.</p>
        ) : (
          <ul className="mt-5 grid gap-5 xl:grid-cols-2">
            {pending.map((c) => (
              <li key={c.id} className="flex flex-col rounded-[24px] bg-white p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.85rem] text-ink-3">Submitted {formatDate(c.createdAt)} by {c.campaignerName}</p>
                    <h3 className="mt-1 font-sans text-[1.2rem] font-semibold tracking-[-0.01em]">{c.title}</h3>
                  </div>
                  <StatusPill status={c.status} />
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[16px] border border-line bg-line text-[0.92rem] sm:grid-cols-4">
                  {[
                    ["Bill ref.", c.billReference],
                    ["Amount", formatMoney(c.goalAmount, c.currency)],
                    ["Patient", c.patientDisplayName],
                    ["Runs until", formatDate(c.deadline)],
                  ].map(([k, val]) => (
                    <div key={k} className="bg-paper px-3.5 py-3">
                      <dt className="text-[0.8rem] text-ink-3">{k}</dt>
                      <dd className="mt-0.5 break-words font-semibold">{val}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-5">
                  <p className="label-mono text-ink-3">What the family wrote</p>
                  <ExpandableText text={c.story} className="mt-2 text-[0.97rem] text-ink" />
                </div>
                <p className="mt-4 text-[0.88rem] text-ink-3">
                  Contact: {c.campaignerName} · <a className="underline underline-offset-2" href={`mailto:${c.campaignerEmail}`}>{c.campaignerEmail}</a>
                </p>
                <ReviewForm campaignId={c.id} billReference={c.billReference} amount={formatMoney(c.goalAmount, c.currency)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {needReceipt.length > 0 && (
        <section className="mt-12">
          <h2 className="text-[1.5rem]">Receipts to post</h2>
          <p className="mt-1 max-w-3xl text-ink-2">
            The Lightning payment proves the money reached your wallet. The receipt proves you
            credited it to this patient&apos;s bill. Until you post it, the public page shows
            &ldquo;Receipt pending&rdquo;.
          </p>
          <ul className="mt-5 grid gap-5 xl:grid-cols-2">
            {needReceipt.map(({ w, v }) => (
              <li key={w.id} className="rounded-[24px] border border-gold/40 bg-white p-6">
                <p className="font-medium">{v.campaign.title}</p>
                <p className="text-[0.9rem] text-ink-3">
                  {formatMoney(satsToFiat(w.amountSats, w.fiatPerBtcAtWithdrawal), v.campaign.currency)} · {formatInt(w.amountSats)} sats ·{" "}
                  {w.sentAt && formatWhen(w.sentAt)} · <span className="hash">{shortHash(w.paymentHash ?? w.payoutRef)}</span>
                </p>
                <div className="mt-4 rounded-[16px] bg-paper p-4 text-[0.92rem]">
                  <p className="font-medium">What to upload</p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5 text-ink-2">
                    <li>Your official receipt or bill statement for <strong className="text-ink">{v.campaign.billReference}</strong></li>
                    <li>Showing this payment credited, and the balance left</li>
                    <li>With the patient&apos;s full name and ID covered</li>
                  </ul>
                </div>
                <ReceiptForm withdrawalId={w.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12">
        <h2 className="text-[1.5rem]">Campaign escrow</h2>
        <p className="mt-1 text-ink-2">Each campaign&apos;s money is kept separate. Withdraw from one campaign at a time, whenever you like.</p>
        {views.length === 0 ? (
          <p className="mt-4 text-ink-3">No confirmed campaigns yet.</p>
        ) : (
          <ul className="mt-5 space-y-4">
            {[...frozen, ...active].map((v) => {
              const isFrozen = v.campaign.status === "frozen";
              const m = (n: number) => formatMoney(n, v.campaign.currency);
              return (
                <li key={v.campaign.id} className={`rounded-[24px] bg-white p-6 ${isFrozen ? "ring-1 ring-clay/30" : ""}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link href={`/c/${v.campaign.slug}`} className="font-medium underline-offset-4 hover:underline">{v.campaign.title}</Link>
                      <p className="text-[0.88rem] text-ink-3">Bill {v.campaign.billReference} · goal {m(v.campaign.goalAmount)}</p>
                    </div>
                    <StatusPill status={v.campaign.status} />
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-4 text-[0.95rem]">
                    <div><dt className="text-ink-3">Raised</dt><dd className="font-semibold">{m(v.raised)}</dd></div>
                    <div><dt className="text-ink-3">Withdrawn</dt><dd className="font-semibold">{m(v.withdrawn)}</dd></div>
                    <div>
                      <dt className="text-ink-3">{isFrozen ? "Locked in escrow" : "Available"}</dt>
                      <dd className={`flex items-center gap-1.5 font-semibold ${isFrozen ? "text-ink" : "text-green"}`}>
                        {isFrozen && <LockIcon className="size-4 text-clay" />}
                        {m(v.available)}
                      </dd>
                    </div>
                  </dl>
                  {v.withdrawals.some((w) => w.status === "pending") && (
                    <p className="mt-3 rounded-[16px] bg-gold-soft px-3 py-2 text-[0.9rem]">
                      A payout from this campaign is being checked by Ireti. Its amount is reserved until then.
                    </p>
                  )}
                  {isFrozen ? (
                    <div className="mt-4 rounded-[16px] bg-clay-soft px-4 py-3 text-[0.93rem]">
                      <p className="font-medium">Ireti has paused this campaign for review.</p>
                      <p className="mt-0.5 text-ink-2">
                        Its money is safe: all {formatInt(v.totals.availableSats)} sats stay in this campaign&apos;s escrow and
                        nobody, including Ireti, can withdraw them while it is paused. Withdrawals and donations resume
                        when the review ends; we&apos;ll contact your billing office if we need anything.
                      </p>
                    </div>
                  ) : v.totals.availableSats > 0 ? (
                    <WithdrawForm
                      campaignId={v.campaign.id}
                      availableSats={v.totals.availableSats}
                      fiatPerBtc={v.rate.fiatPerBtc}
                      currency={v.campaign.currency}
                      minAmount={hospital.minWithdrawalAmount}
                      options={payoutOptions}
                      initialKey={randomUUID()}
                    />
                  ) : (
                    <p className="mt-3 text-[0.9rem] text-ink-3">Nothing available to withdraw.</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Where this hospital can be paid, and why an option is unavailable. */
function payoutOptionsFor(h: Hospital): PayoutOption[] {
  const options: PayoutOption[] = [];
  if (testHospitalWallet()) {
    options.push({
      value: "test_wallet",
      title: "Hospital test wallet",
      detail: "Test network only: a wallet on your own test node stands in for the hospital's.",
      available: true,
    });
  }
  const testNet = network() === "mutinynet";
  options.push({
    value: "lightning",
    title: "Lightning address",
    detail: h.lightningAddressVerified
      ? h.lightningAddress
      : testNet
        ? `${h.lightningAddress}: addresses can't be checked on the test network, so use the test wallet.`
        : `${h.lightningAddress}: Ireti hasn't confirmed this address works yet, so it can't receive payouts.`,
    available: h.lightningAddressVerified,
  });
  options.push({
    value: "bank",
    title: "Bank transfer",
    detail:
      walletKind() === "demo" && h.bankName
        ? `${h.bankName} ••••${h.bankAccountLast4} (simulated in the demo)`
        : "Coming soon: local-currency payouts to your hospital's bank account.",
    available: walletKind() === "demo" && Boolean(h.bankName),
  });
  return options;
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={`rounded-[20px] border bg-card p-5 ${warn ? "border-gold/50" : "border-line"}`}>
      <dt className="text-[0.9rem] text-ink-3">{label}</dt>
      <dd className="mt-1 text-[1.9rem]">{value}</dd>
      {sub && <dd className="text-[0.85rem] text-ink-3">{sub}</dd>}
    </div>
  );
}

function SignIn() {
  return (
    <div className="container-page grid items-center gap-10 py-12 md:grid-cols-2">
      <div className="max-w-md">
        <p className="eyebrow">For hospitals</p>
        <h1 className="mt-3 text-[2.6rem] tracking-[-0.045em]">Billing office sign-in</h1>
        <p className="mt-3 text-ink-2">
          Confirm bills, see each campaign&apos;s escrow, withdraw to your hospital&apos;s wallet and post receipts.
        </p>
        <div className="mt-8">
          <SignInForm demo={sampleData} />
        </div>
        <div className="mt-8 rounded-[20px] border border-line bg-white p-5">
          <p className="font-medium">New to Ireti?</p>
          <p className="mt-1 text-[0.95rem] text-ink-2">
            Register your hospital in about five minutes, then sign in here to follow the review.
          </p>
          <Link href="/hospital/register" className="btn btn-ghost mt-4">
            Register your hospital
          </Link>
        </div>
      </div>
      <Image
        src={unsplashUrl(photos.doctor.id, 1000)}
        alt={photos.doctor.alt}
        width={1000}
        height={1300}
        className="hidden aspect-[4/5] w-full rounded-[20px] object-cover md:block"
        sizes="50vw"
      />
    </div>
  );
}
