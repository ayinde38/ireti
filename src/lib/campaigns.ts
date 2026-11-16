import "server-only";
import { createHash } from "node:crypto";
import { LightningAddress } from "@getalby/lightning-tools/lnurl";
import { formatInt, formatNgn, satsToNgn } from "./format";
import { invoiceMatchesNetwork, lightning, walletKind } from "./lightning";
import { appUrl, sendEmail } from "./notify";
import { getNgnRate } from "./rates";
import { store } from "./store";
import type {
  AuditEntry,
  Campaign,
  CampaignTotals,
  Donation,
  Hospital,
  Withdrawal,
} from "./types";

/** Statuses a member of the public may see. */
const PUBLIC_STATUSES = ["live", "funded", "withdrawn", "receipt_posted"] as const;
/** Statuses that still accept donations. */
const DONATABLE = ["live", "funded"] as const;
/** Statuses whose escrow the hospital may withdraw from. Frozen stays locked. */
const WITHDRAWABLE = ["live", "funded", "withdrawn", "receipt_posted"] as const;

const includes = (list: readonly string[], s: string) => list.includes(s);
export const isPublic = (c: Campaign) => includes(PUBLIC_STATUSES, c.status);
export const canDonate = (c: Campaign) =>
  includes(DONATABLE, c.status) && Date.parse(c.deadline) > Date.now();
export const canWithdraw = (c: Campaign) => includes(WITHDRAWABLE, c.status);

const sha256Hex = (hex: string) =>
  createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");
const preimageMatches = (preimage: string, hash: string) => {
  try {
    return sha256Hex(preimage) === hash;
  } catch {
    return false;
  }
};

/**
 * Escrow balance is always derived from the ledger: paid donations minus
 * withdrawals that are sent or still in flight. Nothing stores a balance.
 */
function computeTotals(donations: Donation[], withdrawals: Withdrawal[]): CampaignTotals {
  const paid = donations.filter((d) => d.status === "paid");
  const raisedSats = paid.reduce((s, d) => s + d.amountSats, 0);
  const withdrawnSats = withdrawals
    .filter((w) => w.status !== "failed")
    .reduce((s, w) => s + w.amountSats, 0);
  return {
    raisedSats,
    withdrawnSats,
    availableSats: Math.max(0, raisedSats - withdrawnSats),
    donorCount: paid.length,
  };
}

export async function campaignView(c: Campaign) {
  const [hospital, donations, withdrawals, rate] = await Promise.all([
    store.getHospital(c.hospitalId),
    store.listDonations(c.id, { status: "paid" }),
    store.listWithdrawals(c.id),
    getNgnRate(),
  ]);
  const totals = computeTotals(donations, withdrawals);
  // Progress counts each gift at its naira value when it was given, so the
  // bar doesn't move with the bitcoin price.
  const raisedNgn = donations.reduce(
    (s, d) => s + satsToNgn(d.amountSats, d.ngnPerBtcAtPayment ?? rate.ngnPerBtc),
    0,
  );
  const withdrawnNgn = withdrawals
    .filter((w) => w.status !== "failed")
    .reduce((s, w) => s + satsToNgn(w.amountSats, w.ngnPerBtcAtWithdrawal), 0);
  return {
    campaign: c,
    hospital: hospital as Hospital,
    donations,
    withdrawals,
    totals,
    rate,
    raisedNgn,
    withdrawnNgn,
    /** What the escrow is worth if withdrawn today. */
    availableNgn: satsToNgn(totals.availableSats, rate.ngnPerBtc),
    percent: Math.min(100, Math.round((raisedNgn / c.goalNgn) * 100)),
    receiptsPending: withdrawals.filter((w) => w.status === "sent" && !w.receiptUploadedAt).length,
  };
}
export type CampaignView = Awaited<ReturnType<typeof campaignView>>;

export async function listPublicCampaigns() {
  const list = await store.listCampaigns({ status: [...PUBLIC_STATUSES] });
  return Promise.all(list.map(campaignView));
}

