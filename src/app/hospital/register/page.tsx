import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { currentHospitalUser } from "@/lib/auth";
import { hospitalReview } from "@/lib/types";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Register your hospital" };

const checks = [
  ["Licence", "We look up your registration number with the body that issued it."],
  ["Contact", "We call the main number you give and confirm you work in the billing office."],
  ["Payout address", "We check your Lightning address works before any money can go to it."],
];

export default function RegisterHospitalPage() {
  return (
    <div className="container-page grid gap-12 py-12 lg:grid-cols-[1fr_340px]">
      <div className="max-w-2xl">
        <Suspense fallback={<Intro resubmit={false} />}>
          <RegisterOrResubmit />
        </Suspense>
      </div>
      <aside className="space-y-4 lg:pt-24">
        <div className="rounded-[24px] bg-white p-6">
          <h2 className="font-sans text-[1rem] font-semibold tracking-normal">What Ireti checks</h2>
          <ol className="mt-4 space-y-4">
            {checks.map(([t, b], i) => (
              <li key={t} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sand font-mono text-[0.8rem] text-indigo">
                  {i + 1}
                </span>
                <span className="text-[0.95rem]">
                  <strong className="block font-semibold">{t}</strong>
                  <span className="text-ink-2">{b}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <p className="px-1 text-[0.95rem] text-ink-2">
          Already registered?{" "}
          <Link href="/hospital" className="font-semibold underline decoration-sun decoration-2 underline-offset-4">
            Sign in
          </Link>
        </p>
      </aside>
    </div>
  );
}

function Intro({ resubmit, reason }: { resubmit: boolean; reason?: string | null }) {
  return (
    <>
      <p className="eyebrow">For hospitals</p>
      <h1 className="mt-3 text-[2.6rem] tracking-[-0.045em]">
        {resubmit ? "Correct and resubmit" : "Register your hospital"}
      </h1>
      {resubmit ? (
        <div className="mt-4 space-y-3 text-ink-2">
          <p className="rounded-[16px] border border-line-2 bg-white px-4 py-3 text-[0.95rem]">
            <strong className="block font-semibold text-ink">Why it wasn&apos;t approved</strong>
            {reason}
          </p>
          <p>
            Fix the details below and send them again. Your registration goes back into the review
            queue. Leave the access code blank to keep your current one.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-ink-2">
          Takes about five minutes. Ireti then reviews your hospital, and you can sign in any time to
          follow the review. Families can choose your hospital once it&apos;s verified.
        </p>
      )}
    </>
  );
}

/** New registration, or, for a signed-in declined hospital, its details to correct. */
async function RegisterOrResubmit() {
  await connection();
  const me = await currentHospitalUser();
  if (me && hospitalReview(me.hospital) !== "rejected") redirect("/hospital");
  if (!me) {
    return (
      <>
        <Intro resubmit={false} />
        <RegisterForm key="new" />
      </>
    );
  }
  const { hospital: h, user: u } = me;
  const initial: Record<string, string> = {
    name: h.name,
    country: h.country,
    state: h.state ?? "",
    city: h.city ?? "",
    address: h.address ?? "",
    registrationNumber: h.registrationNumber ?? "",
    registrationAuthority: h.registrationAuthority ?? "",
    phone: h.phone ?? "",
    website: h.website ?? "",
    contactName: u.name,
    role: u.role ?? "",
    email: u.email,
    lightningAddress: h.lightningAddress ?? "",
    authorised: "on",
  };
  return (
    <>
      <Intro resubmit reason={h.rejectionReason} />
      <RegisterForm key={`resubmit-${h.id}-${h.reviewedAt}`} initial={initial} resubmit />
    </>
  );
}
