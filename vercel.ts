import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  // Proof-of-reserves snapshot. Vercel sends `Authorization: Bearer $CRON_SECRET`.
  // Hobby plans allow one run a day, so this is the fallback; an external
  // scheduler (see README) calls the same route hourly.
  crons: [{ path: "/api/cron/reserves", schedule: "0 6 * * *" }],
};
