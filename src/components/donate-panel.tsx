"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { CheckIcon, CopyIcon, TimerIcon } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FormField, MoneyInput } from "@/components/form-controls";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { currencySymbol, fiatToSats, formatInt, formatMoney, satsToFiat } from "@/lib/format";

type Invoice = { id: string; pr: string; hash: string; expiresAt: string; sats: number };
type Step = { kind: "choose" } | ({ kind: "invoice" } & Invoice) | { kind: "expired"; sats: number } | { kind: "paid"; hash: string; sats: number };

export function DonatePanel({
  slug,
  fiatPerBtc,
  currency,
  presets,
  rateLive,
  network,
  patientName,
}: {
  slug: string;
  fiatPerBtc: number;
  currency: string;
  /** Suggested gifts in `currency`. */
  presets: number[];
  rateLive: boolean;
  network: "demo" | "mainnet" | "mutinynet";
  patientName: string;
}) {
  const [amount, setAmount] = useState<number>(presets[1] ?? presets[0]);
  const [custom, setCustom] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const chosen = custom ? Number(custom) : amount;
  const sats = fiatToSats(chosen || 0, fiatPerBtc);
  const money = (n: number) => formatMoney(n, currency);

  async function createInvoice(forSats = sats) {
    setError(null);
    if (forSats < 100) {
      setError(`The smallest gift is about ${money(satsToFiat(100, fiatPerBtc))}.`);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/campaigns/${slug}/donations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountSats: forSats, donorName: name || null, message: message || null, donorEmail: email || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Something went wrong.");
      setStep({ kind: "invoice", id: j.id, pr: j.paymentRequest, hash: j.paymentHash, expiresAt: j.expiresAt, sats: forSats });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (step.kind === "paid") {
    return (
      <div className="text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-green-soft text-green">
          <CheckIcon className="size-7" />
        </div>
        <h3 className="mt-4 text-[1.5rem]">Thank you.</h3>
        <p className="mt-2 text-ink-2" role="status">
          Your {formatInt(step.sats)} sats (about {money(satsToFiat(step.sats, fiatPerBtc))}) are in escrow for{" "}
          {patientName}&apos;s hospital and already on the public ledger.
        </p>
        <a href={`/d/${step.hash}`} className="btn btn-secondary mt-6 w-full">
          View and verify your receipt
        </a>
        <p className="mt-3 text-[0.8125rem] text-ink-3">Bookmark it: your receipt link is the only way to find this donation again.</p>
        <button className="btn btn-ghost mt-4 w-full" onClick={() => setStep({ kind: "choose" })}>
          Give again
        </button>
      </div>
    );
  }

  if (step.kind === "expired") {
    return (
      <div className="text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-gold-soft text-gold">
          <TimerIcon className="size-7" />
        </div>
        <h3 className="mt-4 text-[1.4rem]">That payment request expired</h3>
        <p className="mt-2 text-ink-2">Nothing was charged. Requests last 15 minutes so the amount stays accurate.</p>
        <button className="btn btn-primary mt-6 w-full" disabled={busy} onClick={() => createInvoice(step.sats)}>
          {busy ? "Preparing…" : `Get a new request for ${money(satsToFiat(step.sats, fiatPerBtc))}`}
        </button>
        <button className="btn btn-ghost mt-2.5 w-full" onClick={() => setStep({ kind: "choose" })}>
          Change amount
        </button>
      </div>
    );
  }

  if (step.kind === "invoice") {
    return (
      <InvoiceStep
        invoice={step}
        network={network}
        label={money(satsToFiat(step.sats, fiatPerBtc))}
        onPaid={() => setStep({ kind: "paid", hash: step.hash, sats: step.sats })}
        onExpired={() => setStep({ kind: "expired", sats: step.sats })}
        onBack={() => setStep({ kind: "choose" })}
      />
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void createInvoice();
      }}
      noValidate
    >
      <fieldset>
        <legend className="text-[0.95rem] font-medium">Choose an amount</legend>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {presets.map((p) => {
            const active = !custom && amount === p;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setAmount(p);
                  setCustom("");
                }}
                className={cn(
                  "min-h-12 rounded-xl border text-[1rem] font-medium transition-colors",
                  active ? "border-indigo bg-indigo text-indigo-ink" : "border-line-2 bg-card hover:border-ink-3",
                )}
              >
                {money(p)}
              </button>
            );
          })}
        </div>
        <div className="mt-3">
          <label htmlFor="custom-amount" className="sr-only">Other amount in {currency}</label>
          <MoneyInput
            id="custom-amount"
            name="custom"
            symbol={currencySymbol(currency)}
            currency={currency}
            value={custom}
            onValueChange={setCustom}
            placeholder="Other amount"
          />
        </div>
        <p className="mt-2 text-[0.85rem] text-ink-3">
          ≈ {formatInt(sats)} sats{" "}
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="cursor-help underline decoration-dotted underline-offset-2">
                what&apos;s a sat?
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-60">
              The smallest unit of bitcoin. 100 million sats make one bitcoin. You pay in sats; the hospital sees the {currency} value.
            </TooltipContent>
          </Tooltip>
          {!rateLive && " · approximate rate"}
        </p>
      </fieldset>

      <Collapsible className="mt-5 rounded-[16px] border border-line">
        <CollapsibleTrigger className="group flex w-full items-center justify-between px-4 py-3 text-left text-[0.95rem] font-medium">
          Add your name, a message or email (optional)
          <span className="text-ink-3 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true">⌄</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 px-4 pb-4">
          <FormField label="Name" htmlFor="donor-name">
            <Input id="donor-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Anonymous" />
          </FormField>
          <FormField label="Email for withdrawal updates" htmlFor="donor-email" hint="Never shown publicly.">
            <Input id="donor-email" type="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
          <FormField label="Message to the family" htmlFor="donor-message">
            <Textarea id="donor-message" className="min-h-24" maxLength={280} value={message} onChange={(e) => setMessage(e.target.value)} />
          </FormField>
        </CollapsibleContent>
      </Collapsible>

      {error && (
        <p role="alert" className="mt-4 rounded-[14px] bg-clay-soft px-3 py-2 text-[0.9rem] text-ink">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy || !chosen} className="btn btn-primary mt-5 w-full">
        {busy ? "Preparing…" : `Give ${chosen ? money(chosen) : ""}`}
      </button>
      <p className="mt-3 text-center text-[0.8125rem] text-ink-3">Goes to the hospital, never to the family or to Ireti.</p>
    </form>
  );
}

