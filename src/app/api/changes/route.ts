import { connection, NextResponse } from "next/server";
import { settleOpenDonations } from "@/lib/campaigns";
import { store } from "@/lib/store";

/**
 * Polled by every open page (see LiveSync). Returns a marker that changes
 * whenever anything a page shows changes, so pages refresh only when needed.
 * Also settles open donations, so a payment made from another device shows up.
 */
export async function GET() {
  await connection();
  await settleOpenDonations().catch((e) => console.error("settleOpenDonations", e));
  return NextResponse.json({ marker: await store.changeMarker() }, { headers: { "Cache-Control": "no-store" } });
}
