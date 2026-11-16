import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  // Hourly proof-of-reserves snapshot. Vercel sends `Authorization: Bearer $CRON_SECRET`.
  crons: [{ path: "/api/cron/reserves", schedule: "0 * * * *" }],
};
