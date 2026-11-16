import { NextResponse } from "next/server";
import { store } from "@/lib/store";

/** GET /api/donations/lookup?hash=<payment hash> — donor finds their donation. */
export async function GET(req: Request) {
  const hash = new URL(req.url).searchParams.get("hash")?.toLowerCase() ?? "";
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    return NextResponse.json({ error: "Give a 64-character payment hash." }, { status: 400 });
  }
  const d = await store.getDonationByHash(hash);
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const c = await store.getCampaign(d.campaignId);
  return NextResponse.json({
    paymentHash: d.paymentHash,
    preimage: d.status === "paid" ? d.preimage : null,
    amountSats: d.amountSats,
    status: d.status,
    paidAt: d.paidAt,
    campaign: c ? { slug: c.slug, title: c.title } : null,
    receiptUrl: `/d/${d.paymentHash}`,
  });
}
