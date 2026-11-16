import "server-only";
import { sqlStore } from "./sql";
import type { Store } from "./types";

/** Sample hospitals and campaigns are loaded (local database, or DEMO_DATA=true). */
export const sampleData = !process.env.DATABASE_URL || process.env.DEMO_DATA === "true";

export const store: Store = sqlStore;
