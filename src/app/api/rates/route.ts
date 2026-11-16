import { connection, NextResponse } from "next/server";
import { getRate } from "@/lib/rates";

/** /api/rates?currency=KES: units of that currency per bitcoin. */
export async function GET(req: Request) {
  await connection();
  const currency = (new URL(req.url).searchParams.get("currency") ?? "USD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return NextResponse.json({ error: "Bad currency" }, { status: 400 });
  return NextResponse.json(await getRate(currency), {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
  });
}