// ---------------------------------------------------------------------------
// Public timeline: every deposit, withdrawal and sensitive action, newest first.
// ---------------------------------------------------------------------------

export type TimelineEntry =
  | { kind: "donation"; at: string; d: Donation }
  | { kind: "withdrawal"; at: string; w: Withdrawal }
  | { kind: "event"; at: string; a: AuditEntry };

/** Audit actions already shown by a ledger row are not repeated. */
const SHOWN_BY_LEDGER = new Set(["withdrawal_sent", "withdrawal_failed", "withdrawal_unconfirmed", "withdrawal_resolved"]);

export async function campaignTimeline(v: CampaignView): Promise<TimelineEntry[]> {
  const audit = await store.listAudit(v.campaign.id);
  const entries: TimelineEntry[] = [
    ...v.donations.map((d) => ({ kind: "donation" as const, at: d.paidAt ?? d.createdAt, d })),
    ...v.withdrawals
      .filter((w) => w.status !== "pending")
      .map((w) => ({ kind: "withdrawal" as const, at: w.sentAt ?? w.createdAt, w })),
    ...audit
      .filter((a) => !SHOWN_BY_LEDGER.has(a.action))
      .map((a) => ({ kind: "event" as const, at: a.createdAt, a })),
  ];
  return entries.sort((a, b) => b.at.localeCompare(a.at));
}

// ---------------------------------------------------------------------------
// Money in
// ---------------------------------------------------------------------------

/**
 * Re-checks a donation with the wallet itself. This is the only path that
 * marks a donation paid, so nothing a browser sends can credit a campaign.
 */
export async function settleDonation(d: Donation): Promise<Donation> {
  if (d.status !== "pending") return d;
  const state = await lightning().lookupInvoice(d.paymentHash);
  if (state.paid) {
    if (state.preimage && !preimageMatches(state.preimage, d.paymentHash)) {
      throw new Error(`Preimage does not match payment hash for ${d.id}`);
    }
    const rate = await getNgnRate();
    const updated = await store.settleDonation(d.id, {
      status: "paid",
      paidAt: new Date().toISOString(),
      preimage: state.preimage,
      ngnPerBtcAtPayment: rate.ngnPerBtc,
    });
    if (updated.status === "paid" && d.status === "pending") {
      await afterDonation(updated).catch((e) => console.error("afterDonation", e));
    }
    return updated;
  }
  if (state.expired || Date.parse(d.expiresAt) < Date.now() - 60_000) {
    return store.settleDonation(d.id, { status: "expired" });
  }
  return d;
}

async function afterDonation(d: Donation) {
  const c = await store.getCampaign(d.campaignId);
  if (!c) return;
  const v = await campaignView(c);
  if (c.status === "live" && v.raisedNgn >= c.goalNgn) {
    await store.updateCampaign(c.id, { status: "funded" });
    await store.addAudit({ role: "system", actorEmail: null, action: "goal_reached", campaignId: c.id, details: null });
  }
  const ngn = formatNgn(satsToNgn(d.amountSats, v.rate.ngnPerBtc));
  await sendEmail(
    [c.campaignerEmail],
    `New donation for ${c.patientDisplayName}: ${ngn}`,
    `${d.donorName ?? "Someone"} gave ${ngn} (${formatInt(d.amountSats)} sats) to "${c.title}".\n` +
      `It is held in escrow for ${v.hospital.name}. Total raised: ${formatNgn(v.raisedNgn)} of ${formatNgn(c.goalNgn)}.\n\n` +
      `Follow every payment: ${appUrl()}/c/${c.slug}`,
  );
}

// ---------------------------------------------------------------------------
// Money out: one campaign at a time, to that campaign's hospital only.
// ---------------------------------------------------------------------------

export class WithdrawalError extends Error {}

