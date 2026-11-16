import { createHash } from "node:crypto";
import type { Sql } from "../db";
import { familyTokenHash, hashSecret } from "../secrets";
import { insertSql } from "./sql";
import type {
  AuditEntry,
  Campaign,
  Donation,
  Hospital,
  HospitalUser,
  ReserveSnapshot,
  Withdrawal,
} from "../types";

/**
 * Demo data. Hospital names are invented; no real institution is implied.
 * Each seeded payment gets a random-looking preimage whose sha256 is its
 * payment hash, so the in-browser proof check works on demo data too.
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const sha256 = (hex: string) => createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");
const preimageFor = (seed: string) => createHash("sha256").update(`ireti-demo:${seed}`).digest("hex");

/** Demo family links: /family/<token>. Printed in the README. */
const DEMO_FAMILY_TOKENS: Record<string, string> = {
  camp_amara: "demo-family-amara",
  camp_emeka: "demo-family-emeka",
  camp_musa: "demo-family-musa",
  camp_kemi: "demo-family-kemi",
  camp_wanjiru: "demo-family-wanjiru",
};
const DEMO_RATES: Record<string, number> = { NGN: 86_000_000, KES: 8_400_000 };

const seedHospitals: Hospital[] = [
  {
    id: "hosp_harbour",
    country: "NG",
    currency: "NGN",
    address: "14 Marina Road, Lagos Island",
    registrationNumber: "LSHFA/PRV/2019/0884",
    registrationAuthority: "Lagos State Health Facility Monitoring and Accreditation Agency",
    website: "https://harbourview.invalid",
    phone: "+234 1 555 0142",
    rejectionReason: null,
    reviewedAt: null,
    name: "Harbour View Specialist Hospital",
    city: "Lagos",
    state: "Lagos",
    lightningAddress: "billing@harbourview.invalid",
    lightningAddressVerified: true,
    bankName: "Example Bank",
    bankAccountLast4: "4821",
    minWithdrawalAmount: 5_000,
    verified: true,
    createdAt: daysAgo(60),
  },
  {
    id: "hosp_ibadan",
    country: "NG",
    currency: "NGN",
    address: "2 Ring Road, Ibadan",
    registrationNumber: "OYSMOH/HF/2017/0213",
    registrationAuthority: "Oyo State Ministry of Health",
    website: "https://ibadanhills.invalid",
    phone: "+234 2 555 0177",
    rejectionReason: null,
    reviewedAt: null,
    name: "Ibadan Hills Children's Hospital",
    city: "Ibadan",
    state: "Oyo",
    lightningAddress: "accounts@ibadanhills.invalid",
    lightningAddressVerified: true,
    bankName: "Example Bank",
    bankAccountLast4: "0937",
    minWithdrawalAmount: 5_000,
    verified: true,
    createdAt: daysAgo(45),
  },
  {
    id: "hosp_northgate",
    country: "NG",
    currency: "NGN",
    address: "40 Ahmadu Bello Way, Kaduna",
    registrationNumber: "KDSMOH/HF/2021/1130",
    registrationAuthority: "Kaduna State Ministry of Health",
    website: null,
    phone: "+234 62 555 0190",
    rejectionReason: null,
    reviewedAt: null,
    name: "Northgate General Hospital",
    city: "Kaduna",
    state: "Kaduna",
    lightningAddress: "finance@northgate.invalid",
    lightningAddressVerified: false,
    bankName: null,
    bankAccountLast4: null,
    minWithdrawalAmount: 5_000,
    verified: false,
    createdAt: daysAgo(3),
  },
  {
    id: "hosp_riverside",
    name: "Riverside Mission Hospital",
    country: "KE",
    currency: "KES",
    city: "Nairobi",
    state: "Nairobi County",
    address: "Riverside Drive, Westlands",
    registrationNumber: "KMPDC/HF/2018/04417",
    registrationAuthority: "Kenya Medical Practitioners and Dentists Council",
    website: "https://riverside-mission.invalid",
    phone: "+254 20 555 0123",
    rejectionReason: null,
    reviewedAt: null,
    lightningAddress: "billing@riverside-mission.invalid",
    lightningAddressVerified: true,
    bankName: null,
    bankAccountLast4: null,
    minWithdrawalAmount: 500,
    verified: true,
    createdAt: daysAgo(50),
  },
];

