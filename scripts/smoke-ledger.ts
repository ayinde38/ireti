/**
 * Ledger smoke test against a throwaway in-memory database (same migrations
 * and triggers as production) and the demo wallet.
 * Run: npm run test:ledger
 */
import assert from "node:assert/strict";
import { campaignView, postReceipt, takeReserveSnapshot, withdrawFromCampaign, WithdrawalError } from "@/lib/campaigns";
import { sql } from "@/lib/db";
import { store } from "@/lib/store";

async function main() {
  const c = (await store.getCampaignBySlug("amara-heart-surgery"))!;
  const h = (await store.getHospital(c.hospitalId))!;
  const before = await campaignView(c);
  assert.ok(before.totals.availableSats > 0, "has escrow");

  // Withdraw part of the balance.
  const w = await withdrawFromCampaign({ campaign: c, hospital: h, amountSats: 100_000, method: "lightning", idempotencyKey: "k1", requestedBy: "t@test" });
  assert.equal(w.status, "sent");
  assert.match(w.paymentHash ?? "", /^[0-9a-f]{64}$/);

  // Same idempotency key = same withdrawal, no second payment.
  const again = await withdrawFromCampaign({ campaign: c, hospital: h, amountSats: 100_000, method: "lightning", idempotencyKey: "k1", requestedBy: "t@test" });
  assert.equal(again.id, w.id);
  const mid = await campaignView(c);
  assert.equal(mid.totals.availableSats, before.totals.availableSats - 100_000, "paid once");

  // Over-withdrawal refused.
  await assert.rejects(
    withdrawFromCampaign({ campaign: c, hospital: h, amountSats: mid.totals.availableSats + 1, method: "lightning", idempotencyKey: "k2", requestedBy: "t@test" }),
    WithdrawalError,
  );

  // Another hospital can't touch it.
  const other = (await store.getHospital("hosp_harbour"))!;
  await assert.rejects(
    withdrawFromCampaign({ campaign: c, hospital: other, amountSats: 1000, method: "lightning", idempotencyKey: "k3", requestedBy: "t@test" }),
    WithdrawalError,
  );

  // Frozen campaign is locked.
  await store.updateCampaign(c.id, { status: "frozen" });
  await assert.rejects(
    withdrawFromCampaign({ campaign: { ...c, status: "frozen" }, hospital: h, amountSats: 1000, method: "lightning", idempotencyKey: "k4", requestedBy: "t@test" }),
    WithdrawalError,
  );
  await store.updateCampaign(c.id, { status: "live" });

  // Receipt: once only. Family confirmation: once only.
  const file = new File([new Uint8Array([1, 2, 3])], "r.png", { type: "image/png" });
  await postReceipt({ withdrawal: w, campaign: c, file, note: "theatre fees", actorEmail: "t@test" });
  const withReceipt = (await store.getWithdrawal(w.id))!;
  assert.ok(withReceipt.receiptUploadedAt && withReceipt.receiptUrl);
  await assert.rejects(store.patchWithdrawal(w.id, { kind: "receipt", receiptUrl: null, receiptNote: "x", receiptUploadedAt: new Date().toISOString() }));
  await store.patchWithdrawal(w.id, { kind: "family_confirmed", familyConfirmedAt: new Date().toISOString() });
  const later = new Date(Date.now() + 60_000).toISOString();
  await assert.rejects(store.patchWithdrawal(w.id, { kind: "family_confirmed", familyConfirmedAt: later }));

  // Settled donations never change.
  const d = (await store.listDonations(c.id, { status: "paid" }))[0];
  const after = await store.settleDonation(d.id, { status: "expired" });
  assert.equal(after.status, "paid");

  // Proof of reserves balances with the demo wallet.
  const snap = await takeReserveSnapshot();
  assert.equal(snap.differenceSats, 0);

  // Audit trail recorded the withdrawal and receipt.
  const audit = await store.listAudit(c.id);
  assert.ok(audit.some((a) => a.action === "withdrawal_sent"));
  assert.ok(audit.some((a) => a.action === "receipt_uploaded"));

  // The database itself refuses tampering, even bypassing the app.
  const db = await sql();
  await assert.rejects(db.query("delete from donations where id = $1", [d.id]), /append-only/);
  await assert.rejects(db.query("update donations set amount_sats = 1 where id = $1", [d.id]), /settled/);
  await assert.rejects(db.query("update withdrawals set amount_sats = 1 where id = $1", [w.id]), /immutable/);
  await assert.rejects(db.query("update audit_log set action = 'x'"), /append-only/);

  // Receipt file is stored and served back.
  const fileId = withReceipt.receiptUrl!.split("/").pop()!;
  const stored = await store.getReceiptFile(fileId);
  assert.deepEqual([...stored!.data], [1, 2, 3]);

  console.log("ledger smoke test: all checks passed");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
