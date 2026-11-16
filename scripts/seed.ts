/**
 * Loads the demo hospitals, campaigns and ledger into an empty Postgres
 * (DATABASE_URL). The local database seeds itself; this is for a hosted demo.
 * npm run db:seed
 */
import { sql } from "@/lib/db";
import { seedInto } from "@/lib/store/seed";

async function main() {
  const db = await sql();
  const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from hospitals");
  if (n > 0) throw new Error("Database already has hospitals; seed only an empty database.");
  await seedInto(db, { withLedger: !process.env.NWC_URL });
  console.log("Seeded. Hospital login: billing@harbourview.test / ireti-demo. Set DEMO_DATA=true to show demo hints.");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e.message);
    process.exit(1);
  },
);
