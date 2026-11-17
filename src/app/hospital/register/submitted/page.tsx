import { CheckIcon } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Registration received", robots: { index: false } };

const next = [
  ["We check your licence", "We look up your registration number with the body that issued it."],
  ["We call your main number", "To confirm you work in the hospital's billing office. Usually within two working days."],
  ["We test your Lightning address", "So withdrawals can only ever reach your hospital's own wallet."],
  ["Families can choose your hospital", "Bills they submit appear on your dashboard for you to confirm."],
];

export default function RegistrationSubmitted() {
  return (
    <div className="container-page py-14 sm:py-20">
      <div className="mx-auto max-w-2xl">
        <div className="flex size-14 items-center justify-center rounded-full bg-green-soft text-green">
          <CheckIcon className="size-7" aria-hidden="true" />
        </div>
        <p className="eyebrow mt-6">Registration received</p>
        <h1 className="mt-3 text-[2.4rem] tracking-[-0.045em] sm:text-[2.8rem]">
          Thank you. Your hospital is now being reviewed.
        </h1>
        <p className="mt-4 text-[1.05rem] text-ink-2">
          The Ireti team checks every hospital before families can choose it or any money can move. You&apos;ll
          hear from us at the work email you gave.
        </p>

        <ol className="mt-10 space-y-4 rounded-[24px] bg-white p-6 sm:p-8">
          {next.map(([t, b], i) => (
            <li key={t} className="flex gap-4">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sand font-mono text-[0.85rem] text-indigo">
                {i + 1}
              </span>
              <span>
                <strong className="block font-semibold">{t}</strong>
                <span className="text-[0.95rem] text-ink-2">{b}</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-8 rounded-[24px] border border-line bg-paper p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <p className="font-semibold">Want to follow the review?</p>
            <p className="mt-1 text-[0.95rem] text-ink-2">
              Sign in any time with your work email and the access code you just chose.
            </p>
          </div>
          <Link href="/hospital" className="btn btn-secondary mt-4 shrink-0 sm:mt-0">
            Sign in to track progress
          </Link>
        </div>

        <p className="mt-6 text-[0.92rem] text-ink-3">
          <Link href="/" className="underline decoration-sun decoration-2 underline-offset-4">
            Back to the home page
          </Link>
        </p>
      </div>
    </div>
  );
}
