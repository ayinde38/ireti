import { connection } from "next/server";
import { Suspense } from "react";
import { formatInt, formatNgn, satsToNgn } from "@/lib/format";
import { getNgnRate } from "@/lib/rates";
import { transparencyData } from "@/lib/transparency";

export const metadata = {
  title: "Transparency",
  description: "Live proof that every campaign's escrow is fully backed.",
};

export default function TransparencyPage() {
  return (
    <div className="container-page max-w-4xl py-12">
      <p className="eyebrow">Transparency</p>
      <h1 className="mt-3 text-[2.8rem] tracking-[-0.045em]">Is all the money still here?</h1>
      <p className="mt-4 max-w-2xl text-[1.06rem] text-ink-2">
        Every hour we compare the balance of the escrow wallet with what the public ledger says we
        owe to campaigns. If the wallet ever holds less, we are alerted and it shows here.
      </p>
      <Suspense fallback={<div className="mt-10 h-64 rounded-[24px] bg-white" />}>
        <Reserves />
      </Suspense>

      <section className="mt-14 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-[1.4rem]">Who holds the money</h2>
          <p className="mt-3 text-ink-2">
            During this pilot, the escrow wallet is held by Ireti. That means you are trusting us to
            keep it, which is why every entry in and out is public and every hour is checked. Next
            we are moving to a 2-of-3 multisig shared with the hospital and an independent
            verifier, so no single party can move funds alone.
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
  const [t, rate] = await Promise.all([transparencyData(), getNgnRate()]);
  const latest = t.latest;
  const ok = latest ? latest.differenceSats >= 0 : true;
  const ngn = (s: number) => formatNgn(satsToNgn(s, rate.ngnPerBtc));

  return (
    <>
      <div className={`mt-10 rounded-[20px] border p-6 ${ok ? "border-green/30 bg-green-soft" : "border-clay/40 bg-clay-soft"}`}>
        <p className="text-[1.1rem] font-semibold">
          {latest
            ? ok
              ? "Fully backed. The wallet holds at least what campaigns are owed."
              : "Shortfall detected. The team has been alerted."
            : "No snapshot yet."}
        </p>
        {latest && (
          <p className="mt-1 text-[0.9rem] text-ink-2">
            Last checked {new Date(latest.takenAt).toUTCString()}
            {t.wallet === "demo" && " · demo wallet"}
          </p>
        )}
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-[24px] bg-white p-5">
          <dt className="text-[0.9rem] text-ink-3">Owed to all campaigns</dt>
          <dd className="mt-1 text-[1.8rem]">{ngn(t.ledgerTotalSats)}</dd>
          <dd className="text-[0.85rem] text-ink-3">{formatInt(t.ledgerTotalSats)} sats</dd>
        </div>
        <div className="rounded-[24px] bg-white p-5">
          <dt className="text-[0.9rem] text-ink-3">Escrow wallet balance</dt>
          <dd className="mt-1 text-[1.8rem]">{latest ? ngn(latest.walletBalanceSats) : "—"}</dd>
          <dd className="text-[0.85rem] text-ink-3">{latest ? `${formatInt(latest.walletBalanceSats)} sats` : ""}</dd>
        </div>
        <div className="rounded-[24px] bg-white p-5">
          <dt className="text-[0.9rem] text-ink-3">Difference</dt>
          <dd className="mt-1 text-[1.8rem]">{latest ? `${latest.differenceSats >= 0 ? "+" : ""}${formatInt(latest.differenceSats)}` : "—"}</dd>
          <dd className="text-[0.85rem] text-ink-3">sats (fees and rounding may add a little)</dd>
        </div>
      </dl>

      <h2 className="mt-12 text-[1.4rem]">Snapshot history</h2>
      <div className="mt-4 overflow-x-auto rounded-[24px] bg-white">
        <table className="w-full min-w-[520px] text-left text-[0.92rem]">
          <thead className="border-b border-line text-ink-3">
            <tr>
              <th className="px-4 py-3 font-medium">Time (UTC)</th>
              <th className="px-4 py-3 text-right font-medium">Wallet, sats</th>
              <th className="px-4 py-3 text-right font-medium">Ledger, sats</th>
              <th className="px-4 py-3 text-right font-medium">Difference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {t.snapshots.slice(0, 24).map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-2.5">{new Date(s.takenAt).toISOString().replace("T", " ").slice(0, 16)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatInt(s.walletBalanceSats)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatInt(s.ledgerTotalSats)}</td>
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
        Machine-readable: <a className="underline underline-offset-2" href="/api/transparency">/api/transparency</a>
      </p>
    </>
  );
}
