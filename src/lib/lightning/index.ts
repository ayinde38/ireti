import "server-only";
import { demoProvider } from "./demo";
import { nwcProvider } from "./nwc";
import type { LightningProvider } from "./types";

function pick(): LightningProvider {
  if (process.env.NWC_URL) return nwcProvider();
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_WALLET !== "true") {
    throw new Error(
      "No Lightning wallet configured. Set NWC_URL, or ALLOW_DEMO_WALLET=true for a demo deploy.",
    );
  }
  return demoProvider();
}

let cached: LightningProvider | null = null;
export function lightning(): LightningProvider {
  return (cached ??= pick());
}

/**
 * Same rule as `lightning()`: a production server without a wallet is a
 * misconfiguration, never silently "demo" (which would let the simulate
 * endpoint mark donations paid and skip Lightning address checks).
 */
export function walletKind(): LightningProvider["kind"] {
  return lightning().kind;
}

export type Network = "demo" | "mainnet" | "mutinynet";

/** Which chain the configured wallet is expected to be on. */
export function network(): Network {
  if (walletKind() === "demo") return "demo";
  return process.env.LIGHTNING_NETWORK === "mutinynet" ? "mutinynet" : "mainnet";
}

/**
 * Guards against a wallet on the wrong chain: real-money invoices start
 * "lnbc", signet (Mutinynet) "lntbs". Regtest "lnbcrt" is never accepted.
 */
export function invoiceMatchesNetwork(bolt11: string) {
  const pr = bolt11.toLowerCase();
  const n = network();
  if (n === "demo") return true;
  if (n === "mutinynet") return pr.startsWith("lntbs");
  return pr.startsWith("lnbc") && !pr.startsWith("lnbcrt");
}

/** A stand-in hospital wallet is configured (test network only). */
export function testHospitalWallet() {
  return network() === "mutinynet" && Boolean(process.env.TEST_HOSPITAL_NWC_URL);
}
