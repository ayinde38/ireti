import { NextResponse } from "next/server";
import { campaignView, isPublic } from "@/lib/campaigns";
import { satsToFiat } from "@/lib/format";
import { store } from "@/lib/store";

/**
 * Public export of every ledger entry for a campaign.
 * JSON by default, CSV with ?format=csv. Donor emails are never included.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/campaigns/[slug]/ledger">) {
  const { slug } = await ctx.params;
  const c = await store.getCampaignBySlug(slug);
  if (!c || !(isPublic(c) || c.status === "frozen")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const v = await campaignView(c);

  const rows = [
    ...v.donations.map((d) => ({
      type: "deposit",
      currency: c.currency,
      time: d.paidAt ?? d.createdAt,
      amount_sats: d.amountSats,
      amount_fiat: Math.round(satsToFiat(d.amountSats, d.fiatPerBtcAtPayment ?? v.rate.fiatPerBtc)),
      fiat_per_btc: d.fiatPerBtcAtPayment,
      payment_hash: d.paymentHash,
      preimage: d.preimage,
      counterparty: d.donorName ?? "Anonymous",
      destination: "",
      status: d.status,
      receipt_url: "",
      receipt_uploaded_at: "",
      family_confirmed_at: "",
    })),
    ...v.withdrawals.map((w) => ({
      type: "withdrawal",
      currency: c.currency,
      time: w.sentAt ?? w.createdAt,
      amount_sats: w.amountSats,
      amount_fiat: Math.round(satsToFiat(w.amountSats, w.fiatPerBtcAtWithdrawal)),
      fiat_per_btc: w.fiatPerBtcAtWithdrawal,
      payment_hash: w.paymentHash ?? w.payoutRef ?? "",
      preimage: w.preimage,
      counterparty: v.hospital.name,
      destination: w.destination,
      status: w.status,
      receipt_url: w.receiptUrl ?? "",
      receipt_uploaded_at: w.receiptUploadedAt ?? "",
      family_confirmed_at: w.familyConfirmedAt ?? "",
    })),
  ].sort((a, b) => a.time.localeCompare(b.time));

  const format = new URL(req.url).searchParams.get("format");
  if (format === "csv") {
    const cols = Object.keys(rows[0] ?? { type: "" });
    const esc = (x: unknown) => {
      const s = x == null ? "" : String(x);
      // Quote everything; neutralise spreadsheet formula injection.
      return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    };
    const csv = [cols.join(","), ...rows.map((r) => cols.map((k) => esc(r[k as keyof typeof r])).join(","))].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ireti-${c.slug}-ledger.csv"`,
      },
    });
  }

  return NextResponse.json({
    campaign: { slug: c.slug, title: c.title, bill_reference: c.billReference, goal: c.goalAmount, currency: c.currency, status: c.status },
    hospital: { name: v.hospital.name, lightning_address: v.hospital.lightningAddress },
    totals: v.totals,
    entries: rows,
    generated_at: new Date().toISOString(),
  });
}
