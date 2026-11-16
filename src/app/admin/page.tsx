import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { StatusPill } from "@/components/ui";
import { isAdmin } from "@/lib/auth";
import { formatDate, formatInt, formatNgn } from "@/lib/format";
import { store } from "@/lib/store";
import { adminSignOut, markWithdrawalFailed, setFrozen, verifyHospital } from "./actions";
import { AdminSignIn } from "./sign-in";

export const metadata = { title: "Admin", robots: { index: false } };

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="container-page min-h-[60vh]" />}>
      <Admin />
    </Suspense>
  );
}

async function Admin() {
  await connection();
  if (!(await isAdmin())) {
    return (
      <div className="container-page max-w-md py-16">
        <h1 className="text-[2rem]">Ireti admin</h1>
        <AdminSignIn demo={process.env.NODE_ENV !== "production" && !process.env.ADMIN_PASSWORD} />
      </div>
    );
  }
  const [hospitals, campaigns] = await Promise.all([store.listHospitals(), store.listCampaigns()]);
  const unconfirmed = (await Promise.all(campaigns.map((c) => store.listWithdrawals(c.id))))
    .flat()
    .filter((w) => w.status === "pending");

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
                  <button className="btn btn-ghost !min-h-9 !py-1.5 text-[0.88rem]">Wallet shows no payment: mark failed</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mt-10 text-[1.4rem]">Hospitals</h2>
      <div className="mt-4 overflow-x-auto rounded-[24px] bg-white">
        <table className="w-full min-w-[640px] text-left text-[0.92rem]">
          <thead className="border-b border-line text-ink-3">
            <tr><th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">Lightning address</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {hospitals.map((h) => (
              <tr key={h.id}>
                <td className="px-4 py-3">{h.name}<span className="block text-ink-3">{h.city}</span></td>
                <td className="px-4 py-3">
                  {h.lightningAddress}
                  <span className={`block text-[0.82rem] ${h.lightningAddressVerified ? "text-green" : "text-clay"}`}>
                    {h.lightningAddressVerified ? "resolves" : "not checked"}
                  </span>
                </td>
                <td className="px-4 py-3">{h.verified ? "Verified" : "Pending"}</td>
                <td className="px-4 py-3 text-right">
                  <form action={verifyHospital}>
                    <input type="hidden" name="hospitalId" value={h.id} />
                    <button className="btn btn-ghost !min-h-9 !py-1.5 text-[0.88rem]">
                      {h.verified ? "Re-check address" : "Verify"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-[1.4rem]">Campaigns</h2>
      <div className="mt-4 overflow-x-auto rounded-[24px] bg-white">
        <table className="w-full min-w-[640px] text-left text-[0.92rem]">
          <thead className="border-b border-line text-ink-3">
            <tr><th className="px-4 py-3 font-medium">Campaign</th><th className="px-4 py-3 font-medium">Goal</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3"><Link className="underline-offset-4 hover:underline" href={`/c/${c.slug}`}>{c.title}</Link></td>
                <td className="px-4 py-3">{formatNgn(c.goalNgn)}</td>
                <td className="px-4 py-3"><StatusPill status={c.status} /></td>
                <td className="px-4 py-3 text-right">
                  {c.status !== "pending_verification" && c.status !== "rejected" && (
                    <form action={setFrozen}>
                      <input type="hidden" name="campaignId" value={c.id} />
                      <input type="hidden" name="freeze" value={c.status === "frozen" ? "0" : "1"} />
                      <button className="btn btn-ghost !min-h-9 !py-1.5 text-[0.88rem]">
                        {c.status === "frozen" ? "Unfreeze" : "Freeze"}
                      </button>
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
