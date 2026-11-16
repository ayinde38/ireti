import { connection } from "next/server";
import { Suspense } from "react";
import { CampaignCard } from "@/components/campaign-card";
import { listPublicCampaigns } from "@/lib/campaigns";

export const metadata = { title: "Campaigns" };

export default function CampaignsPage() {
  return (
    <div className="container-page py-12">
      <p className="eyebrow">Campaigns</p>
      <h1 className="mt-3 text-[2.8rem] tracking-[-0.045em]">Hospital-verified appeals</h1>
      <p className="mt-3 max-w-2xl text-ink-2">
        Every campaign below is tied to a bill its hospital has confirmed. Donations wait in escrow
        and only that hospital can withdraw them.
      </p>
      <Suspense fallback={<div className="mt-10 h-96" />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  await connection();
  const all = await listPublicCampaigns();
  const open = all.filter((v) => v.campaign.status === "live" || v.campaign.status === "funded");
  const done = all.filter((v) => !open.includes(v));
  if (all.length === 0) {
    return (
      <p className="mt-10 rounded-[20px] border border-line bg-white p-8 text-ink-2">
        No campaigns are live yet. The first one appears here as soon as a hospital confirms its bill.
      </p>
    );
  }
  return (
    <>
      <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {open.map((v) => (
          <CampaignCard key={v.campaign.id} v={v} />
        ))}
      </div>
      {done.length > 0 && (
        <>
          <h2 className="mt-16 text-[1.6rem]">Completed, with receipts</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {done.map((v) => (
              <CampaignCard key={v.campaign.id} v={v} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
