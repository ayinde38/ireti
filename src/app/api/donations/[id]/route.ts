import { NextResponse } from "next/server";
import { settleDonation } from "@/lib/campaigns";
import { store } from "@/lib/store";

/** Polled by the donate panel. Always re-checks with the wallet. */
export async function GET(_req: Request, ctx: RouteContext<"/api/donations/[id]">) {
  const { id } = await ctx.params;
  const d = await store.getDonation(id);
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const s = await settleDonation(d);
    return NextResponse.json({ status: s.status, paymentHash: s.paymentHash, paidAt: s.paidAt });
  } catch (err) {
    console.error("settleDonation failed", err);
    return NextResponse.json({ status: d.status }, { status: 200 });
  }
}
