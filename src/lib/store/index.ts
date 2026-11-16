import "server-only";
import { sqlStore } from "./sql";
import type { Store } from "./types";

/** Sample hospitals and campaigns are loaded (only the e2e suite sets this). */
export const sampleData = !process.env.DATABASE_URL && process.env.SAMPLE_DATA === "true";

export const store: Store = sqlStore;
