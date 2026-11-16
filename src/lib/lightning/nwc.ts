import "server-only";
import { NWCClient } from "@getalby/sdk/nwc";
import type { LightningProvider } from "./types";

/**
 * Nostr Wallet Connect adapter (@getalby/sdk). Works with Alby Hub, Coinos,
 * Rizful or any NWC wallet. NWC amounts are in millisats.
 * Give the connection only make_invoice, lookup_invoice, pay_invoice and get_balance
 * permissions, with a monthly budget, when you create it in the wallet.
 */
let client: NWCClient | null = null;
function nwc() {
  if (!client) client = new NWCClient({ nostrWalletConnectUrl: process.env.NWC_URL! });
  return client;
}

export function nwcProvider(): LightningProvider {
  return {
    kind: "nwc",
    async createInvoice(amountSats, memo) {
      const expiry = 15 * 60;
      const tx = await nwc().makeInvoice({ amount: amountSats * 1000, description: memo, expiry });
      return {
        paymentRequest: tx.invoice,
        paymentHash: tx.payment_hash,
        expiresAt: tx.expires_at
          ? new Date(tx.expires_at * 1000).toISOString()
          : new Date(Date.now() + expiry * 1000).toISOString(),
      };
    },
    async lookupInvoice(paymentHash) {
      const tx = await nwc().lookupInvoice({ payment_hash: paymentHash });
      const paid = tx.state === "settled" || Boolean(tx.settled_at);
      return {
        paid,
        preimage: paid && tx.preimage ? tx.preimage : null,
        expired: !paid && (tx.state === "failed" || (tx.expires_at ?? Infinity) * 1000 < Date.now()),
      };
    },
    async payInvoice(invoice) {
      const r = await nwc().payInvoice({ invoice });
      return { preimage: r.preimage, paymentHash: null };
    },
    async getBalanceSats() {
      const r = await nwc().getBalance();
      return Math.floor(r.balance / 1000);
    },
  };
}
