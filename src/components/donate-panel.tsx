"use client";

import { QRCodeSVG } from "qrcode.react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatInt, formatNgn, ngnToSats, satsToNgn } from "@/lib/format";

const PRESETS_NGN = [2_000, 5_000, 20_000, 50_000];

type Step =
  | { kind: "choose" }
  | { kind: "invoice"; id: string; pr: string; hash: string; expiresAt: string; sats: number }
  | { kind: "paid"; hash: string; sats: number };

export function DonatePanel({
  slug,
  ngnPerBtc,
  rateLive,
  network,
  patientName,
}: {
  slug: string;
  ngnPerBtc: number;
  rateLive: boolean;
  network: "demo" | "mainnet" | "mutinynet";
  patientName: string;
}) {
  const router = useRouter();
  const [ngn, setNgn] = useState<number>(5_000);
  const [custom, setCustom] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const amountNgn = custom ? Number(custom.replace(/[^\d]/g, "")) : ngn;
  const sats = ngnToSats(amountNgn || 0, ngnPerBtc);

  // Poll the server (which re-checks the wallet) until paid or expired.
  useEffect(() => {
    if (step.kind !== "invoice") return;
    let stopped = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/donations/${step.id}`, { cache: "no-store" });
        const j = (await r.json()) as { status: string };
        if (stopped) return;
        if (j.status === "paid") {
          setStep({ kind: "paid", hash: step.hash, sats: step.sats });
          router.refresh();
          return;
        }
        if (j.status === "expired") {
          setError("This payment request expired. Please start again.");
          setStep({ kind: "choose" });
          return;
        }
      } catch {
        /* network blip: keep polling */
      }
      if (!stopped) setTimeout(tick, 2500);
    };
    const t = setTimeout(tick, 2000);
    return () => {
      stopped = true;
      clearTimeout(t);
    };
  }, [step, router]);

  async function createInvoice(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (sats < 100) {
      setError(`The smallest gift is about ${formatNgn(satsToNgn(100, ngnPerBtc))}.`);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/campaigns/${slug}/donations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountSats: sats,
          donorName: name || null,
          message: message || null,
          donorEmail: email || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Something went wrong.");
      setStep({ kind: "invoice", id: j.id, pr: j.paymentRequest, hash: j.paymentHash, expiresAt: j.expiresAt, sats });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function payWithBrowserWallet(pr: string) {
    // Bitcoin Connect: one-tap pay from Alby, any NWC wallet or a WebLN extension.
    const { launchPaymentModal } = await import("@getalby/bitcoin-connect-react");
    launchPaymentModal({ invoice: pr });
  }

  async function simulate(id: string) {
    setBusy(true);
    await fetch(`/api/donations/${id}/simulate`, { method: "POST" });
    setBusy(false);
  }

  async function copy(pr: string) {
    await navigator.clipboard.writeText(pr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (step.kind === "paid") {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-soft text-green">
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
            <path d="m7 13.5 4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </div>
        <h3 className="mt-4 text-[1.5rem]">Thank you.</h3>
        <p className="mt-2 text-ink-2" role="status">
          Your {formatInt(step.sats)} sats (about {formatNgn(satsToNgn(step.sats, ngnPerBtc))}) are
          in escrow for {patientName}&apos;s hospital and already on the public ledger.
        </p>
        <a href={`/d/${step.hash}`} className="btn btn-secondary mt-6 w-full">
          View and verify your receipt
        </a>
        <p className="mt-3 text-[0.8125rem] text-ink-3">
          Bookmark it: your receipt link is the only way to find this donation again.
        </p>
        <button className="btn btn-ghost mt-4 w-full" onClick={() => setStep({ kind: "choose" })}>
          Give again
        </button>
      </div>
    );
  }

  if (step.kind === "invoice") {
    return (
      <div>
        <p className="text-center text-[0.95rem] text-ink-2">
          Scan with any Lightning wallet to give{" "}
          <strong className="text-ink">{formatNgn(satsToNgn(step.sats, ngnPerBtc))}</strong>
          <span className="text-ink-3"> ({formatInt(step.sats)} sats)</span>
        </p>
        <a
          href={`lightning:${step.pr}`}
          className="mx-auto mt-4 block w-fit rounded-[24px] bg-white p-4"
          aria-label="Open the payment request in your wallet app"
        >
          <QRCodeSVG value={step.pr.toUpperCase()} size={232} marginSize={0} level="M" />
        </a>
        <p className="mt-3 flex items-center justify-center gap-2 text-[0.85rem] text-ink-3" aria-live="polite">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green motion-reduce:animate-none" />
          Waiting for payment…
        </p>
        {network === "demo" && (
          <p className="mt-4 rounded-[14px] bg-gold-soft px-3 py-2 text-[0.88rem]">
            This is a demo code: no wallet can pay it. Use &ldquo;Simulate payment&rdquo; below.
          </p>
        )}
        {network === "mutinynet" && (
          <p className="mt-4 rounded-[14px] bg-gold-soft px-3 py-2 text-[0.88rem]">
            Test network (Mutinynet). Ordinary phone wallets can&apos;t pay this. Copy the payment
            request and pay it at{" "}
            <a className="font-semibold underline" href="https://faucet.mutinynet.com/" target="_blank" rel="noopener noreferrer">
              faucet.mutinynet.com
            </a>
            .
          </p>
        )}
        <div className="mt-5 grid gap-2.5">
          <a href={`lightning:${step.pr}`} className="btn btn-primary sm:hidden">
            Open wallet app
          </a>
          <button className="btn btn-secondary" onClick={() => payWithBrowserWallet(step.pr)}>
            Pay with a connected wallet
          </button>
          <button className="btn btn-ghost" onClick={() => copy(step.pr)}>
            {copied ? "Copied" : "Copy payment request"}
          </button>
          {network === "demo" && (
            <button className="btn btn-ghost border-dashed" disabled={busy} onClick={() => simulate(step.id)}>
              Simulate payment (demo only)
            </button>
          )}
        </div>
        <button
          className="mt-4 w-full text-center text-[0.9rem] text-ink-3 underline-offset-4 hover:underline"
          onClick={() => setStep({ kind: "choose" })}
        >
          Change amount
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={createInvoice} noValidate>
      <fieldset>
        <legend className="text-[0.95rem] font-medium">Choose an amount</legend>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {PRESETS_NGN.map((p) => {
            const active = !custom && ngn === p;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setNgn(p);
                  setCustom("");
                }}
                className={`min-h-12 rounded-full border text-[1rem] font-medium transition-colors ${
                  active
                    ? "border-indigo bg-indigo text-indigo-ink"
                    : "border-line-2 bg-card hover:border-ink-3"
                }`}
              >
                {formatNgn(p)}
              </button>
            );
          })}
        </div>
        <label className="mt-3 block">
          <span className="sr-only">Other amount in naira</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3">₦</span>
            <input
              inputMode="numeric"
              className="field !pl-8"
              placeholder="Other amount"
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/[^\d,]/g, ""))}
            />
          </div>
        </label>
        <p className="mt-2 text-[0.85rem] text-ink-3">
          ≈ {formatInt(sats)} sats
          <span title="A sat is the smallest unit of bitcoin. 100 million sats make one bitcoin." className="ml-1 cursor-help underline decoration-dotted underline-offset-2">
            what&apos;s a sat?
          </span>
          {!rateLive && " · approximate rate"}
        </p>
      </fieldset>

      <details className="mt-5 rounded-[16px] border border-line px-4 py-3">
        <summary className="cursor-pointer text-[0.95rem] font-medium">Add your name, a message or email (optional)</summary>
        <div className="mt-3 space-y-3">
          <label className="block text-[0.9rem]">
            Name
            <input className="field mt-1" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Anonymous" />
          </label>
          <label className="block text-[0.9rem]">
            Email for withdrawal updates
            <input className="field mt-1" type="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Never shown publicly" />
          </label>
          <label className="block text-[0.9rem]">
            Message to the family
            <textarea className="field mt-1 !min-h-24" maxLength={280} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
        </div>
      </details>

      {error && (
        <p role="alert" className="mt-4 rounded-[20px] bg-clay-soft px-3 py-2 text-[0.9rem] text-ink">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy} className="btn btn-primary mt-5 w-full">
        {busy ? "Preparing…" : `Give ${amountNgn ? formatNgn(amountNgn) : ""}`}
      </button>
      <p className="mt-3 text-center text-[0.8125rem] text-ink-3">
        Goes to the hospital, never to the family or to Ireti.
      </p>
    </form>
  );
}
