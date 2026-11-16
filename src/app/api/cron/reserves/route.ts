import { NextResponse } from "next/server";
import { connection } from "next/server";
import { takeReserveSnapshot } from "@/lib/campaigns";
import { safeEqual } from "@/lib/secrets";

/** Hourly proof-of-reserves snapshot. Scheduled in vercel.ts; protected by CRON_SECRET. */
export async function GET(req: Request) {
  await connection();
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const snap = await takeReserveSnapshot();
  return NextResponse.json(snap);
}
