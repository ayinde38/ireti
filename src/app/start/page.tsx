import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { countryName, flag } from "@/lib/countries";
import { emailEnabled } from "@/lib/notify";
import { localAmounts } from "@/lib/rates";
import { store } from "@/lib/store";
import { StartForm } from "./start-form";

export const metadata = { title: "Start a campaign" };

export default function StartPage() {
  return (
    <div className="container-page grid gap-12 py-12 lg:grid-cols-[1fr_340px]">
      <div className="max-w-2xl">
        <p className="eyebrow">Start a campaign</p>
        <h1 className="mt-3 text-[2.8rem] tracking-[-0.045em]">Raise money for a hospital bill</h1>
        <p className="mt-4 text-ink-2">
          Takes about five minutes. The hospital checks the bill before anyone can give, and every
          donation goes to the hospital, never to you. That is what makes donors trust it.
        </p>
        <Suspense fallback={<div className="mt-10 h-[600px]" />}>
          <Form />
        </Suspense>
      </div>
      <aside className="space-y-4 lg:pt-24">
        <div className="rounded-[24px] bg-white p-5">
          <h2 className="font-sans text-[1rem] font-semibold tracking-normal">Before you start</h2>
          <ul className="mt-3 space-y-2 text-[0.95rem] text-ink-2">
            <li>Have the bill or invoice number from the hospital.</li>
            <li>Ask the patient (or their guardian) if they agree to the story.</li>
            <li>Use a first name only. You don&apos;t need to share a diagnosis.</li>
          </ul>
        </div>
        <div className="rounded-[24px] bg-white p-5 text-[0.95rem] text-ink-2">
          <p>
            <strong className="text-ink">Your hospital not listed?</strong> Ask its billing office to{" "}
            <Link href="/hospital/register" className="font-medium text-ink underline decoration-sun decoration-2 underline-offset-4">
              register on Ireti
            </Link>
            . It takes them five minutes; we verify them before they appear here.
          </p>
        </div>
      </aside>
    </div>
  );
}

async function Form() {
  await connection();
  const hospitals = await store.listHospitals({ verifiedOnly: true });
  const currencies = [...new Set(hospitals.map((h) => h.currency))];
  // Minimum goal: about 20 US dollars in each hospital's currency.
  const mins = new Map(await Promise.all(currencies.map(async (c) => [c, (await localAmounts(c, [20]))[0]] as const)));
  return (
    <StartForm
      emailEnabled={emailEnabled()}
      hospitals={hospitals.map((h) => ({
        id: h.id,
        name: h.name,
        place: `${h.city}, ${countryName(h.country)}`,
        flag: flag(h.country),
        currency: h.currency,
        minGoal: mins.get(h.currency) ?? 1,
      }))}
    />
  );
}
