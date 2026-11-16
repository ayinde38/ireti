"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { clientIp } from "@/lib/client-ip";
import { z } from "zod";
import { formatMoney } from "@/lib/format";
import { appUrl, sendEmail } from "@/lib/notify";
import { localAmounts } from "@/lib/rates";
import { rateLimit } from "@/lib/rate-limit";
import { familyTokenHash } from "@/lib/secrets";
import { store } from "@/lib/store";

const Input = z.object({
  campaignerName: z.string().trim().min(2, "Tell us your name.").max(80),
  campaignerEmail: z.email("Enter a valid email address.").max(200),
  patientDisplayName: z.string().trim().min(1, "Enter the name to show.").max(40),
  title: z.string().trim().min(6, "Give the campaign a short title.").max(90),
  story: z.string().trim().min(80, "Please write at least a few sentences (80+ characters).").max(4000),
  hospitalId: z.string().min(1, "Choose the hospital."),
  billReference: z.string().trim().min(3, "Enter the bill or invoice number.").max(60),
  goalAmount: z.coerce.number({ message: "Enter the amount on the bill." }).int().positive("Enter the amount on the bill."),
  days: z.coerce.number().int().refine((d) => [14, 30, 60].includes(d)),
  consent: z.literal("on", { message: "Please confirm the patient has agreed." }),
});

export type StartState =
  | { ok: false; errors?: Record<string, string>; message?: string; values?: Record<string, string> }
  | { ok: true; slug: string; familyUrl: string; hospitalName: string; title: string; email: string };

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").slice(0, 48);

export async function startCampaign(_prev: StartState, form: FormData): Promise<StartState> {
  const values = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const ip = clientIp(await headers());
  if (!rateLimit(`start:${ip}`, 5, 60 * 60_000)) {
    return { ok: false, message: "Too many campaigns from this connection. Please try again later.", values };
  }

  const parsed = Input.safeParse(values);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { ok: false, errors, values };
  }
  const d = parsed.data;
  const hospital = await store.getHospital(d.hospitalId);
  if (!hospital?.verified) return { ok: false, errors: { hospitalId: "Choose a partner hospital." }, values };
  // Goals are in the hospital's currency; the floor is about 20 US dollars.
  const [minGoal] = await localAmounts(hospital.currency, [20]);
  if (d.goalAmount < minGoal) {
    return { ok: false, errors: { goalAmount: `The minimum goal is ${formatMoney(minGoal, hospital.currency)}.` }, values };
  }
  if (d.goalAmount > minGoal * 50_000) {
    return { ok: false, errors: { goalAmount: "That is more than Ireti can raise for one bill. Please check the amount." }, values };
  }

  const token = randomBytes(24).toString("base64url");
  const slug = `${slugify(d.title)}-${randomBytes(3).toString("hex")}`;
  const c = await store.createCampaign({
    slug,
    patientDisplayName: d.patientDisplayName,
    title: d.title,
    story: d.story,
    hospitalId: hospital.id,
    billReference: d.billReference,
    goalAmount: d.goalAmount,
    currency: hospital.currency,
    deadline: new Date(Date.now() + d.days * 86_400_000).toISOString(),
    campaignerName: d.campaignerName,
    campaignerEmail: d.campaignerEmail.toLowerCase(),
    familyTokenHash: familyTokenHash(token),
    consentConfirmed: true,
  });
  await store.addAudit({ role: "family", actorEmail: c.campaignerEmail, action: "campaign_created", campaignId: c.id, details: null });

  const familyUrl = `${appUrl()}/family/${token}`;
  await sendEmail(
    [c.campaignerEmail],
    `Your Ireti campaign for ${c.patientDisplayName} is waiting for ${hospital.name}`,
    `Thank you. ${hospital.name} will check bill ${c.billReference}; we'll email you when it is confirmed and live.\n\n` +
      `Your private family link (keep it safe, it is the only copy):\n${familyUrl}`,
  );

  return { ok: true, slug: c.slug, familyUrl, hospitalName: hospital.name, title: c.title, email: c.campaignerEmail };
}
