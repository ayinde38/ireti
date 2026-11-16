import { NextResponse } from "next/server";
import { settleDonation } from "@/lib/campaigns";
import { walletKind } from "@/lib/lightning";
import { markDemoInvoicePaid } from "@/lib/lightning/demo";
import { store } from "@/lib/store";

/** Demo wallet only: pretend the invoice was paid. 404s with a real wallet. */
export async function POST(_req: Request, ctx: RouteContext<"/api/donations/[id]/simulate">) {
  if (walletKind() !== "demo") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await ctx.params;
  const d = await store.getDonation(id);
  if (!d || !markDemoInvoicePaid(d.paymentHash)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const s = await settleDonation(d);
  return NextResponse.json({ status: s.status });
}
