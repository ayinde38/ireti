import { NextResponse } from "next/server";
import { connection } from "next/server";
import { transparencyData } from "@/lib/transparency";

export async function GET() {
  await connection();
  const t = await transparencyData();
  return NextResponse.json({
    custody: "custodial (platform-held escrow); 2-of-3 multisig planned",
    ledger_total_sats: t.ledgerTotalSats,
    latest_snapshot: t.latest,
    snapshots: t.snapshots,
  });
}
