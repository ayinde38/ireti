"use server";

import { LightningAddress } from "@getalby/lightning-tools/lnurl";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAdmin, signInAdmin, signOutAdmin } from "@/lib/auth";
import { walletKind } from "@/lib/lightning";
import { rateLimit } from "@/lib/rate-limit";
import { store } from "@/lib/store";

export type AdminState = { error?: string; ok?: string } | undefined;

export async function adminSignIn(_: AdminState, form: FormData): Promise<AdminState> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!rateLimit(`admin-login:${ip}`, 5, 15 * 60_000)) return { error: "Too many attempts." };
  if (!(await signInAdmin(String(form.get("password") ?? "")))) return { error: "Wrong password." };
  redirect("/admin");
}

export async function adminSignOut() {
  await signOutAdmin();
  redirect("/admin");
}

async function guard() {
  if (!(await isAdmin())) throw new Error("Not authorised");
}

/** Resolve the hospital's Lightning address before trusting it with payouts. */
export async function verifyHospital(form: FormData) {
  await guard();
  const h = await store.getHospital(String(form.get("hospitalId")));
  if (!h) return;
  let addressOk = walletKind() === "demo";
  if (!addressOk) {
    try {
      const ln = new LightningAddress(h.lightningAddress, { proxy: false });
      await ln.fetch();
      addressOk = Boolean(ln.lnurlpData?.callback);
    } catch {
      addressOk = false;
    }
  }
  await store.updateHospital(h.id, { verified: true, lightningAddressVerified: addressOk });
  revalidatePath("/admin");
}

export async function setFrozen(form: FormData) {
  await guard();
  const c = await store.getCampaign(String(form.get("campaignId")));
  if (!c) return;
  const freeze = form.get("freeze") === "1";
  if (freeze && c.status !== "frozen") {
    // Remember where to return to in the audit details.
    await store.updateCampaign(c.id, { status: "frozen" });
    await store.addAudit({ role: "admin", actorEmail: null, action: "campaign_frozen", campaignId: c.id, details: c.status });
  } else if (!freeze && c.status === "frozen") {
    const history = await store.listAudit(c.id);
    const prev = history.find((a) => a.action === "campaign_frozen")?.details;
    const restore = prev && prev !== "frozen" ? prev : "live";
    await store.updateCampaign(c.id, { status: restore as typeof c.status });
    await store.addAudit({ role: "admin", actorEmail: null, action: "campaign_unfrozen", campaignId: c.id, details: null });
  }
  revalidatePath("/admin");
}

/**
 * An unconfirmed payout stays pending with its amount reserved. After checking
 * the wallet's own history, the admin frees it only if it truly did not pay.
 */
export async function markWithdrawalFailed(form: FormData) {
  await guard();
  const w = await store.getWithdrawal(String(form.get("withdrawalId")));
  if (!w || w.status !== "pending") return;
  await store.patchWithdrawal(w.id, { kind: "failed" });
  await store.addAudit({ role: "admin", actorEmail: null, action: "withdrawal_resolved", campaignId: w.campaignId, details: "marked failed after wallet check" });
  revalidatePath("/admin");
}