const seedHospitalUsers: HospitalUser[] = [
  { id: "hu_1", hospitalId: "hosp_harbour", email: "billing@harbourview.test", name: "Folake Adeyemi", role: "Head of billing", accessCodeHash: hashSecret("ireti-demo") },
  { id: "hu_2", hospitalId: "hosp_ibadan", email: "accounts@ibadanhills.test", name: "Ibrahim Sule", role: "Accounts officer", accessCodeHash: hashSecret("ireti-demo") },
  { id: "hu_3", hospitalId: "hosp_riverside", email: "billing@riverside.test", name: "Grace Wanjiku", role: "Billing manager", accessCodeHash: hashSecret("ireti-demo") },
  { id: "hu_4", hospitalId: "hosp_northgate", email: "finance@northgate.test", name: "Aminu Bello", role: "Finance officer", accessCodeHash: hashSecret("ireti-demo") },
];

const seedCampaigns: Campaign[] = [
  {
    id: "camp_amara",
    slug: "amara-heart-surgery",
    patientDisplayName: "Amara",
    title: "Amara's heart surgery",
    story:
      "Amara is seven and loves drawing horses. She was born with a hole in her heart, and her doctors at Ibadan Hills say she needs surgery before the end of the year.\n\nHer parents have sold what they can and borrowed from family. The hospital has confirmed the bill. Every naira raised here is held in escrow for the hospital, never paid to us or to the family, and you will see the receipt when the hospital withdraws it.",
    hospitalId: "hosp_ibadan",
    billReference: "IHCH/CARD/2026/0412",
    goalAmount: 4_200_000,
    currency: "NGN",
    status: "live",
    rejectionReason: null,
    deadline: daysAhead(24),
    campaignerName: "Ngozi (Amara's mother)",
    campaignerEmail: "ngozi@example.com",
    familyTokenHash: familyTokenHash(DEMO_FAMILY_TOKENS.camp_amara),
    consentConfirmed: true,
    createdAt: daysAgo(9),
    verifiedAt: daysAgo(8),
  },
  {
    id: "camp_emeka",
    slug: "emeka-physiotherapy",
    patientDisplayName: "Emeka",
    title: "Emeka's recovery after a road accident",
    story:
      "Emeka drives a danfo in Lagos. In September a lorry hit his bus and broke his leg in two places. The surgery went well; now he needs twelve weeks of physiotherapy to walk and work again.\n\nHarbour View has confirmed the treatment plan and its cost. The hospital withdraws from this campaign as sessions are completed, and posts a receipt each time.",
    hospitalId: "hosp_harbour",
    billReference: "HVSH/PT/2026/1187",
    goalAmount: 1_150_000,
    currency: "NGN",
    status: "live",
    rejectionReason: null,
    deadline: daysAhead(40),
    campaignerName: "Chidi (Emeka's brother)",
    campaignerEmail: "chidi@example.com",
    familyTokenHash: familyTokenHash(DEMO_FAMILY_TOKENS.camp_emeka),
    consentConfirmed: true,
    createdAt: daysAgo(15),
    verifiedAt: daysAgo(14),
  },
  {
    id: "camp_musa",
    slug: "baba-musa-cataract",
    patientDisplayName: "Baba Musa",
    title: "Sight for Baba Musa",
    story:
      "Baba Musa is 71 and has not been able to read his Qur'an for two years because of cataracts in both eyes. His grandchildren raised the cost of surgery on his left eye here, and the hospital has been paid. Thank you to everyone who gave.",
    hospitalId: "hosp_harbour",
    billReference: "HVSH/OPH/2026/0930",
    goalAmount: 380_000,
    currency: "NGN",
    status: "receipt_posted",
    rejectionReason: null,
    deadline: daysAgo(2),
    campaignerName: "Zainab (granddaughter)",
    campaignerEmail: "zainab@example.com",
    familyTokenHash: familyTokenHash(DEMO_FAMILY_TOKENS.camp_musa),
    consentConfirmed: true,
    createdAt: daysAgo(30),
    verifiedAt: daysAgo(29),
  },
  {
    id: "camp_kemi",
    slug: "kemi-maternity-bill",
    patientDisplayName: "Kemi",
    title: "Kemi's emergency caesarean",
    story:
      "Kemi delivered twin girls by emergency caesarean last week. Mother and babies are well, but the family cannot pay the bill and the hospital needs it settled before discharge.",
    hospitalId: "hosp_harbour",
    billReference: "HVSH/MAT/2026/2214",
    goalAmount: 650_000,
    currency: "NGN",
    status: "pending_verification",
    rejectionReason: null,
    deadline: daysAhead(21),
    campaignerName: "Tolu (Kemi's husband)",
    campaignerEmail: "tolu@example.com",
    familyTokenHash: familyTokenHash(DEMO_FAMILY_TOKENS.camp_kemi),
    consentConfirmed: true,
    createdAt: daysAgo(1),
    verifiedAt: null,
  },
  {
    id: "camp_wanjiru",
    slug: "wanjiru-dialysis",
    patientDisplayName: "Wanjiru",
    title: "Dialysis for Wanjiru",
    story:
      "Wanjiru is a 34-year-old primary school teacher in Nairobi. Her kidneys failed in August and she now needs dialysis three times a week while she waits for a transplant assessment.\n\nNHIF covers part of each session; the rest is more than her salary. Riverside Mission has confirmed the treatment plan and its cost for the next three months, and withdraws from this campaign as sessions are done.",
    hospitalId: "hosp_riverside",
    billReference: "RMH/REN/2026/0318",
    goalAmount: 450_000,
    currency: "KES",
    status: "live",
    rejectionReason: null,
    deadline: daysAhead(35),
    campaignerName: "Njeri (Wanjiru's sister)",
    campaignerEmail: "njeri@example.com",
    familyTokenHash: familyTokenHash(DEMO_FAMILY_TOKENS.camp_wanjiru),
    consentConfirmed: true,
    createdAt: daysAgo(6),
    verifiedAt: daysAgo(5),
  },
];

