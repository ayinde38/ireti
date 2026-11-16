"use server";

import { revalidatePath } from "next/cache";
import { familyTokenHash } from "@/lib/secrets";
import { store } from "@/lib/store";

export async function confirmApplied(token: string, withdrawalId: string) {
  const c = await store.getCampaignByFamilyTokenHash(familyTokenHash(token));
  if (!c) return { error: "This link is not valid." };
  const w = await store.getWithdrawal(withdrawalId);
  if (!w || w.campaignId !== c.id || w.status !== "sent") return { error: "Withdrawal not found." };
  if (w.familyConfirmedAt) return { ok: true };
  await store.patchWithdrawal(w.id, { kind: "family_confirmed", familyConfirmedAt: new Date().toISOString() });
  await store.addAudit({ role: "family", actorEmail: c.campaignerEmail, action: "family_confirmed", campaignId: c.id, details: null });
  revalidatePath(`/family/${token}`);
  return { ok: true };
}
