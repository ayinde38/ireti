/**
 * Adds a real hospital and its first billing user.
 * npm run hospital:add -- "Name" "City" "State" "pay@hospital.ng" "user@hospital.ng" "User Name" "access-code"
 * The hospital starts unverified; verify it on /admin, which also checks the Lightning address.
 */
import { sql } from "@/lib/db";
import { hashSecret } from "@/lib/secrets";
import { insertSql } from "@/lib/store/sql";

async function main() {
  const [name, city, state, lightningAddress, email, userName, code] = process.argv.slice(2);
  if (!code) {
    throw new Error('Usage: npm run hospital:add -- "Name" "City" "State" "lightning@address" "user@email" "User Name" "access-code"');
  }
  if (code.length < 10) throw new Error("Use an access code of at least 10 characters.");

  const db = await sql();
  const h = insertSql("hospitals", { name, city, state, lightningAddress });
  const [{ id }] = await db.query<{ id: string }>(h.text, h.params);
  const u = insertSql("hospital_users", {
    hospitalId: id,
    email: email.toLowerCase(),
    name: userName,
    accessCodeHash: hashSecret(code),
  });
  await db.query(u.text, u.params);
  console.log(`Added ${name} (${id}). Now verify it on /admin.`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e.message);
    process.exit(1);
  },
);