export async function withdrawFromCampaign(opts: {
  campaign: Campaign;
  hospital: Hospital;
  amountSats: number;
  method: "lightning" | "bank";
  idempotencyKey: string;
  requestedBy: string;
}): Promise<Withdrawal> {
  const { campaign, hospital, amountSats, method, idempotencyKey, requestedBy } = opts;

  // A double click or a retried request returns the first withdrawal.
  const existing = await store.getWithdrawalByIdempotencyKey(idempotencyKey);
  if (existing) {
    if (existing.status === "failed") throw new WithdrawalError("That attempt failed. Please try again.");
    if (existing.status === "pending") throw new WithdrawalError("This withdrawal is still being checked.");
    return existing;
  }

  if (campaign.hospitalId !== hospital.id) throw new WithdrawalError("This campaign belongs to another hospital.");
  if (!canWithdraw(campaign)) {
    throw new WithdrawalError(
      campaign.status === "frozen"
        ? "This campaign is paused for review, so its balance is locked."
        : "This campaign is not verified yet.",
    );
  }
  if (method === "bank" && walletKind() !== "demo") {
    throw new WithdrawalError("Bank payouts aren't available yet. Please withdraw to your Lightning address.");
  }
  if (method === "lightning" && !hospital.lightningAddressVerified) {
    throw new WithdrawalError("Your Lightning address has not been verified by Ireti yet.");
  }

  const v = await campaignView(campaign);
  const minSats = Math.ceil((hospital.minWithdrawalNgn / v.rate.ngnPerBtc) * 1e8);
  if (!Number.isInteger(amountSats) || amountSats <= 0) throw new WithdrawalError("Enter an amount.");
  if (amountSats > v.totals.availableSats) {
    throw new WithdrawalError("That is more than this campaign's available balance.");
  }
  if (amountSats < minSats && amountSats !== v.totals.availableSats) {
    throw new WithdrawalError(`The minimum withdrawal is ${formatNgn(hospital.minWithdrawalNgn)}.`);
  }

  // Ledger row first. Its existence reduces the available balance, so a
  // second request can't pay the same money twice.
  const destination =
    method === "lightning" ? hospital.lightningAddress : `${hospital.bankName ?? "Bank"} ••••${hospital.bankAccountLast4 ?? ""}`;
  const w = await store.createWithdrawal({
    campaignId: campaign.id,
    hospitalId: hospital.id,
    amountSats,
    ngnPerBtcAtWithdrawal: v.rate.ngnPerBtc,
    method,
    destination,
    idempotencyKey,
    requestedBy,
  });

  const audit = (action: string) =>
    store.addAudit({ role: "hospital", actorEmail: requestedBy, action, campaignId: campaign.id, details: `${formatInt(amountSats)} sats` });

  let sent: Withdrawal;
  if (method === "bank") {
    // Demo only: stands in for the Bitnob naira payout that comes after the MVP.
    sent = await store.patchWithdrawal(w.id, {
      kind: "sent",
      sentAt: new Date().toISOString(),
      paymentHash: null,
      preimage: null,
      payoutRef: `BITNOB-STUB-${w.id.slice(-8).toUpperCase()}`,
    });
  } else {
    // Step 1: get an invoice from the hospital's own verified address.
    // Nothing has been paid yet, so a failure here is safe to mark failed.
    let invoice = "demo";
    let invoiceHash: string | null = null;
    try {
      if (walletKind() !== "demo") {
        const ln = new LightningAddress(hospital.lightningAddress);
        await ln.fetch();
        const inv = await ln.requestInvoice({
          satoshi: amountSats,
          comment: `Ireti withdrawal ${w.id} for ${campaign.billReference}`,
        });
        if (inv.satoshi !== amountSats) throw new Error("Hospital wallet returned a wrong amount");
        if (!invoiceMatchesNetwork(inv.paymentRequest)) throw new Error("Hospital address is on a different network");
        invoice = inv.paymentRequest;
        invoiceHash = inv.paymentHash;
      }
    } catch (err) {
      await store.patchWithdrawal(w.id, { kind: "failed" });
      await audit("withdrawal_failed");
      console.error("withdrawal invoice failed", err);
      throw new WithdrawalError("We couldn't reach your Lightning address. Nothing was sent; please try again.");
    }

    // Step 2: pay. An error here can mean "failed" or "sent but the reply was
    // lost", so we ask the wallet before deciding. If it still isn't clear,
    // the withdrawal stays pending (its amount reserved) for an admin to
    // resolve: freeing it wrongly could pay the hospital twice.
    let proof: { preimage: string; paymentHash: string | null } | null = null;
    try {
      proof = await lightning().payInvoice(invoice);
    } catch (err) {
      console.error("withdrawal payment unconfirmed", err);
      if (invoiceHash) {
        const state = await lightning().lookupInvoice(invoiceHash).catch(() => null);
        if (state?.paid && state.preimage) proof = { preimage: state.preimage, paymentHash: invoiceHash };
      }
    }
    if (!proof) {
      await audit("withdrawal_unconfirmed");
      throw new WithdrawalError(
        "We couldn't confirm this payment. The amount is reserved while Ireti checks it; please don't retry.",
      );
    }
    sent = await store.patchWithdrawal(w.id, {
      kind: "sent",
      sentAt: new Date().toISOString(),
      preimage: proof.preimage,
      paymentHash: proof.paymentHash ?? sha256Hex(proof.preimage),
      payoutRef: null,
    });
  }

  await audit("withdrawal_sent");

  const after = await campaignView(campaign);
  if (after.totals.availableSats === 0 && campaign.status === "funded") {
    await store.updateCampaign(campaign.id, { status: "withdrawn" });
  }
  await notifyWithdrawal(campaign, hospital, sent, after.rate.ngnPerBtc).catch((e) => console.error("notify", e));
  return sent;
}

