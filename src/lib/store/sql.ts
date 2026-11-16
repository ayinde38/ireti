import "server-only";
import { sql } from "../db";
import type { AuditEntry, Campaign, Donation, Hospital, HospitalUser, ReserveSnapshot, Withdrawal } from "../types";
import type { Store } from "./types";

/**
 * Postgres-backed store (real Postgres or the embedded local one). Ledger
 * rules are also enforced by triggers in db/migrations, so even a bug here
 * cannot rewrite history.
 */

const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

// bigint and numeric columns arrive as strings or bigints; the app uses numbers.
const NUMERIC = new Set([
  "amount_sats", "goal_ngn", "min_withdrawal_ngn", "ngn_per_btc_at_payment", "ngn_per_btc_at_withdrawal",
  "wallet_balance_sats", "ledger_total_sats", "difference_sats",
]);

function fromRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[toCamel(k)] =
      v instanceof Date ? v.toISOString() : v != null && NUMERIC.has(k) ? Number(v) : v;
  }
  return out as T;
}
const rows = <T>(list: Record<string, unknown>[]) => list.map((r) => fromRow<T>(r));

async function q<T>(text: string, params: unknown[] = []): Promise<T[]> {
  return rows<T>(await (await sql()).query(text, params));
}
async function first<T>(text: string, params: unknown[]): Promise<T | null> {
  return (await q<T>(text, params))[0] ?? null;
}
async function mustFirst<T>(text: string, params: unknown[], id: string): Promise<T> {
  const r = await first<T>(text, params);
  if (!r) throw new Error(`Not found: ${id}`);
  return r;
}

/** Table and column names only ever come from code, never from input. */
export function insertSql(table: string, obj: object) {
  const entries = Object.entries(obj).filter(([, v]) => v !== undefined);
  const cols = entries.map(([k]) => toSnake(k)).join(", ");
  const vals = entries.map((_, i) => `$${i + 1}`).join(", ");
  return { text: `insert into ${table} (${cols}) values (${vals}) returning *`, params: entries.map(([, v]) => v) };
}
function updateSql(table: string, id: string, patch: object, extraWhere = "") {
  const entries = Object.entries(patch).filter(([k, v]) => v !== undefined && k !== "id");
  const set = entries.map(([k], i) => `${toSnake(k)} = $${i + 2}`).join(", ");
  return {
    text: `update ${table} set ${set} where id = $1 ${extraWhere} returning *`,
    params: [id, ...entries.map(([, v]) => v)],
  };
}

const insert = async <T>(table: string, obj: object) => {
  const { text, params } = insertSql(table, obj);
  return (await q<T>(text, params))[0];
};
const update = async <T>(table: string, id: string, patch: object) => {
  const { text, params } = updateSql(table, id, patch);
  return mustFirst<T>(text, params, id);
};

export const sqlStore: Store = {
  listHospitals: (opts) =>
    q<Hospital>(`select * from hospitals ${opts?.verifiedOnly ? "where verified" : ""} order by name`),
  getHospital: (id) => first<Hospital>("select * from hospitals where id = $1", [id]),
  updateHospital: (id, patch) => update<Hospital>("hospitals", id, patch),

  getHospitalUserByEmail: (email) =>
    first<HospitalUser>("select * from hospital_users where email = $1", [email.trim().toLowerCase()]),

  listCampaigns: (opts) =>
    q<Campaign>(
      `select * from campaigns
       where ($1::text[] is null or status::text = any($1)) and ($2::text is null or hospital_id = $2)
       order by created_at desc`,
      [opts?.status ?? null, opts?.hospitalId ?? null],
    ),
  getCampaign: (id) => first<Campaign>("select * from campaigns where id = $1", [id]),
  getCampaignBySlug: (slug) => first<Campaign>("select * from campaigns where slug = $1", [slug]),
  getCampaignByFamilyTokenHash: (hash) =>
    first<Campaign>("select * from campaigns where family_token_hash = $1", [hash]),
  createCampaign: (input) => insert<Campaign>("campaigns", input),
  updateCampaign: (id, patch) => update<Campaign>("campaigns", id, patch),

  listDonations: (campaignId, opts) =>
    q<Donation>(
      "select * from donations where campaign_id = $1 and ($2::text is null or status = $2) order by created_at desc",
      [campaignId, opts?.status ?? null],
    ),
  getDonation: (id) => first<Donation>("select * from donations where id = $1", [id]),
  getDonationByHash: (hash) => first<Donation>("select * from donations where payment_hash = $1", [hash]),
  createDonation: (input) => insert<Donation>("donations", input),
  async settleDonation(id, s) {
    // Only a pending row settles, exactly once; otherwise return it unchanged.
    const { text, params } = updateSql("donations", id, s, "and status = 'pending'");
    return (
      (await first<Donation>(text, params)) ??
      mustFirst<Donation>("select * from donations where id = $1", [id], id)
    );
  },

  listWithdrawals: (campaignId) =>
    q<Withdrawal>("select * from withdrawals where campaign_id = $1 order by created_at desc", [campaignId]),
  getWithdrawal: (id) => first<Withdrawal>("select * from withdrawals where id = $1", [id]),
  getWithdrawalByIdempotencyKey: (key) =>
    first<Withdrawal>("select * from withdrawals where idempotency_key = $1", [key]),
  // Runs through a database function that locks the campaign row and refuses
  // an amount above its available balance (see migration).
  async createWithdrawal(input) {
    const payload = Object.fromEntries(Object.entries(input).map(([k, v]) => [toSnake(k), v]));
    return (await q<Withdrawal>("select * from create_withdrawal($1::jsonb)", [JSON.stringify(payload)]))[0];
  },
  patchWithdrawal(id, patch) {
    const { kind, ...fields } = patch;
    const status = kind === "sent" || kind === "failed" ? { status: kind } : {};
    return update<Withdrawal>("withdrawals", id, { ...fields, ...status });
  },

  async ledgerTotalSats() {
    const [r] = await (await sql()).query<{ total: string }>("select ledger_total_sats() as total");
    return Number(r.total);
  },

  async addAudit(e) {
    await insert("audit_log", e);
  },
  listAudit: (campaignId) =>
    q<AuditEntry>("select * from audit_log where campaign_id = $1 order by created_at desc", [campaignId]),

  addSnapshot: (s) => insert<ReserveSnapshot>("reserve_snapshots", s),
  listSnapshots: (limit) =>
    q<ReserveSnapshot>("select * from reserve_snapshots order by taken_at desc limit $1", [limit]),

  async saveReceiptFile(withdrawalId, file) {
    // Receipts are public by design: they are the proof donors came for.
    // Hospitals are asked to redact patient identifiers before uploading.
    const data = new Uint8Array(await file.arrayBuffer());
    const f = await insert<{ id: string }>("receipt_files", {
      withdrawalId,
      contentType: file.type,
      data: Buffer.from(data),
    });
    return `/api/files/${f.id}`;
  },

  async getReceiptFile(id) {
    const r = await first<{ contentType: string; data: Uint8Array }>(
      "select content_type, data from receipt_files where id = $1",
      [id],
    );
    return r ? { type: r.contentType, data: r.data } : null;
  },
};
