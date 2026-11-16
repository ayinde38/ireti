import Link from "next/link";
import type { TimelineEntry } from "@/lib/campaigns";
import { formatDateTime, formatInt, formatMoney, formatWhen, satsToFiat, shortHash } from "@/lib/format";

const eventCopy: Record<string, string> = {
  bill_approved: "Hospital confirmed the bill",
  bill_rejected: "Hospital did not confirm the bill",
  campaign_frozen: "Campaign paused for review",
  campaign_unfrozen: "Campaign review finished",
  goal_reached: "Goal reached",
  receipt_uploaded: "Hospital posted a receipt",
  family_confirmed: "Family confirmed the payment reached the bill",
  campaign_created: "Campaign created",
};

function Dot({ tone }: { tone: "in" | "out" | "event" | "warn" }) {
  const c = { in: "bg-green", out: "bg-clay", event: "bg-line-2", warn: "bg-gold" }[tone];
  return <span className={`absolute -left-[5px] top-2 h-2.5 w-2.5 rounded-full ring-4 ring-white ${c}`} aria-hidden="true" />;
}

export function Timeline({
  entries,
  fiatPerBtc,
  currency,
  hospitalName,
}: {
  entries: TimelineEntry[];
  fiatPerBtc: number;
  currency: string;
  hospitalName: string;
}) {
  if (entries.length === 0) {
    return <p className="text-ink-3">Nothing yet. The first donation will appear here.</p>;
  }
  return (
    <ol className="relative ml-1.5 border-l border-line">
      {entries.map((e) => {
        if (e.kind === "donation") {
          const d = e.d;
          return (
            <li key={`d-${d.id}`} className="relative pb-6 pl-6">
              <Dot tone="in" />
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <p>
                  <span className="font-medium">{d.donorName ?? "Anonymous"}</span>{" "}
                  <span className="text-ink-2">gave {formatMoney(satsToFiat(d.amountSats, d.fiatPerBtcAtPayment ?? fiatPerBtc), currency)}</span>
                </p>
                <time className="text-[0.85rem] text-ink-3" dateTime={e.at} title={formatDateTime(e.at)}>
                  {formatWhen(e.at)}
                </time>
              </div>
              {d.message && <p className="mt-1 text-[0.95rem] italic text-ink-2">“{d.message}”</p>}
              <p className="mt-1 text-[0.8125rem] text-ink-3">
                {formatInt(d.amountSats)} sats into escrow ·{" "}
                <Link href={`/d/${d.paymentHash}`} className="hash underline decoration-line-2 underline-offset-2 hover:text-ink">
                  {shortHash(d.paymentHash)}
                </Link>
              </p>
            </li>
          );
        }
        if (e.kind === "withdrawal") {
          const w = e.w;
          const failed = w.status === "failed";
          const pending = !failed && !w.receiptUploadedAt;
          return (
            <li key={`w-${w.id}`} className="relative pb-6 pl-6">
              <Dot tone={failed ? "event" : pending ? "warn" : "out"} />
              <div className="rounded-[18px] bg-paper p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <p className="font-medium">
                    {failed ? "Withdrawal attempt failed" : `${hospitalName} withdrew ${formatMoney(satsToFiat(w.amountSats, w.fiatPerBtcAtWithdrawal), currency)}`}
                  </p>
                  <time className="text-[0.85rem] text-ink-3" dateTime={e.at} title={formatDateTime(e.at)}>{formatWhen(e.at)}</time>
                </div>
                {!failed && (
                  <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[0.85rem] sm:grid-cols-[auto_1fr]">
                    <dt className="text-ink-3">Amount</dt>
                    <dd>{formatInt(w.amountSats)} sats</dd>
                    <dt className="text-ink-3">Sent to</dt>
                    <dd className="break-all">{w.destination}{w.method === "bank" && " (bank payout)"}</dd>
                    {w.paymentHash && (
                      <>
                        <dt className="text-ink-3">Payment hash</dt>
                        <dd className="hash">{w.paymentHash}</dd>
                      </>
                    )}
                    {w.preimage && (
                      <>
                        <dt className="text-ink-3">Payment proof</dt>
                        <dd className="hash text-ink-2">{w.preimage}</dd>
                      </>
                    )}
                    {w.payoutRef && (
                      <>
                        <dt className="text-ink-3">Payout ref</dt>
                        <dd className="hash">{w.payoutRef}</dd>
                      </>
                    )}
                  </dl>
                )}
                {!failed && (
                  <div className="mt-3 flex flex-wrap gap-2 text-[0.85rem]">
                    {pending ? (
                      <span className="inline-flex items-center gap-1.5 rounded bg-gold-soft px-2.5 py-1 font-medium text-gold">
                        Receipt pending
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded bg-green-soft px-2.5 py-1 font-medium text-green">
                        Receipt posted
                        {w.receiptUrl && (
                          <a href={w.receiptUrl} target="_blank" rel="noopener" className="underline underline-offset-2">
                            view
                          </a>
                        )}
                      </span>
                    )}
                    {w.familyConfirmedAt && (
                      <span className="inline-flex rounded bg-green-soft px-2.5 py-1 font-medium text-green">
                        Family confirmed
                      </span>
                    )}
                  </div>
                )}
                {w.receiptNote && <p className="mt-2 text-[0.9rem] text-ink-2">{w.receiptNote}</p>}
              </div>
            </li>
          );
        }
        return (
          <li key={`a-${e.a.id}`} className="relative pb-6 pl-6">
            <Dot tone="event" />
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-[0.95rem]">
              <p className="text-ink-2">
                {eventCopy[e.a.action] ?? e.a.action.replace(/_/g, " ")}
                {e.a.details && e.a.action.startsWith("bill") && (
                  <span className="text-ink-3"> · {e.a.details}</span>
                )}
              </p>
              <time className="text-[0.85rem] text-ink-3" dateTime={e.at} title={formatDateTime(e.at)}>{formatWhen(e.at)}</time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
