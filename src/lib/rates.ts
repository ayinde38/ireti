import "server-only";
import { getFiatBtcRate } from "@getalby/lightning-tools/fiat";

/**
 * Naira per bitcoin, from Alby's rate API via @getalby/lightning-tools.
 * Cached for 60 s in-process. If the API is unreachable we fall back to the
 * last good value, then to a conservative constant, and say so in the UI.
 */
const FALLBACK_NGN_PER_BTC = 86_000_000; // ≈ Nov 2026; only used if the rate API is down
const TTL = 60_000;

const g = globalThis as unknown as { __iretiRate?: { value: number; at: number } };

export interface Rate {
  ngnPerBtc: number;
  live: boolean;
  fetchedAt: string;
}

export async function getNgnRate(): Promise<Rate> {
  const hit = g.__iretiRate;
  if (hit && Date.now() - hit.at < TTL) {
    return { ngnPerBtc: hit.value, live: true, fetchedAt: new Date(hit.at).toISOString() };
  }
  try {
    // Despite its name, getFiatBtcRate returns fiat per *satoshi*
    // (rate_float / 1e8 in lightning-tools), so scale back up to per-BTC.
    const perSat = await Promise.race([
      getFiatBtcRate("ngn"),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000)),
    ]);
    const value = perSat * 1e8;
    if (!Number.isFinite(value) || value <= 0) throw new Error("bad rate");
    g.__iretiRate = { value, at: Date.now() };
    return { ngnPerBtc: value, live: true, fetchedAt: new Date().toISOString() };
  } catch {
    if (hit) return { ngnPerBtc: hit.value, live: false, fetchedAt: new Date(hit.at).toISOString() };
    return { ngnPerBtc: FALLBACK_NGN_PER_BTC, live: false, fetchedAt: new Date().toISOString() };
  }
}
