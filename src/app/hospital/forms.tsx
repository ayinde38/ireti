"use client";

import { useActionState, useState } from "react";
import { formatInt, formatNgn, satsToNgn } from "@/lib/format";
import { reviewBill, signIn, uploadReceipt, withdraw, type FormState } from "./actions";

function Msg({ s }: { s: FormState }) {
  if (!s) return null;
  if (s.error) return <p role="alert" className="mt-3 rounded-[20px] bg-clay-soft px-3 py-2 text-[0.9rem]">{s.error}</p>;
  if (s.ok) return <p role="status" className="mt-3 rounded-[20px] bg-green-soft px-3 py-2 text-[0.9rem]">{s.ok}</p>;
  return null;
}

export function SignInForm({ demo }: { demo: boolean }) {
  const [s, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="space-y-4">
      <label className="block text-[0.95rem] font-medium">
        Work email
        <input name="email" type="email" autoComplete="username" required className="field mt-1.5" defaultValue={demo ? "billing@harbourview.test" : ""} />
      </label>
      <label className="block text-[0.95rem] font-medium">
        Access code
        <input name="code" type="password" autoComplete="current-password" required className="field mt-1.5" defaultValue={demo ? "ireti-demo" : ""} />
      </label>
      <Msg s={s} />
      <button className="btn btn-secondary w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      {demo && (
        <p className="text-[0.85rem] text-ink-3">
          Demo accounts: billing@harbourview.test or accounts@ibadanhills.test, code ireti-demo.
        </p>
      )}
    </form>
  );
}

export function ReviewForm({ campaignId }: { campaignId: string }) {
  const [s, action, pending] = useActionState(reviewBill, undefined);
  const [rejecting, setRejecting] = useState(false);
  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="campaignId" value={campaignId} />
      {rejecting && (
        <label className="mb-3 block text-[0.9rem]">
          Reason the family will see
          <input name="reason" className="field mt-1" placeholder="e.g. Bill reference not found" />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {!rejecting ? (
          <>
            <button name="decision" value="approve" className="btn btn-secondary" disabled={pending}>
              Bill is correct, approve
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setRejecting(true)}>
              Reject
            </button>
          </>
        ) : (
          <>
            <button name="decision" value="reject" className="btn btn-ghost !border-clay !text-clay" disabled={pending}>
              Confirm rejection
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setRejecting(false)}>Cancel</button>
          </>
        )}
      </div>
      <Msg s={s} />
    </form>
  );
}

export function WithdrawForm({
  campaignId,
  availableSats,
  ngnPerBtc,
  minNgn,
  bankLabel,
  testFaucet,
  initialKey,
}: {
  campaignId: string;
  availableSats: number;
  ngnPerBtc: number;
  minNgn: number;
  bankLabel: string | null;
  /** Test network: offer the Mutinynet faucet as a stand-in hospital wallet. */
  testFaucet: boolean;
  initialKey: string;
}) {
  const [s, action, pending] = useActionState(withdraw, undefined);
  // One idempotency key per attempt, minted on the server: a double click
  // sends the same key twice and the server returns the first withdrawal
  // instead of paying again. Each response carries the key for the next try.
  const key = s?.nextKey ?? initialKey;
  const [amount, setAmount] = useState("");
  const availableNgn = satsToNgn(availableSats, ngnPerBtc);

  return (
    <form action={action} className="mt-4 rounded-[18px] bg-paper p-4">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="idempotencyKey" value={key} />
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="block text-[0.9rem]">
          Amount to withdraw (₦)
          <input
            name="amountNgn"
            inputMode="numeric"
            className="field mt-1"
            placeholder={`Up to ${formatNgn(availableNgn)}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
          />
        </label>
        <label className="block text-[0.9rem]">
          Pay to
          <select name="method" className="field mt-1">
            {testFaucet && <option value="test_faucet">Mutinynet faucet (test payout)</option>}
            <option value="lightning">Lightning address</option>
            {bankLabel && <option value="bank">{bankLabel} (demo)</option>}
          </select>
        </label>
      </div>
      <p className="mt-2 text-[0.82rem] text-ink-3">
        Minimum {formatNgn(minNgn)} unless you withdraw everything. ≈ {formatInt(Math.round((Number(amount || 0) / ngnPerBtc) * 1e8))} sats.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={pending || !amount}>
          {pending ? "Sending…" : "Withdraw"}
        </button>
        <button name="all" value="1" className="btn btn-ghost" disabled={pending}>
          Withdraw all {formatNgn(availableNgn)}
        </button>
      </div>
      <Msg s={s} />
    </form>
  );
}

export function ReceiptForm({ withdrawalId }: { withdrawalId: string }) {
  const [s, action, pending] = useActionState(uploadReceipt, undefined);
  return (
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="withdrawalId" value={withdrawalId} />
      <label className="block text-[0.9rem]">
        Receipt (photo or PDF, under 4 MB). Cover the patient&apos;s full name and ID first.
        <input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="field mt-1 !py-2" required />
      </label>
      <label className="block text-[0.9rem]">
        Note for donors (optional)
        <input name="note" className="field mt-1" maxLength={300} placeholder="e.g. Applied to theatre fees, receipt R/1042" />
      </label>
      <button className="btn btn-secondary" disabled={pending}>{pending ? "Uploading…" : "Post receipt"}</button>
      <Msg s={s} />
    </form>
  );
}
