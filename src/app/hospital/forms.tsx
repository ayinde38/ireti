"use client";

import { cn } from "cn";
import { useActionState, useState } from "react";
import { FileDrop, FormField, MoneyInput } from "@/components/form-controls";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { currencySymbol, formatInt, formatMoney, fiatToSats, satsToFiat } from "@/lib/format";
import type { WithdrawalMethod } from "@/lib/types";
import { toast } from "sonner";
import { reviewBill, signIn, uploadReceipt, withdraw, type FormState } from "./actions";

/**
 * Success also shows as a toast: approving a bill, withdrawing everything or
 * posting the last receipt removes the form (and its inline message) from
 * the page, and the hospital must still see that it worked.
 */
const withToast =
  (fn: (s: FormState, f: FormData) => Promise<FormState>) =>
  async (s: FormState, f: FormData) => {
    const r = await fn(s, f);
    if (r?.ok) toast.success(r.ok);
    return r;
  };
const reviewBillT = withToast(reviewBill);
const withdrawT = withToast(withdraw);
const uploadReceiptT = withToast(uploadReceipt);

function Msg({ s }: { s: FormState }) {
  if (!s) return null;
  if (s.error) return <p role="alert" className="mt-3 rounded-[14px] bg-clay-soft px-3.5 py-2.5 text-[0.92rem]">{s.error}</p>;
  if (s.ok) return <p role="status" className="mt-3 rounded-[14px] bg-green-soft px-3.5 py-2.5 text-[0.92rem]">{s.ok}</p>;
  return null;
}

export function SignInForm({ demo }: { demo: boolean }) {
  const [s, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="space-y-5">
      <FormField label="Work email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required defaultValue={demo ? "billing@harbourview.test" : ""} />
      </FormField>
      <FormField label="Access code" htmlFor="code">
        <Input id="code" name="code" type="password" autoComplete="current-password" required defaultValue={demo ? "ireti-demo" : ""} />
      </FormField>
      <Msg s={s} />
      <button className="btn btn-secondary w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      {demo && (
        <p className="text-[0.85rem] text-ink-3">
          Demo accounts: billing@harbourview.test, accounts@ibadanhills.test or billing@riverside.test (Kenya); finance@northgate.test is
          still under review. Code: ireti-demo.
        </p>
      )}
    </form>
  );
}