/** Seconds left until `iso`, ticking once a second. */
function useCountdown(iso: string) {
  const [left, setLeft] = useState(() => Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 1000))), 1000);
    return () => clearInterval(t);
  }, [iso]);
  return left;
}

function InvoiceStep({
  invoice,
  network,
  label,
  onPaid,
  onExpired,
  onBack,
}: {
  invoice: Invoice;
  network: "demo" | "mainnet" | "mutinynet";
  label: string;
  onPaid: () => void;
  onExpired: () => void;
  onBack: () => void;
}) {
  const router = useRouter();
  const left = useCountdown(invoice.expiresAt);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  // The server re-checks with the wallet on every poll; only it can mark a gift paid.
  const { data: status } = useQuery({
    queryKey: ["donation", invoice.id],
    queryFn: async () => {
      const r = await fetch(`/api/donations/${invoice.id}`, { cache: "no-store" });
      return ((await r.json()) as { status: string }).status;
    },
    refetchInterval: (q) => (q.state.data === "paid" || q.state.data === "expired" ? false : 2500),
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (status === "paid") {
      onPaid();
      router.refresh();
    } else if (status === "expired" || left === 0) {
      onExpired();
    }
  }, [status, left, onPaid, onExpired, router]);

  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");
  const urgent = left < 120;

  return (
    <div>
      <p className="text-center text-[0.95rem] text-ink-2">
        Scan with any Lightning wallet to give <strong className="text-ink">{label}</strong>
        <span className="text-ink-3"> ({formatInt(invoice.sats)} sats)</span>
      </p>
      <a
        href={`lightning:${invoice.pr}`}
        className="mx-auto mt-4 block w-fit rounded-[24px] bg-white p-4 ring-1 ring-line"
        aria-label="Open the payment request in your wallet app"
      >
        <QRCodeSVG value={invoice.pr.toUpperCase()} size={232} marginSize={0} level="M" />
      </a>
      <div className="mt-4 flex items-center justify-between gap-3 rounded-[14px] bg-paper px-3.5 py-2.5 text-[0.88rem]" aria-live="polite">
        <span className="flex items-center gap-2 text-ink-2">
          <span className="inline-block size-2 animate-pulse rounded-full bg-green motion-reduce:animate-none" />
          Waiting for payment…
        </span>
        <span
          className={cn("flex items-center gap-1.5 font-mono tabular-nums", urgent ? "font-semibold text-clay" : "text-ink-3")}
          title="Payment requests expire so the amount stays accurate"
        >
          <TimerIcon className="size-3.5" />
          {mm}:{ss}
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-sand" aria-hidden="true">
        <div className={cn("h-full transition-[width] duration-1000 ease-linear", urgent ? "bg-clay" : "bg-indigo")} style={{ width: `${(left / 900) * 100}%` }} />
      </div>
      {network === "demo" && (
        <p className="mt-4 rounded-[14px] bg-gold-soft px-3 py-2 text-[0.88rem]">
          This is a demo code: no wallet can pay it. Use &ldquo;Simulate payment&rdquo; below.
        </p>
      )}
      {network === "mutinynet" && (
        <p className="mt-4 rounded-[14px] bg-gold-soft px-3 py-2 text-[0.88rem]">
          Test network (Mutinynet): phone wallets can&apos;t pay this. Copy the payment request and pay it from your
          test wallet dashboard (Send) or at{" "}
          <a className="font-semibold underline" href="https://faucet.mutinynet.com/" target="_blank" rel="noopener noreferrer">
            faucet.mutinynet.com
          </a>
          .
        </p>
      )}
      <div className="mt-5 grid gap-2.5">
        <a href={`lightning:${invoice.pr}`} className="btn btn-primary sm:hidden">
          Open wallet app
        </a>
        <button
          className="btn btn-secondary"
          onClick={async () => {
            // Bitcoin Connect: one-tap pay from Alby, any NWC wallet or a WebLN extension.
            const { launchPaymentModal } = await import("@getalby/bitcoin-connect-react");
            launchPaymentModal({ invoice: invoice.pr });
          }}
        >
          Pay with a connected wallet
        </button>
        <button
          className="btn btn-ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(invoice.pr);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
          {copied ? "Copied" : "Copy payment request"}
        </button>
        {network === "demo" && (
          <button
            className="btn btn-ghost border-dashed"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await fetch(`/api/donations/${invoice.id}/simulate`, { method: "POST" });
              setBusy(false);
            }}
          >
            Simulate payment (demo only)
          </button>
        )}
      </div>
      <button className="mt-4 w-full text-center text-[0.9rem] text-ink-3 underline-offset-4 hover:underline" onClick={onBack}>
        Change amount
      </button>
    </div>
  );
}