async function notifyWithdrawal(c: Campaign, h: Hospital, w: Withdrawal, rate: number) {
  const donors = await store.listDonations(c.id, { status: "paid" });
  const ngn = formatNgn(satsToNgn(w.amountSats, rate));
  await sendEmail(
    [c.campaignerEmail, ...donors.map((d) => d.donorEmail ?? "")],
    `${h.name} withdrew ${ngn} for ${c.patientDisplayName}`,
    `${h.name} withdrew ${ngn} (${formatInt(w.amountSats)} sats) from the escrow for "${c.title}".\n` +
      `Sent to: ${w.destination}\nPayment hash: ${w.paymentHash ?? w.payoutRef}\n\n` +
      `The hospital will post a receipt here: ${appUrl()}/c/${c.slug}#timeline`,
  );
}

export async function postReceipt(opts: {
  withdrawal: Withdrawal;
  campaign: Campaign;
  file: File | null;
  note: string | null;
  actorEmail: string;
}) {
  const { withdrawal, campaign, file, note, actorEmail } = opts;
  const url = file ? await store.saveReceiptFile(withdrawal.id, file) : null;
  await store.patchWithdrawal(withdrawal.id, {
    kind: "receipt",
    receiptUrl: url,
    receiptNote: note,
    receiptUploadedAt: new Date().toISOString(),
  });
  await store.addAudit({ role: "hospital", actorEmail, action: "receipt_uploaded", campaignId: campaign.id, details: null });
  const v = await campaignView(campaign);
  if (campaign.status === "withdrawn" && v.receiptsPending === 0) {
    await store.updateCampaign(campaign.id, { status: "receipt_posted" });
  }
}

// ---------------------------------------------------------------------------
// Proof of reserves
// ---------------------------------------------------------------------------

export async function takeReserveSnapshot() {
  const [wallet, ledger] = await Promise.all([lightning().getBalanceSats(), store.ledgerTotalSats()]);
  const snap = await store.addSnapshot({
    walletBalanceSats: wallet,
    ledgerTotalSats: ledger,
    differenceSats: wallet - ledger,
  });
  if (snap.differenceSats < 0) {
    await sendEmail(
      [process.env.ADMIN_EMAIL ?? ""],
      "Ireti reserve alert: wallet is below the ledger",
      `Wallet ${wallet} sats, ledger ${ledger} sats, gap ${snap.differenceSats} sats at ${snap.takenAt}.`,
    );
  }
  return snap;
}
