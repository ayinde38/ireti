import { connection, NextResponse } from "next/server";
import { getNgnRate } from "@/lib/rates";

export async function GET() {
  await connection();
  return NextResponse.json(await getNgnRate(), {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
  });
}
