import { CheckIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { formatInt, formatMoney, satsToFiat } from "@/lib/format";
import { getRate } from "@/lib/rates";
import { transparencyData } from "@/lib/transparency";

export const metadata = {
  title: "Transparency",
  description: "Live proof that every campaign's escrow is fully backed.",
};

const howToRead = [
  {
    t: "What we owe",
    b: "Add up every donation into every campaign, subtract everything paid out to hospitals. That is the money Ireti is holding for campaigns right now. It comes straight from the public ledger.",
  },
  {
    t: "What we hold",
    b: "We ask the escrow wallet for its balance. This is the money actually there, not a number we typed in.",
  },
  {
    t: "Compare",
    b: "If the wallet holds at least what we owe, every campaign is fully backed. If it ever holds less, money is missing: we're alerted and it shows here in red.",
  },
];

export default function TransparencyPage() {
  return (
    <div className="container-page max-w-5xl py-12">
      <p className="eyebrow">Transparency · proof of reserves</p>
      <h1 className="mt-3 text-[2.8rem] tracking-[-0.045em]">Is all the money still here?</h1>
      <p className="mt-4 max-w-2xl text-[1.06rem] text-ink-2">
        Donations wait in escrow until a hospital withdraws them. This page lets anyone check that
        the escrow really holds every one of them, without having to trust us.
      </p>

      <ol className="mt-10 grid gap-4 md:grid-cols-3">
        {howToRead.map((s, i) => (
          <li key={s.t} className="rounded-[20px] border border-line bg-white p-5">
            <p className="label-mono text-ink-3">{String(i + 1).padStart(2, "0")}</p>
            <h2 className="mt-2 font-sans text-[1.05rem] font-semibold tracking-normal">{s.t}</h2>
            <p className="mt-1.5 text-[0.94rem] text-ink-2">{s.b}</p>
          </li>
        ))}
      </ol>

      <Suspense fallback={<div className="mt-10 h-96 rounded-[24px] bg-white" />}>
        <Reserves />
      </Suspense>

      <section className="mt-14 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-[1.4rem]">Who holds the money</h2>
          <p className="mt-3 text-ink-2">
            During this pilot, the escrow wallet is held by Ireti. That means you are trusting us to
            keep it, which is why every entry in and out is public and the balance is checked
            continuously. Next we are moving to a 2-of-3 multisig shared with the hospital and an
            independent verifier, so no single party can move funds alone.
          </p>
        </div>
        <div>
          <h2 className="text-[1.4rem]">Rules we can&apos;t quietly break</h2>
          <ul className="mt-3 space-y-2 text-ink-2">
            <li>Ledger entries are never edited or deleted; the database refuses it.</li>
            <li>Withdrawals go only to the campaign&apos;s own verified hospital.</li>
            <li>Every withdrawal shows its payment proof and needs a receipt.</li>
            <li>Approvals, freezes, withdrawals and receipts are logged with who and when.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

async function Reserves() {
  await connection();
  const [t, usdRate] = await Promise.all([transparencyData(), getRate("USD")]);
  const latest = t.latest;
  const ok = latest ? latest.differenceSats >= 0 : true;
  const usd = (s: number) => formatMoney(satsToFiat(s, usdRate.fiatPerBtc), "USD");

  return (
    <>
      <div className={`mt-10 flex items-start gap-4 rounded-[24px] p-6 ${ok ? "bg-indigo text-indigo-ink" : "bg-clay text-white"}`}>
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${ok ? "bg-sun text-ink" : "bg-white text-clay"}`}>
          {ok ? <CheckIcon className="size-5" /> : <TriangleAlertIcon className="size-5" />}
        </span>
        <div>
          <p className="text-[1.25rem] font-semibold">
            {latest
              ? ok
                ? "Fully backed: the wallet holds everything campaigns are owed."
                : "Shortfall: the wallet holds less than campaigns are owed. The team has been alerted."
              : "No check has run yet."}
          </p>
          {latest && (
            <p className={`mt-1 text-[0.9rem] ${ok ? "text-indigo-muted" : "text-white/85"}`}>
              Last checked {new Date(latest.takenAt).toUTCString()} · re-checked at most once a minute when this page is open
              {t.wallet === "demo" && " · demo wallet"}
            </p>
          )}
        </div>
      </div>

      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-[24px] bg-white p-5">
          <dt className="text-[0.9rem] text-ink-3">1 · What we owe campaigns</dt>
          <dd className="mt-1 text-[1.8rem]">{formatInt(latest?.ledgerTotalSats ?? t.ledgerTotalSats)} sats</dd>
          <dd className="text-[0.85rem] text-ink-3">≈ {usd(latest?.ledgerTotalSats ?? t.ledgerTotalSats)} · from the ledger</dd>
        </div>
        <div className="rounded-[24px] bg-white p-5">
          <dt className="text-[0.9rem] text-ink-3">2 · What the escrow wallet holds</dt>
          <dd className="mt-1 text-[1.8rem]">{latest ? `${formatInt(latest.walletBalanceSats)} sats` : "—"}</dd>
          <dd className="text-[0.85rem] text-ink-3">{latest ? `≈ ${usd(latest.walletBalanceSats)} · from the wallet` : ""}</dd>
        </div>
        <div className="rounded-[24px] bg-white p-5">
          <dt className="text-[0.9rem] text-ink-3">3 · Difference (2 − 1)</dt>
          <dd className={`mt-1 text-[1.8rem] ${latest && latest.differenceSats < 0 ? "text-clay" : ""}`}>
            {latest ? `${latest.differenceSats >= 0 ? "+" : ""}${formatInt(latest.differenceSats)} sats` : "—"}
          </dd>
          <dd className="text-[0.85rem] text-ink-3">
            0 or more is good. Anything above 0 is Ireti&apos;s own money kept in the wallet, not donations.
          </dd>
        </div>
      </dl>

      <section className="mt-14">
        <h2 className="text-[1.4rem]">Where &ldquo;what we owe&rdquo; comes from</h2>
        <p className="mt-1 max-w-2xl text-ink-2">
          Each campaign&apos;s escrow, from its own ledger. The last column adds up to number 1 above. Click a campaign
          to see every payment behind it, each with a proof you can check in your browser.
        </p>
        <div className="mt-5 overflow-x-auto rounded-[24px] bg-white">
          <table className="w-full min-w-[640px] text-left text-[0.92rem]">
            <thead className="border-b border-line text-ink-3">
              <tr>
                <th className="px-4 py-3 font-medium">Campaign</th>
                <th className="px-4 py-3 text-right font-medium">Donated, sats</th>
                <th className="px-4 py-3 text-right font-medium">Paid to hospital</th>
                <th className="px-4 py-3 text-right font-medium">Held now</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {t.campaigns.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-ink-3">No donations yet, so nothing is owed.</td></tr>
              )}
              {t.campaigns.map((c) => (
                <tr key={c.slug}>
                  <td className="px-4 py-2.5">
                    <Link href={`/c/${c.slug}#timeline`} className="font-medium underline-offset-4 hover:underline">{c.title}</Link>
                    <span className="block text-[0.82rem] text-ink-3">{c.hospital}{c.status === "frozen" ? " · paused, locked" : ""}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatInt(c.raisedSats)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">−{formatInt(c.withdrawnSats)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatInt(c.heldSats)}</td>
                </tr>
              ))}
            </tbody>
            {t.campaigns.length > 0 && (
              <tfoot className="border-t border-line-2">
                <tr>
                  <td className="px-4 py-3 font-semibold" colSpan={3}>Total owed to campaigns</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatInt(t.campaigns.reduce((s, c) => s + c.heldSats, 0))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-[1.4rem]">Check history</h2>
        <p className="mt-1 text-ink-2">Every check is stored and never changed, so a past shortfall can&apos;t be hidden.</p>
        <div className="mt-5 overflow-x-auto rounded-[24px] bg-white">
          <table className="w-full min-w-[520px] text-left text-[0.92rem]">
            <thead className="border-b border-line text-ink-3">
              <tr>
                <th className="px-4 py-3 font-medium">Time (UTC)</th>
                <th className="px-4 py-3 text-right font-medium">Owed, sats</th>
                <th className="px-4 py-3 text-right font-medium">Wallet, sats</th>
                <th className="px-4 py-3 text-right font-medium">Difference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {t.snapshots.slice(0, 24).map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2.5">{new Date(s.takenAt).toISOString().replace("T", " ").slice(0, 16)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatInt(s.ledgerTotalSats)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatInt(s.walletBalanceSats)}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${s.differenceSats < 0 ? "font-semibold text-clay" : "text-ink-2"}`}>
                    {s.differenceSats >= 0 ? "+" : ""}
                    {formatInt(s.differenceSats)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[0.85rem] text-ink-3">
          Machine-readable: <a className="underline underline-offset-2" href="/api/transparency">/api/transparency</a> · each
          campaign&apos;s full ledger as CSV or JSON from its page.
        </p>
      </section>
    </>
  );
}