const donation = (
  id: string,
  campaignId: string,
  amountSats: number,
  ago: number,
  donorName: string | null,
  message: string | null,
  currency = "NGN",
): Donation => {
  const preimage = preimageFor(id);
  return {
    id,
    campaignId,
    amountSats,
    fiatPerBtcAtPayment: DEMO_RATES[currency],
    paymentHash: sha256(preimage),
    paymentRequest: "",
    preimage,
    status: "paid",
    donorName,
    donorEmail: null,
    message,
    createdAt: daysAgo(ago),
    expiresAt: daysAgo(ago),
    paidAt: daysAgo(ago),
  };
};

const seedDonations: Donation[] = [
  donation("don_a1", "camp_amara", 210_000, 7.5, "Tobi in London", "Get well soon, Amara. Draw me a horse!"),
  donation("don_a2", "camp_amara", 50_000, 6.2, null, null),
  donation("don_a3", "camp_amara", 400_000, 5.1, "Adaeze's church choir, Houston", "We are praying for you."),
  donation("don_a4", "camp_amara", 25_000, 3.8, "Kwame", null),
  donation("don_a5", "camp_amara", 600_000, 2.4, null, "From a stranger in Accra."),
  donation("don_a6", "camp_amara", 12_500, 0.6, "Ifeoma", "Small, but with love."),
  donation("don_e1", "camp_emeka", 90_000, 12, "Danfo drivers' union, Oshodi", "Our brother will drive again."),
  donation("don_e2", "camp_emeka", 150_000, 9, "Sade", null),
  donation("don_e3", "camp_emeka", 33_000, 4, null, null),
  donation("don_e4", "camp_emeka", 130_000, 2, "Musa & family", "Quick recovery."),
  donation("don_m1", "camp_musa", 220_000, 25, "Zainab's colleagues", null),
  donation("don_m2", "camp_musa", 150_000, 22, null, "For Baba."),
  donation("don_m3", "camp_musa", 72_000, 18, "Aunty Hauwa", null),
  donation("don_w1", "camp_wanjiru", 300_000, 4.5, "Kamau", "Pole sana. Get strong, mwalimu.", "KES"),
  donation("don_w2", "camp_wanjiru", 120_000, 3, null, null, "KES"),
  donation("don_w3", "camp_wanjiru", 850_000, 1.2, "Her Form 2 class, Kibera", "We miss you, teacher!", "KES"),
];

const withdrawal = (
  w: Pick<Withdrawal, "id" | "campaignId" | "hospitalId" | "amountSats" | "destination"> &
    Partial<Withdrawal> & { ago: number },
): Withdrawal => {
  const preimage = preimageFor(w.id);
  const { ago, ...rest } = w;
  return {
    fiatPerBtcAtWithdrawal: DEMO_RATES.NGN,
    method: "lightning",
    status: "sent",
    paymentHash: sha256(preimage),
    preimage,
    payoutRef: null,
    idempotencyKey: `seed-${w.id}`,
    requestedBy: "seed",
    receiptUrl: null,
    receiptNote: null,
    receiptUploadedAt: null,
    familyConfirmedAt: null,
    createdAt: daysAgo(ago),
    sentAt: daysAgo(ago),
    ...rest,
  };
};

