import { randomUUID } from "node:crypto";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { StatusPill } from "@/components/ui";
import { currentHospitalUser } from "@/lib/auth";
import { campaignView, canWithdraw } from "@/lib/campaigns";
import { formatDate, formatInt, formatNgn, satsToNgn, shortHash } from "@/lib/format";
import { testHospitalWallet, walletKind } from "@/lib/lightning";
import { photos, unsplashUrl } from "@/lib/photos";
import { sampleData, store } from "@/lib/store";
import { signOut } from "./actions";
import { ReceiptForm, ReviewForm, SignInForm, WithdrawForm } from "./forms";

export const metadata = { title: "Hospital dashboard", robots: { index: false } };

export default function HospitalPage() {
  return (
    <Suspense fallback={<div className="container-page min-h-[70vh]" />}>
      <Hospital />
    </Suspense>
  );
}

async function Hospital() {
  await connection();
  const session = await currentHospitalUser();
  if (!session) return <SignIn />;
  const { user, hospital } = session;

  const campaigns = await store.listCampaigns({ hospitalId: hospital.id });
  const pending = campaigns.filter((c) => c.status === "pending_verification");
  const active = await Promise.all(campaigns.filter(canWithdraw).map(campaignView));
  const frozen = campaigns.filter((c) => c.status === "frozen");
  const needReceipt = active.flatMap((v) =>
    v.withdrawals.filter((w) => w.status === "sent" && !w.receiptUploadedAt).map((w) => ({ w, v })),
  );
  const rate = active[0]?.rate.ngnPerBtc;
  const totalAvailable = active.reduce((s, v) => s + v.totals.availableSats, 0);

  return (
    <div className="container-page py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Hospital dashboard</p>
          <h1 className="mt-2 text-[2.1rem]">{hospital.name}</h1>
          <p className="mt-1 text-[0.95rem] text-ink-3">
            Signed in as {user.name} ({user.email}) · Payouts to{" "}
            <span className="font-medium text-ink-2">{hospital.lightningAddress}</span>
            {hospital.lightningAddressVerified ? " (verified)" : " (not yet verified)"}
          </p>
        </div>
        <form action={signOut}>
          <button className="btn btn-ghost">Sign out</button>
        </form>
      </div>

      <dl className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Bills to review" value={String(pending.length)} />
        <Stat label="Held in escrow for you" value={rate ? formatNgn(satsToNgn(totalAvailable, rate)) : "—"} sub={`${formatInt(totalAvailable)} sats across ${active.length} campaigns`} />
        <Stat label="Receipts to post" value={String(needReceipt.length)} warn={needReceipt.length > 0} />
      </dl>

      {needReceipt.length > 0 && (
        <section className="mt-12">
          <h2 className="text-[1.5rem]">Receipts to post</h2>
          <p className="mt-1 text-ink-2">These withdrawals show &ldquo;Receipt pending&rdquo; on the public page until you post one.</p>
          <ul className="mt-5 grid gap-4 md:grid-cols-2">
            {needReceipt.map(({ w, v }) => (
              <li key={w.id} className="rounded-[20px] border border-gold/40 bg-card p-5">
                <p className="font-medium">{v.campaign.title}</p>
                <p className="text-[0.9rem] text-ink-3">
                  {formatNgn(satsToNgn(w.amountSats, w.ngnPerBtcAtWithdrawal))} · {formatInt(w.amountSats)} sats ·{" "}
                  {w.sentAt && formatDate(w.sentAt)} · <span className="hash">{shortHash(w.paymentHash ?? w.payoutRef)}</span>
                </p>
                <ReceiptForm withdrawalId={w.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12">
        <h2 className="text-[1.5rem]">Bills waiting for you</h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-ink-3">Nothing to review.</p>
        ) : (
          <ul className="mt-5 grid gap-4 md:grid-cols-2">
            {pending.map((c) => (
              <li key={c.id} className="rounded-[24px] bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{c.title}</p>
                  <StatusPill status={c.status} />
                </div>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[0.92rem]">
                  <dt className="text-ink-3">Bill ref.</dt><dd className="font-medium">{c.billReference}</dd>
                  <dt className="text-ink-3">Amount</dt><dd className="font-medium">{formatNgn(c.goalNgn)}</dd>
                  <dt className="text-ink-3">Patient</dt><dd>{c.patientDisplayName}</dd>
                  <dt className="text-ink-3">Campaigner</dt><dd>{c.campaignerName} · {c.campaignerEmail}</dd>
                  <dt className="text-ink-3">Submitted</dt><dd>{formatDate(c.createdAt)}</dd>
                </dl>
                <p className="mt-3 line-clamp-3 text-[0.92rem] text-ink-2">{c.story}</p>
                <p className="mt-3 text-[0.85rem] text-ink-3">Check the reference and amount against your billing system before approving.</p>
                <ReviewForm campaignId={c.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-[1.5rem]">Campaign escrow</h2>
        <p className="mt-1 text-ink-2">Each campaign&apos;s money is kept separate. Withdraw from one campaign at a time, whenever you like.</p>
        {active.length === 0 ? (
          <p className="mt-4 text-ink-3">No verified campaigns yet.</p>
        ) : (
          <ul className="mt-5 space-y-4">
            {active.map((v) => (
              <li key={v.campaign.id} className="rounded-[24px] bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link href={`/c/${v.campaign.slug}`} className="font-medium underline-offset-4 hover:underline">{v.campaign.title}</Link>
                    <p className="text-[0.88rem] text-ink-3">Bill {v.campaign.billReference} · goal {formatNgn(v.campaign.goalNgn)}</p>
                  </div>
                  <StatusPill status={v.campaign.status} />
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-4 text-[0.95rem]">
                  <div><dt className="text-ink-3">Raised</dt><dd className="font-semibold">{formatNgn(satsToNgn(v.totals.raisedSats, v.rate.ngnPerBtc))}</dd></div>
                  <div><dt className="text-ink-3">Withdrawn</dt><dd className="font-semibold">{formatNgn(satsToNgn(v.totals.withdrawnSats, v.rate.ngnPerBtc))}</dd></div>
                  <div><dt className="text-ink-3">Available</dt><dd className="font-semibold text-green">{formatNgn(satsToNgn(v.totals.availableSats, v.rate.ngnPerBtc))}</dd></div>
                </dl>
                {v.withdrawals.some((w) => w.status === "pending") && (
                  <p className="mt-3 rounded-[16px] bg-gold-soft px-3 py-2 text-[0.9rem]">
                    A payout from this campaign is being checked by Ireti. Its amount is reserved until then.
                  </p>
                )}
                {v.totals.availableSats > 0 ? (
                  <WithdrawForm
                    campaignId={v.campaign.id}
                    availableSats={v.totals.availableSats}
                    ngnPerBtc={v.rate.ngnPerBtc}
                    minNgn={hospital.minWithdrawalNgn}
                    bankLabel={walletKind() === "demo" && hospital.bankName ? `${hospital.bankName} ••••${hospital.bankAccountLast4}` : null}
                    testWallet={testHospitalWallet()}
                    initialKey={randomUUID()}
                  />
                ) : (
                  <p className="mt-3 text-[0.9rem] text-ink-3">Nothing available to withdraw.</p>
                )}
              </li>
            ))}
          </ul>
        )}
        {frozen.length > 0 && (
          <p className="mt-4 text-[0.9rem] text-ink-3">
            {frozen.length} campaign{frozen.length > 1 ? "s are" : " is"} paused for review; {frozen.length > 1 ? "their balances are" : "its balance is"} locked.
          </p>
        )}
      </section>
    </div>
  );
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
  const demo = sampleData;
  return (
    <div className="container-page grid items-center gap-10 py-12 md:grid-cols-2">
      <div className="max-w-md">
        <p className="eyebrow">For hospitals</p>
        <h1 className="mt-3 text-[2.6rem] tracking-[-0.045em]">Billing office sign-in</h1>
        <p className="mt-3 text-ink-2">
          Confirm bills, see each campaign&apos;s escrow, withdraw to your account and post receipts.
        </p>
        <div className="mt-8">
          <SignInForm demo={demo} />
        </div>
        <p className="mt-6 text-[0.9rem] text-ink-3">
          Not a partner yet? Email partners@ireti.example and we&apos;ll set you up.
        </p>
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
