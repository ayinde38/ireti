"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { clientIp } from "@/lib/client-ip";
import { currentHospitalUser, signInHospital, signOutHospital } from "@/lib/auth";
import { campaignView, postReceipt, withdrawFromCampaign, WithdrawalError } from "@/lib/campaigns";
import { fiatToSats } from "@/lib/format";
import { appUrl, sendEmail } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { store } from "@/lib/store";

export type FormState = { error?: string; ok?: string; nextKey?: string } | undefined;

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const ip = clientIp(await headers());
  if (!rateLimit(`hospital-login:${ip}`, 10, 15 * 60_000)) {
    return { error: "Too many attempts. Please wait 15 minutes." };
  }
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  // Per account too, so guessing one hospital's code from many IPs is slow.
  if (!rateLimit(`hospital-login-account:${email}`, 10, 15 * 60_000)) {
    return { error: "Too many attempts for this account. Please wait 15 minutes." };
  }
  const ok = await signInHospital(email, String(form.get("code") ?? ""));
  if (!ok) return { error: "That email and access code don't match a hospital account." };
  redirect("/hospital");
}

export async function signOut() {
  await signOutHospital();
  redirect("/hospital");
}

async function requireHospital() {
  const s = await currentHospitalUser();
  if (!s) throw new Error("Not signed in");
  // A registered hospital can sign in at once, but touches bills and money only once verified.
  if (!s.hospital.verified) throw new Error("Hospital not verified yet");
  return s;
}

async function ownCampaign(id: string, hospitalId: string) {
  const c = await store.getCampaign(id);
  if (!c || c.hospitalId !== hospitalId) throw new Error("Campaign not found");
  return c;
}

export async function reviewBill(_: FormState, form: FormData): Promise<FormState> {
  const { user, hospital } = await requireHospital();
  const c = await ownCampaign(String(form.get("campaignId")), hospital.id);
  if (c.status !== "pending_verification") return { error: "This bill has already been reviewed." };
  const decision = form.get("decision");
  if (decision === "approve") {
    await store.updateCampaign(c.id, { status: "live", verifiedAt: new Date().toISOString() });
    await store.addAudit({ role: "hospital", actorEmail: user.email, action: "bill_approved", campaignId: c.id, details: c.billReference });
    await sendEmail([c.campaignerEmail], `${c.title} is live`, `${hospital.name} confirmed bill ${c.billReference}. Share your campaign: ${appUrl()}/c/${c.slug}`);
  } else {
    const reason = String(form.get("reason") ?? "").trim().slice(0, 200) || null;
    await store.updateCampaign(c.id, { status: "rejected", rejectionReason: reason });
    await store.addAudit({ role: "hospital", actorEmail: user.email, action: "bill_rejected", campaignId: c.id, details: reason });
    await sendEmail([c.campaignerEmail], `${hospital.name} could not confirm your bill`, `Reason: ${reason ?? "not given"}. Please check the reference with the billing office.`);
  }
  revalidatePath("/hospital");
  return { ok: decision === "approve" ? "Approved. The campaign is now live." : "Rejected." };
}

export async function withdraw(_: FormState, form: FormData): Promise<FormState> {
  const { user, hospital } = await requireHospital();
  const c = await ownCampaign(String(form.get("campaignId")), hospital.id);
  const v = await campaignView(c);
  const all = form.get("all") === "1";
  const amount = Number(String(form.get("amount") ?? "").replace(/[^\d]/g, ""));
  const amountSats = all ? v.totals.availableSats : Math.min(fiatToSats(amount, v.rate.fiatPerBtc), v.totals.availableSats);
  const m = form.get("method");
  const method = m === "bank" || m === "test_wallet" ? m : "lightning";
  try {
    await withdrawFromCampaign({
      campaign: c,
      hospital,
      amountSats,
      method,
      idempotencyKey: String(form.get("idempotencyKey")),
      requestedBy: user.email,
    });
  } catch (err) {
    if (err instanceof WithdrawalError) return { error: err.message, nextKey: randomUUID() };
    // Anything else failed before money moved (or was recorded as pending).
    console.error("withdraw failed", err);
    return { error: "Something went wrong, and nothing was sent. Please try again.", nextKey: randomUUID() };
  }
  revalidatePath("/hospital");
  return {
    ok: "Sent. Please upload the receipt once the payment is applied to the bill.",
    nextKey: randomUUID(),
  };
}

/**
 * The file's real type, from its first bytes. The browser-sent type is
 * whatever the uploader says, so it's never trusted: receipts are served
 * publicly from our domain, and only these four formats may be.
 */
function sniffReceiptType(b: Uint8Array): string | null {
  const at = (i: number, ...xs: number[]) => xs.every((x, k) => b[i + k] === x);
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
  return null;
}

export async function uploadReceipt(_: FormState, form: FormData): Promise<FormState> {
  const { user, hospital } = await requireHospital();
  const w = await store.getWithdrawal(String(form.get("withdrawalId")));
  if (!w || w.hospitalId !== hospital.id) return { error: "Withdrawal not found." };
  if (w.receiptUploadedAt) return { error: "A receipt was already posted for this withdrawal." };
  const c = await ownCampaign(w.campaignId, hospital.id);
  const file = form.get("file");
  const note = String(form.get("note") ?? "").trim().slice(0, 300) || null;
  const f = file instanceof File && file.size > 0 ? file : null;
  if (!f) return { error: "Attach the receipt (photo or PDF)." };
  if (f.size > 4 * 1024 * 1024) return { error: "The file must be under 4 MB." };
  const bytes = new Uint8Array(await f.arrayBuffer());
  const type = sniffReceiptType(bytes);
  if (!type) return { error: "Use a JPG, PNG, WebP or PDF file." };
  const clean = new File([bytes], "receipt", { type });
  await postReceipt({ withdrawal: w, campaign: c, file: clean, note, actorEmail: user.email });
  revalidatePath("/hospital");
  return { ok: "Receipt posted. Donors can see it now." };
}