const seedWithdrawals: Withdrawal[] = [
  withdrawal({
    id: "wd_e1",
    campaignId: "camp_emeka",
    hospitalId: "hosp_harbour",
    amountSats: 240_000,
    destination: "billing@harbourview.invalid",
    requestedBy: "billing@harbourview.test",
    receiptNote: "Physiotherapy sessions 1–6 paid in full. Receipt HVSH/R/56102.",
    receiptUploadedAt: daysAgo(4),
    familyConfirmedAt: daysAgo(3.5),
    ago: 5,
  }),
  withdrawal({
    id: "wd_e2",
    campaignId: "camp_emeka",
    hospitalId: "hosp_harbour",
    amountSats: 90_000,
    destination: "billing@harbourview.invalid",
    requestedBy: "billing@harbourview.test",
    ago: 0.4,
  }),
  withdrawal({
    id: "wd_m1",
    campaignId: "camp_musa",
    hospitalId: "hosp_harbour",
    amountSats: 442_000,
    destination: "billing@harbourview.invalid",
    requestedBy: "billing@harbourview.test",
    receiptNote: "Left-eye cataract surgery paid. Receipt HVSH/R/55821.",
    receiptUploadedAt: daysAgo(2),
    familyConfirmedAt: daysAgo(1.6),
    ago: 3,
  }),
];

const audit = (
  id: string,
  campaignId: string,
  ago: number,
  role: AuditEntry["role"],
  actorEmail: string | null,
  action: string,
  details: string | null = null,
): AuditEntry => ({ id, campaignId, createdAt: daysAgo(ago), role, actorEmail, action, details });

const seedAudit: AuditEntry[] = [
  audit("au1", "camp_amara", 8, "hospital", "accounts@ibadanhills.test", "bill_approved", "IHCH/CARD/2026/0412"),
  audit("au2", "camp_emeka", 14, "hospital", "billing@harbourview.test", "bill_approved", "HVSH/PT/2026/1187"),
  audit("au3", "camp_emeka", 5, "hospital", "billing@harbourview.test", "withdrawal_sent", "240,000 sats"),
  audit("au4", "camp_emeka", 4, "hospital", "billing@harbourview.test", "receipt_uploaded"),
  audit("au5", "camp_emeka", 3.5, "family", null, "family_confirmed"),
  audit("au6", "camp_emeka", 0.4, "hospital", "billing@harbourview.test", "withdrawal_sent", "90,000 sats"),
  audit("au7", "camp_musa", 29, "hospital", "billing@harbourview.test", "bill_approved", "HVSH/OPH/2026/0930"),
  audit("au8", "camp_musa", 3, "hospital", "billing@harbourview.test", "withdrawal_sent", "442,000 sats"),
  audit("au9", "camp_musa", 2, "hospital", "billing@harbourview.test", "receipt_uploaded"),
  audit("au10", "camp_musa", 1.6, "family", null, "family_confirmed"),
  audit("au11", "camp_wanjiru", 5, "hospital", "billing@riverside.test", "bill_approved", "RMH/REN/2026/0318"),
];

// Escrow held = all paid donations − all sent withdrawals.
const held =
  seedDonations.reduce((s, d) => s + d.amountSats, 0) -
  seedWithdrawals.reduce((s, w) => s + w.amountSats, 0);

const seedSnapshots: ReserveSnapshot[] = Array.from({ length: 6 }, (_, i) => ({
  id: `snap_${i}`,
  walletBalanceSats: held,
  ledgerTotalSats: held,
  differenceSats: 0,
  takenAt: new Date(Date.now() - (6 - i) * 3_600_000).toISOString(),
}));

/**
 * Loads the demo data into an empty database, in foreign-key order.
 * With a real wallet (even on the test network) the sample donations and
 * payouts are left out: they were never paid into that wallet, so the
 * reserves check would rightly report a shortfall. Every sat on the ledger
 * is then a real payment.
 */
export async function seedInto(db: Sql, { withLedger }: { withLedger: boolean }) {
  const campaigns = withLedger
    ? seedCampaigns
    : seedCampaigns.map((c) => (c.status === "pending_verification" ? c : { ...c, status: "live" as const }));
  const tables: [string, object[]][] = withLedger
    ? [
        ["hospitals", seedHospitals],
        ["hospital_users", seedHospitalUsers],
        ["campaigns", campaigns],
        ["donations", seedDonations],
        ["withdrawals", seedWithdrawals],
        ["audit_log", seedAudit],
        ["reserve_snapshots", seedSnapshots],
      ]
    : [
        ["hospitals", seedHospitals],
        ["hospital_users", seedHospitalUsers],
        ["campaigns", campaigns],
        ["audit_log", seedAudit.filter((a) => a.action === "bill_approved")],
      ];
  for (const [table, list] of tables) {
    for (const row of list) {
      const { text, params } = insertSql(table, row);
      await db.query(text, params);
    }
  }
}
