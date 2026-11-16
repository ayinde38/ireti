export type CampaignStatus =
  | "pending_verification"
  | "live"
  | "funded"
  | "withdrawn"
  | "receipt_posted"
  | "rejected"
  | "frozen";

export type DonationStatus = "pending" | "paid" | "expired";
type WithdrawalStatus = "pending" | "sent" | "failed";
type WithdrawalMethod = "lightning" | "bank";

export interface Hospital {
  id: string;
  name: string;
  city: string;
  state: string;
  lightningAddress: string;
  lightningAddressVerified: boolean;
  bankName: string | null;
  bankAccountLast4: string | null;
  /** Smallest withdrawal the hospital accepts, to avoid tiny payouts. */
  minWithdrawalNgn: number;
  verified: boolean;
  createdAt: string;
}

export interface HospitalUser {
  id: string;
  hospitalId: string;
  email: string;
  name: string;
  /** scrypt hash "salt:hash" of the user's access code. */
  accessCodeHash: string;
}

export interface Campaign {
  id: string;
  slug: string;
  patientDisplayName: string;
  title: string;
  story: string;
  hospitalId: string;
  billReference: string;
  goalNgn: number;
  status: CampaignStatus;
  rejectionReason: string | null;
  deadline: string;
  campaignerName: string;
  campaignerEmail: string;
  /** sha256 of the private link token the family uses to follow and confirm. */
  familyTokenHash: string;
  consentConfirmed: boolean;
  createdAt: string;
  verifiedAt: string | null;
}

/** Ledger entry: money in. Append-only once paid. */
export interface Donation {
  id: string;
  campaignId: string;
  amountSats: number;
  ngnPerBtcAtPayment: number | null;
  paymentHash: string;
  paymentRequest: string;
  /** Revealed by the wallet once paid; sha256(preimage) === paymentHash. */
  preimage: string | null;
  status: DonationStatus;
  donorName: string | null;
  /** Private. Only used to notify the donor about withdrawals. */
  donorEmail: string | null;
  message: string | null;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
}

/** Ledger entry: money out, from one campaign to its hospital. Append-only. */
export interface Withdrawal {
  id: string;
  campaignId: string;
  hospitalId: string;
  amountSats: number;
  ngnPerBtcAtWithdrawal: number;
  method: WithdrawalMethod;
  /** Lightning address (or masked bank account) the money was sent to. */
  destination: string;
  status: WithdrawalStatus;
  paymentHash: string | null;
  preimage: string | null;
  payoutRef: string | null;
  idempotencyKey: string;
  requestedBy: string;
  receiptUrl: string | null;
  receiptNote: string | null;
  receiptUploadedAt: string | null;
  familyConfirmedAt: string | null;
  createdAt: string;
  sentAt: string | null;
}

type AuditRole = "hospital" | "admin" | "family" | "system";

export interface AuditEntry {
  id: string;
  actorEmail: string | null;
  role: AuditRole;
  action: string;
  campaignId: string | null;
  details: string | null;
  createdAt: string;
}

export interface ReserveSnapshot {
  id: string;
  walletBalanceSats: number;
  ledgerTotalSats: number;
  differenceSats: number;
  takenAt: string;
}

export interface CampaignTotals {
  raisedSats: number;
  withdrawnSats: number;
  availableSats: number;
  donorCount: number;
}
