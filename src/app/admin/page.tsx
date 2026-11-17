import { BadgeCheckIcon, LockIcon, ShieldCheckIcon, SnowflakeIcon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { StatusPill } from "@/components/status";
import { isAdmin } from "@/lib/auth";
import { network } from "@/lib/lightning";
import { countryName, flag } from "@/lib/countries";
import { formatDate, formatInt, formatMoney } from "@/lib/format";
import { store } from "@/lib/store";
import { hospitalReview, type Hospital } from "@/lib/types";
import { adminSignOut, markWithdrawalFailed, setFrozen, verifyHospital } from "./actions";
import { AdminSignIn, DeclineHospital } from "./sign-in";

export const metadata = { title: "Admin", robots: { index: false } };

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="container-page min-h-[60vh]" />}>
      <Admin />
    </Suspense>
  );
}

const small = "btn btn-ghost !min-h-9 !py-1.5 text-[0.88rem]";

async function Admin() {
  await connection();
  if (!(await isAdmin())) {
    // Shown only on the test network, and only when the deploy opts in.
    const reviewerPassword =
      network() === "mutinynet" && process.env.PUBLIC_DEMO_ADMIN === "true" ? process.env.ADMIN_PASSWORD : undefined;
    return <SignInScreen demo={process.env.NODE_ENV !== "production" && !process.env.ADMIN_PASSWORD} reviewerPassword={reviewerPassword} />;
  }
  const [hospitals, campaigns] = await Promise.all([store.listHospitals(), store.listCampaigns()]);
  const unconfirmed = (await Promise.all(campaigns.map((c) => store.listWithdrawals(c.id))))
    .flat()
    .filter((w) => w.status === "pending");
  const pending = hospitals.filter((h) => hospitalReview(h) === "pending");
  const contacts = await hospitalContacts(pending.map((h) => h.id));

  return (
    <div className="container-page py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[2rem]">Admin</h1>
        <form action={adminSignOut}><button className="btn btn-ghost">Sign out</button></form>
      </div>

      {unconfirmed.length > 0 && (
        <section className="mt-10 rounded-[20px] bg-gold-soft p-6">
          <h2 className="text-[1.4rem]">Payouts to check</h2>
          <p className="mt-1 text-[0.95rem] text-ink-2">
            These payments could not be confirmed. Look each one up in the escrow wallet&apos;s history. Mark it failed
            only if the wallet shows it did not pay; that frees the amount for the hospital to withdraw again.
          </p>
          <ul className="mt-4 space-y-3">
            {unconfirmed.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-white p-4 text-[0.92rem]">
                <span>
                  <strong>{formatInt(w.amountSats)} sats</strong> to {w.destination} · {formatDate(w.createdAt)}
                  <span className="hash block text-ink-3">{w.id}</span>
                </span>
                <form action={markWithdrawalFailed}>
                  <input type="hidden" name="withdrawalId" value={w.id} />
                  <button className={small}>Wallet shows no payment: mark failed</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-[1.4rem]">Hospital registrations to review</h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-ink-3">None waiting.</p>
        ) : (
          <>
            <p className="mt-1 max-w-3xl text-[0.95rem] text-ink-2">
              Before approving: look the licence number up with the issuing body, call the main phone number (not one the
              applicant gives you separately) and ask for the billing office, and check the email domain matches the hospital.
              Approving also tests the Lightning address.
            </p>
            <ul className="mt-5 grid gap-5 xl:grid-cols-2">
              {pending.map((h) => (
                <li key={h.id} className="rounded-[24px] bg-white p-6">
                  <p className="text-[0.85rem] text-ink-3">Registered {formatDate(h.createdAt)}</p>
                  <h3 className="mt-1 font-sans text-[1.2rem] font-semibold tracking-[-0.01em]">{h.name}</h3>
                  <dl className="mt-4 divide-y divide-line text-[0.92rem]">
                    {registrationRows(h, contacts.get(h.id)).map(([k, val]) => (
                      <div key={k} className="grid grid-cols-[9rem_1fr] gap-3 py-2">
                        <dt className="text-ink-3">{k}</dt>
                        <dd className="break-words">{val || "—"}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <form action={verifyHospital}>
                      <input type="hidden" name="hospitalId" value={h.id} />
                      <button className="btn btn-secondary">Approve hospital</button>
                    </form>
                    <DeclineHospital hospitalId={h.id} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <h2 className="mt-12 text-[1.4rem]">All hospitals</h2>
      <div className="mt-4 overflow-x-auto rounded-[24px] bg-white">
        <table className="w-full min-w-[720px] text-left text-[0.92rem]">
          <thead className="border-b border-line text-ink-3">
            <tr><th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">Lightning address</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {hospitals.map((h) => {
              const review = hospitalReview(h);
              return (
                <tr key={h.id}>
                  <td className="px-4 py-3">{h.name}<span className="block text-ink-3">{flag(h.country)} {h.city}, {countryName(h.country)} · {h.currency}</span></td>
                  <td className="px-4 py-3">
                    {h.lightningAddress}
                    <span className={`block text-[0.82rem] ${h.lightningAddressVerified ? "text-green" : "text-clay"}`}>
                      {h.lightningAddressVerified ? "resolves" : "not confirmed"}
                    </span>
                  </td>
                  <td className="px-4 py-3">{review === "verified" ? "Verified" : review === "rejected" ? "Declined" : "Pending review"}</td>
                  <td className="px-4 py-3 text-right">
                    {review === "verified" && (
                      <form action={verifyHospital}>
                        <input type="hidden" name="hospitalId" value={h.id} />
                        <button className={small}>Re-check address</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="mt-12 text-[1.4rem]">Campaigns</h2>
      <div className="mt-4 overflow-x-auto rounded-[24px] bg-white">
        <table className="w-full min-w-[640px] text-left text-[0.92rem]">
          <thead className="border-b border-line text-ink-3">
            <tr><th className="px-4 py-3 font-medium">Campaign</th><th className="px-4 py-3 font-medium">Goal</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3"><Link className="underline-offset-4 hover:underline" href={`/c/${c.slug}`}>{c.title}</Link></td>
                <td className="px-4 py-3">{formatMoney(c.goalAmount, c.currency)}</td>
                <td className="px-4 py-3"><StatusPill status={c.status} /></td>
                <td className="px-4 py-3 text-right">
                  {c.status !== "pending_verification" && c.status !== "rejected" && (
                    <form action={setFrozen}>
                      <input type="hidden" name="campaignId" value={c.id} />
                      <input type="hidden" name="freeze" value={c.status === "frozen" ? "0" : "1"} />
                      <button className={small}>{c.status === "frozen" ? "Unfreeze" : "Freeze"}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function registrationRows(h: Hospital, contact?: { name: string; role: string | null; email: string }): [string, React.ReactNode][] {
  return [
    ["Country", `${flag(h.country)} ${countryName(h.country)} (${h.currency})`],
    ["Address", [h.address, h.city, h.state].filter(Boolean).join(", ")],
    ["Licence number", h.registrationNumber],
    ["Issued by", h.registrationAuthority],
    ["Main phone", h.phone],
    ["Website", h.website ? <a className="underline underline-offset-2" href={h.website} target="_blank" rel="noopener noreferrer">{h.website}</a> : null],
    ["Billing contact", contact ? `${contact.name}${contact.role ? `, ${contact.role}` : ""} · ${contact.email}` : null],
    ["Payout address", h.lightningAddress],
  ];
}

async function hospitalContacts(ids: string[]) {
  const users = ids.length ? await store.listHospitalUsers(ids) : [];
  return new Map(users.map((u) => [u.hospitalId, u]));
}

const duties = [
  [BadgeCheckIcon, "Verify hospitals", "Check each licence and call the billing office before a hospital can receive money."],
  [SnowflakeIcon, "Freeze a campaign", "Stop donations and withdrawals at once if anything looks wrong."],
  [ShieldCheckIcon, "Check payouts", "Look into any withdrawal the wallet couldn't confirm."],
] as const;

function SignInScreen({ demo, reviewerPassword }: { demo: boolean; reviewerPassword?: string }) {
  return (
    <div className="container-page grid items-center gap-10 py-12 md:grid-cols-2">
      <div className="max-w-md">
        <p className="eyebrow">Ireti team</p>
        <h1 className="mt-3 text-[2.6rem] tracking-[-0.045em]">Admin sign-in</h1>
        <p className="mt-3 text-ink-2">
          Review hospital registrations, keep campaigns safe and check payouts. Every action is written to the audit log.
        </p>
        <div className="mt-8">
          <AdminSignIn demo={demo} reviewerPassword={reviewerPassword} />
        </div>
      </div>
      <div className="hidden rounded-[24px] bg-indigo p-9 text-indigo-ink md:block">
        <span className="flex size-12 items-center justify-center rounded-[14px] bg-white/10 text-sun">
          <LockIcon className="size-6" aria-hidden="true" />
        </span>
        <h2 className="mt-6 text-[1.6rem] tracking-[-0.03em]">What admins look after</h2>
        <ul className="mt-6 space-y-5">
          {duties.map(([Icon, t, b]) => (
            <li key={t} className="flex gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-sun text-ink">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span>
                <strong className="block font-semibold">{t}</strong>
                <span className="text-[0.95rem] text-indigo-muted">{b}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-8 border-t border-white/10 pt-5 text-[0.88rem] text-indigo-muted">
          Sign-in attempts are rate limited per connection and overall.
        </p>
      </div>
    </div>
  );
}
