interface CreatedInvoice {
  paymentRequest: string;
  paymentHash: string;
  expiresAt: string;
}

interface InvoiceState {
  paid: boolean;
  preimage: string | null;
  expired: boolean;
}

interface PaymentResult {
  paymentHash: string | null;
  preimage: string;
}

/**
 * The platform wallet. Implementations: NWC (any NWC wallet, e.g. Alby Hub,
 * via @getalby/sdk) and a demo wallet that needs no keys.
 */
export interface LightningProvider {
  readonly kind: "nwc" | "demo";
  createInvoice(amountSats: number, memo: string): Promise<CreatedInvoice>;
  lookupInvoice(paymentHash: string): Promise<InvoiceState>;
  payInvoice(paymentRequest: string): Promise<PaymentResult>;
  /** Current wallet balance, for proof-of-reserves snapshots. */
  getBalanceSats(): Promise<number>;
}
