import "server-only";
import { getFiatBtcRate } from "@getalby/lightning-tools/fiat";

/**
 * Local currency per bitcoin, for any campaign currency.
 * Source: yadio.io (one call returns every currency), then Alby's rate API
 * via @getalby/lightning-tools for anything yadio lacks. Cached 60 s.
 * If both are unreachable we fall back to the last good value, then to the
 * snapshot below, and the UI says the rate is approximate.
 */
const FALLBACK_PER_BTC: Record<string, number> = {
  // Snapshot of 16 Nov 2026. Only used when every rate source is down.
  DZD: 16637876, AOA: 74421332, XOF: 38754853, BWP: 930418, BIF: 397016247, CVE: 6514610,
  XAF: 38754853, KMF: 29066139, CDF: 156682931, DJF: 11387562, EGP: 3534300, ERN: 961133,
  SZL: 1112480, ETB: 12198854, GMD: 4933493, GHS: 779588, GNF: 644946944, KES: 8470996,
  LSL: 1112480, LRD: 11348490, LYD: 698263, MGA: 285646659, MWK: 218622802, MRU: 2823865,
  MUR: 3065395, MAD: 683321, MZN: 4820591, NAD: 1112480, NGN: 91187776, RWF: 95825806,
  SCR: 882821, SLE: 1639971, ZAR: 1112480, SDG: 772942205, TZS: 170538705, TND: 216343,
  UGX: 266199830, ZMW: 1354568, USD: 64076,
};
const TTL = 60_000;

const g = globalThis as unknown as {
  __iretiFxTable?: { table: Record<string, number>; at: number };
  __iretiFx?: Map<string, { value: number; at: number }>;
};
const lastGood = (g.__iretiFx ??= new Map());

export interface Rate {
  currency: string;
  /** Units of `currency` per bitcoin. */
  fiatPerBtc: number;
  live: boolean;
  fetchedAt: string;
}

const timeout = <T,>(p: Promise<T>, ms = 3000) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

async function yadioTable(): Promise<Record<string, number>> {
  const hit = g.__iretiFxTable;
  if (hit && Date.now() - hit.at < TTL) return hit.table;
  const res = await timeout(fetch("https://api.yadio.io/exrates/BTC", { cache: "no-store" }));
  if (!res.ok) throw new Error(`yadio ${res.status}`);
  const table = ((await res.json()) as { BTC: Record<string, number> }).BTC;
  g.__iretiFxTable = { table, at: Date.now() };
  return table;
}

async function fetchRate(currency: string): Promise<number> {
  const fromYadio = await yadioTable().then((t) => t[currency], () => undefined);
  if (fromYadio && Number.isFinite(fromYadio) && fromYadio > 0) return fromYadio;
  // getFiatBtcRate returns fiat per *satoshi* despite its name.
  const perSat = await timeout(getFiatBtcRate(currency.toLowerCase()));
  const value = perSat * 1e8;
  if (!Number.isFinite(value) || value <= 0) throw new Error("bad rate");
  return value;
}

export async function getRate(currency: string): Promise<Rate> {
  const code = currency.toUpperCase();
  const hit = lastGood.get(code);
  if (hit && Date.now() - hit.at < TTL) {
    return { currency: code, fiatPerBtc: hit.value, live: true, fetchedAt: new Date(hit.at).toISOString() };
  }
  try {
    const value = await fetchRate(code);
    lastGood.set(code, { value, at: Date.now() });
    return { currency: code, fiatPerBtc: value, live: true, fetchedAt: new Date().toISOString() };
  } catch {
    if (hit) return { currency: code, fiatPerBtc: hit.value, live: false, fetchedAt: new Date(hit.at).toISOString() };
    return { currency: code, fiatPerBtc: FALLBACK_PER_BTC[code] ?? FALLBACK_PER_BTC.USD, live: false, fetchedAt: new Date().toISOString() };
  }
}

/** Rounds to a "nice" amount: 1, 2 or 5 times a power of ten. */
function nice(n: number) {
  const p = 10 ** Math.floor(Math.log10(Math.max(n, 1)));
  const m = n / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

/**
 * Amounts in `currency` that feel like the given US-dollar amounts, rounded
 * to nice numbers: donation presets, minimum goals and minimum withdrawals
 * work in every currency without a hand-tuned table.
 */
export async function localAmounts(currency: string, usd: number[]) {
  const [local, dollar] = await Promise.all([getRate(currency), getRate("USD")]);
  const fx = local.fiatPerBtc / dollar.fiatPerBtc;
  return usd.map((u) => nice(u * fx));
}