/** The hospital ticks off what it checked before a bill can go live. */
export function ReviewForm({ campaignId, billReference, amount }: { campaignId: string; billReference: string; amount: string }) {
  const [s, action, pending] = useActionState(reviewBillT, undefined);
  const [rejecting, setRejecting] = useState(false);
  const checks = [
    `Bill ${billReference} exists in our billing system`,
    `The amount owed is ${amount} (or more)`,
    "The patient is being treated, or was treated, here",
  ];
  const [ticked, setTicked] = useState<boolean[]>(checks.map(() => false));
  const all = ticked.every(Boolean);

  return (
    <form action={action} className="mt-5 border-t border-line pt-5">
      <input type="hidden" name="campaignId" value={campaignId} />
      {!rejecting ? (
        <>
          <p className="text-[0.92rem] font-medium">Before approving, confirm:</p>
          <div className="mt-3 space-y-2.5">
            {checks.map((label, i) => (
              <label key={label} className="flex items-start gap-3 text-[0.95rem]">
                <Checkbox
                  className="mt-0.5"
                  checked={ticked[i]}
                  onCheckedChange={(v) => setTicked((t) => t.map((x, j) => (j === i ? v === true : x)))}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button name="decision" value="approve" className="btn btn-secondary" disabled={pending || !all}>
              {pending ? "Saving…" : "Approve: the campaign goes live"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setRejecting(true)}>
              Reject
            </button>
          </div>
          {!all && <p className="mt-2 text-[0.85rem] text-ink-3">Tick all three to approve.</p>}
        </>
      ) : (
        <>
          <FormField label="Reason the family will see" htmlFor={`reason-${campaignId}`} hint="Be specific, so they can fix it with your billing office.">
            <Textarea id={`reason-${campaignId}`} name="reason" className="min-h-20" maxLength={200} placeholder="e.g. We couldn't find this bill reference. Please check the number on your invoice." />
          </FormField>
          <div className="mt-4 flex flex-wrap gap-2">
            <button name="decision" value="reject" className="btn btn-ghost !border-clay !text-clay" disabled={pending}>
              Confirm rejection
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setRejecting(false)}>Cancel</button>
          </div>
        </>
      )}
      <Msg s={s} />
    </form>
  );
}

export interface PayoutOption {
  value: WithdrawalMethod;
  title: string;
  detail: string;
  available: boolean;
}

export function WithdrawForm({
  campaignId,
  availableSats,
  fiatPerBtc,
  currency,
  minAmount,
  options,
  initialKey,
}: {
  campaignId: string;
  availableSats: number;
  fiatPerBtc: number;
  currency: string;
  minAmount: number;
  options: PayoutOption[];
  initialKey: string;
}) {
  const [s, action, pending] = useActionState(withdrawT, undefined);
  // One idempotency key per attempt, minted on the server: a double click
  // sends the same key twice and the server returns the first withdrawal
  // instead of paying again. Each response carries the key for the next try.
  const key = s?.nextKey ?? initialKey;
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>(options.find((o) => o.available)?.value ?? "");
  const available = satsToFiat(availableSats, fiatPerBtc);
  const canPay = Boolean(method);

  return (
    <form action={action} className="mt-5 rounded-[18px] bg-paper p-5">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="idempotencyKey" value={key} />
      <input type="hidden" name="method" value={method} />

      <p className="text-[0.95rem] font-medium">Pay to</p>
      <RadioGroup value={method} onValueChange={setMethod} className="mt-2.5 gap-2.5">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex items-start gap-3 rounded-[14px] border bg-white p-3.5 transition-colors",
              o.available ? "cursor-pointer hover:border-ink-3" : "cursor-not-allowed opacity-60",
              method === o.value ? "border-indigo ring-1 ring-indigo" : "border-line-2",
            )}
          >
            <RadioGroupItem value={o.value} disabled={!o.available} className="mt-0.5" />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2 font-medium">
                {o.title}
                {!o.available && o.value === "bank" && (
                  <span className="rounded bg-sand px-1.5 py-0.5 text-[0.75rem] font-medium text-indigo">Coming soon</span>
                )}
                {!o.available && o.value === "lightning" && (
                  <span className="rounded bg-gold-soft px-1.5 py-0.5 text-[0.75rem] font-medium text-gold">Not checked yet</span>
                )}
              </span>
              <span className="block break-words text-[0.88rem] text-ink-3">{o.detail}</span>
            </span>
          </label>
        ))}
      </RadioGroup>

      <div className="mt-5">
        <FormField
          label="Amount to withdraw"
          htmlFor={`amount-${campaignId}`}
          hint={`Up to ${formatMoney(available, currency)}. Minimum ${formatMoney(minAmount, currency)} unless you withdraw everything. ≈ ${formatInt(fiatToSats(Number(amount || 0), fiatPerBtc))} sats.`}
        >
          <MoneyInput
            id={`amount-${campaignId}`}
            name="amount"
            symbol={currencySymbol(currency)}
            currency={currency}
            value={amount}
            onValueChange={setAmount}
            placeholder="0"
          />
        </FormField>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={pending || !amount || !canPay}>
          {pending ? "Sending…" : "Withdraw"}
        </button>
        <button name="all" value="1" className="btn btn-ghost" disabled={pending || !canPay}>
          Withdraw all {formatMoney(available, currency)}
        </button>
      </div>
      {!canPay && <p className="mt-2 text-[0.88rem] text-ink-3">No payout option is ready yet. Ireti will let you know once your Lightning address is checked.</p>}
      <Msg s={s} />
    </form>
  );
}

export function ReceiptForm({ withdrawalId }: { withdrawalId: string }) {
  const [s, action, pending] = useActionState(uploadReceiptT, undefined);
  return (
    <form action={action} className="mt-4 space-y-4">
      <input type="hidden" name="withdrawalId" value={withdrawalId} />
      <FileDrop name="file" accept="image/jpeg,image/png,image/webp,application/pdf" maxMb={4} hint="Photo or PDF" />
      <FormField label="Note for donors (optional)" htmlFor={`note-${withdrawalId}`}>
        <Input id={`note-${withdrawalId}`} name="note" maxLength={300} placeholder="e.g. Applied to theatre fees, receipt R/1042. Balance left 120,000." />
      </FormField>
      <button className="btn btn-secondary" disabled={pending}>{pending ? "Uploading…" : "Post receipt"}</button>
      <Msg s={s} />
    </form>
  );
}
