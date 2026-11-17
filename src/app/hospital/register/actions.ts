"use server";

import { headers } from "next/headers";
import { clientIp } from "@/lib/client-ip";
import { redirect } from "next/navigation";
import { z } from "zod";
import { currentHospitalUser, startHospitalSession } from "@/lib/auth";
import { countryByCode } from "@/lib/countries";
import { localAmounts } from "@/lib/rates";
import { rateLimit } from "@/lib/rate-limit";
import { hashSecret } from "@/lib/secrets";
import { store } from "@/lib/store";
import { hospitalReview } from "@/lib/types";

const optional = <T extends z.ZodType>(s: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), s.optional());

const Input = z
  .object({
    name: z.string().trim().min(3, "Enter the hospital's registered name.").max(120),
    country: z.string().refine((c) => Boolean(countryByCode(c)), "Choose the country."),
    state: z.string().trim().min(2, "Enter the state, region or province.").max(80),
    city: z.string().trim().min(2, "Enter the city or town.").max(80),
    address: z.string().trim().min(5, "Enter the street address.").max(200),
    registrationNumber: z.string().trim().min(3, "Enter the facility's licence or registration number.").max(60),
    registrationAuthority: z.string().trim().min(3, "Enter who issued the licence.").max(120),
    website: optional(z.url("Enter a full address, e.g. https://hospital.org").max(200)),
    phone: z.string().trim().regex(/^\+?[\d\s()-]{7,20}$/, "Enter the hospital's main phone number."),
    contactName: z.string().trim().min(2, "Enter your name.").max(80),
    role: z.string().trim().min(2, "Enter your role, e.g. Head of billing.").max(80),
    email: z.email("Enter your work email address.").max(200),
    accessCode: z.string().max(200),
    accessCodeConfirm: z.string(),
    lightningAddress: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/, "A Lightning address looks like billing@yourwallet.com."),
    authorised: z.literal("on", { message: "Please confirm you can act for the hospital." }),
  })
  .refine((d) => d.accessCode === "" || d.accessCode.length >= 10, {
    path: ["accessCode"],
    message: "Use at least 10 characters.",
  })
  .refine((d) => d.accessCode === d.accessCodeConfirm, {
    path: ["accessCodeConfirm"],
    message: "The two access codes don't match.",
  });

export type RegisterState = { errors?: Record<string, string>; message?: string; values?: Record<string, string> };

export async function registerHospital(_: RegisterState, form: FormData): Promise<RegisterState> {
  const values = Object.fromEntries(
    [...form.entries()].filter(([k]) => !k.startsWith("accessCode")).map(([k, v]) => [k, String(v)]),
  );
  const ip = clientIp(await headers());
  if (!rateLimit(`hospital-register:${ip}`, 5, 60 * 60_000)) {
    return { message: "Too many registrations from this connection. Please try again later.", values };
  }
  const parsed = Input.safeParse(Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)])));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { errors, values };
  }
  const d = parsed.data;
  const email = d.email.toLowerCase();
  const country = countryByCode(d.country)!;
  // A floor that means the same in every currency: about five US dollars.
  const [minWithdrawalAmount] = await localAmounts(country.currency, [5]);
  const hospitalFields = {
    name: d.name,
    country: country.code,
    currency: country.currency,
    city: d.city,
    state: d.state,
    address: d.address,
    registrationNumber: d.registrationNumber,
    registrationAuthority: d.registrationAuthority,
    website: d.website ?? null,
    phone: d.phone,
    lightningAddress: d.lightningAddress,
    minWithdrawalAmount,
  };

  // A declined hospital, signed in, correcting its details: update the same
  // registration and put it back in the review queue.
  const me = await currentHospitalUser();
  if (me && hospitalReview(me.hospital) === "rejected") {
    if (email !== me.user.email) {
      const other = await store.getHospitalUserByEmail(email);
      if (other) return { errors: { email: "This email already has an account." }, values };
    }
    try {
      await store.updateHospital(me.hospital.id, {
        ...hospitalFields,
        lightningAddressVerified: false,
        rejectionReason: null,
        reviewedAt: null,
      });
      const user = await store.updateHospitalUser(me.user.id, {
        email,
        name: d.contactName,
        role: d.role,
        ...(d.accessCode ? { accessCodeHash: hashSecret(d.accessCode) } : {}),
      });
      await startHospitalSession(user);
    } catch (e) {
      console.error("hospital resubmission failed", e);
      return { message: "We couldn't save your changes. Please try again.", values };
    }
    redirect("/hospital");
  }
  if (me) redirect("/hospital");

  if (!d.accessCode) return { errors: { accessCode: "Choose an access code of at least 10 characters." }, values };
  const existing = await store.getHospitalUserByEmail(email);
  if (existing) {
    const h = await store.getHospital(existing.hospitalId);
    return {
      errors: {
        email:
          h && hospitalReview(h) === "rejected"
            ? "This email's registration wasn't approved. Sign in with it to correct the details and resubmit."
            : "This email already has an account. Sign in instead.",
      },
      values,
    };
  }

  try {
    await store.registerHospital(hospitalFields, {
      email,
      name: d.contactName,
      role: d.role,
      accessCodeHash: hashSecret(d.accessCode),
    });
  } catch (e) {
    console.error("hospital registration failed", e);
    return { message: "We couldn't save the registration. Please try again.", values };
  }
  // No session here: registering proves nothing about who is at the keyboard.
  // The hospital signs in with its email and access code to follow the review.
  redirect("/hospital/register/submitted");
}
