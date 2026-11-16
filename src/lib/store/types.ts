import type {
  AuditEntry,
  Campaign,
  CampaignStatus,
  Donation,
  DonationStatus,
  Hospital,
  HospitalUser,
  ReserveSnapshot,
  Withdrawal,
} from "../types";

type NewCampaign = Omit<
  Campaign,
  "id" | "createdAt" | "verifiedAt" | "status" | "rejectionReason"
>;
type NewDonation = Pick<
  Donation,
  "campaignId" | "amountSats" | "paymentHash" | "paymentRequest" | "donorName" | "donorEmail" | "message" | "expiresAt"
>;
type NewWithdrawal = Pick<
  Withdrawal,
  | "campaignId"
  | "hospitalId"
  | "amountSats"
  | "ngnPerBtcAtWithdrawal"
  | "method"
  | "destination"
  | "idempotencyKey"
  | "requestedBy"
>;

/** Only these transitions are ever written to ledger rows (append-only). */
type DonationSettlement =
  | { status: "paid"; paidAt: string; preimage: string | null; ngnPerBtcAtPayment: number }
  | { status: "expired" };
type WithdrawalPatch =
  | { kind: "sent"; sentAt: string; paymentHash: string | null; preimage: string | null; payoutRef: string | null }
  | { kind: "failed" }
  | { kind: "receipt"; receiptUrl: string | null; receiptNote: string | null; receiptUploadedAt: string }
  | { kind: "family_confirmed"; familyConfirmedAt: string };

/**
 * Storage contract, implemented over Postgres in ./sql.ts.
 * Ledger tables (donations, withdrawals) expose no generic update or delete.
 */
export interface Store {
  listHospitals(opts?: { verifiedOnly?: boolean }): Promise<Hospital[]>;
  getHospital(id: string): Promise<Hospital | null>;
  updateHospital(id: string, patch: Partial<Hospital>): Promise<Hospital>;

  getHospitalUserByEmail(email: string): Promise<HospitalUser | null>;

  listCampaigns(opts?: { status?: CampaignStatus[]; hospitalId?: string }): Promise<Campaign[]>;
  getCampaign(id: string): Promise<Campaign | null>;
  getCampaignBySlug(slug: string): Promise<Campaign | null>;
  getCampaignByFamilyTokenHash(hash: string): Promise<Campaign | null>;
  createCampaign(input: NewCampaign): Promise<Campaign>;
  updateCampaign(id: string, patch: Partial<Campaign>): Promise<Campaign>;

  listDonations(campaignId: string, opts?: { status?: DonationStatus }): Promise<Donation[]>;
  getDonation(id: string): Promise<Donation | null>;
  getDonationByHash(paymentHash: string): Promise<Donation | null>;
  createDonation(input: NewDonation): Promise<Donation>;
  /** Pending → paid or expired, once. Refuses any other change. */
  settleDonation(id: string, s: DonationSettlement): Promise<Donation>;

  listWithdrawals(campaignId: string): Promise<Withdrawal[]>;
  getWithdrawal(id: string): Promise<Withdrawal | null>;
  getWithdrawalByIdempotencyKey(key: string): Promise<Withdrawal | null>;
  createWithdrawal(input: NewWithdrawal): Promise<Withdrawal>;
  patchWithdrawal(id: string, patch: WithdrawalPatch): Promise<Withdrawal>;

  /** Sum over every campaign: paid donations minus non-failed withdrawals. */
  ledgerTotalSats(): Promise<number>;

  addAudit(e: Omit<AuditEntry, "id" | "createdAt">): Promise<void>;
  listAudit(campaignId: string): Promise<AuditEntry[]>;

  addSnapshot(s: Omit<ReserveSnapshot, "id" | "takenAt">): Promise<ReserveSnapshot>;
  listSnapshots(limit: number): Promise<ReserveSnapshot[]>;

  /** Stores an uploaded receipt and returns a URL the public page can show. */
  saveReceiptFile(withdrawalId: string, file: File): Promise<string>;
  getReceiptFile(id: string): Promise<{ type: string; data: Uint8Array } | null>;
}
