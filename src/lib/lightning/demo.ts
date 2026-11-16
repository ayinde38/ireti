import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { LightningProvider } from "./types";

/**
 * Demo wallet: no keys, no real money. Invoices look like real bolt11 strings
 * but are not payable; the donate panel offers a "Simulate payment" button
 * only when this provider is active. Never enabled when a real wallet is set.
 */
const g = globalThis as unknown as {
  __iretiDemoInvoices?: Map<string, { preimage: string; paid: boolean; expiresAt: number }>;
};
const invoices = (g.__iretiDemoInvoices ??= new Map());

export function markDemoInvoicePaid(hash: string) {
  const inv = invoices.get(hash);
  if (inv) inv.paid = true;
  return Boolean(inv);
}

export function demoProvider(): LightningProvider {
  return {
    kind: "demo",
    async createInvoice(amountSats) {
      const preimage = randomBytes(32).toString("hex");
      const paymentHash = createHash("sha256").update(Buffer.from(preimage, "hex")).digest("hex");
      const expiresAt = Date.now() + 15 * 60_000;
      invoices.set(paymentHash, { preimage, paid: false, expiresAt });
      const body = randomBytes(150).toString("hex").replace(/[^a-z0-9]/g, "");
      return {
        paymentHash,
        paymentRequest: `lnbc${amountSats * 10}n1demo${body}`,
        expiresAt: new Date(expiresAt).toISOString(),
      };
    },
    async lookupInvoice(hash) {
      const inv = invoices.get(hash);
      if (!inv) return { paid: false, preimage: null, expired: true };
      return {
        paid: inv.paid,
        preimage: inv.paid ? inv.preimage : null,
        expired: !inv.paid && inv.expiresAt < Date.now(),
      };
    },
    async payInvoice() {
      const preimage = randomBytes(32).toString("hex");
      return {
        preimage,
        paymentHash: createHash("sha256").update(Buffer.from(preimage, "hex")).digest("hex"),
      };
    },
    async getBalanceSats() {
      // The demo wallet holds exactly what the ledger says it should.
      const { store } = await import("../store");
      return store.ledgerTotalSats();
    },
  };
}
