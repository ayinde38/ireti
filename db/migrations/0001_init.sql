-- Ireti schema. Applied automatically on first connection (src/lib/db.ts),
-- to Postgres via DATABASE_URL or to the embedded local database.
-- Ledger tables (donations, withdrawals, audit_log, reserve_snapshots) are
-- append-only: triggers below refuse deletes and any change other than the
-- few one-way transitions the app needs.

create table hospitals (
  id text primary key default 'hosp_' || gen_random_uuid(),
  name text not null,
  city text not null,
  state text not null,
  lightning_address text not null,
  lightning_address_verified boolean not null default false,
  bank_name text,
  bank_account_last4 text,
  min_withdrawal_ngn integer not null default 5000 check (min_withdrawal_ngn >= 0),
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table hospital_users (
  id text primary key default 'hu_' || gen_random_uuid(),
  hospital_id text not null references hospitals(id),
  email text not null unique check (email = lower(email)),
  name text not null,
  access_code_hash text not null
);

create type campaign_status as enum (
  'pending_verification', 'live', 'funded', 'withdrawn', 'receipt_posted', 'rejected', 'frozen'
);

create table campaigns (
  id text primary key default 'camp_' || gen_random_uuid(),
  slug text not null unique,
  patient_display_name text not null,
  title text not null,
  story text not null,
  hospital_id text not null references hospitals(id),
  bill_reference text not null,
  goal_ngn bigint not null check (goal_ngn > 0),
  status campaign_status not null default 'pending_verification',
  rejection_reason text,
  deadline timestamptz not null,
  campaigner_name text not null,
  campaigner_email text not null,
  family_token_hash text not null unique,
  consent_confirmed boolean not null check (consent_confirmed),
  created_at timestamptz not null default now(),
  verified_at timestamptz
);
create index on campaigns (hospital_id);
create index on campaigns (status);

create table donations (
  id text primary key default 'don_' || gen_random_uuid(),
  campaign_id text not null references campaigns(id),
  amount_sats bigint not null check (amount_sats > 0),
  ngn_per_btc_at_payment numeric,
  payment_hash text not null unique check (payment_hash ~ '^[0-9a-f]{64}$'),
  payment_request text not null,
  preimage text check (preimage is null or preimage ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired')),
  donor_name text,
  donor_email text,
  message text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  paid_at timestamptz
);
create index on donations (campaign_id, status);

create table withdrawals (
  id text primary key default 'wd_' || gen_random_uuid(),
  campaign_id text not null references campaigns(id),
  hospital_id text not null references hospitals(id),
  amount_sats bigint not null check (amount_sats > 0),
  ngn_per_btc_at_withdrawal numeric not null,
  method text not null check (method in ('lightning', 'bank')),
  destination text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  payment_hash text,
  preimage text,
  payout_ref text,
  idempotency_key text not null unique,
  requested_by text not null,
  receipt_url text,
  receipt_note text,
  receipt_uploaded_at timestamptz,
  family_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index on withdrawals (campaign_id);

create table audit_log (
  id text primary key default 'au_' || gen_random_uuid(),
  actor_email text,
  role text not null check (role in ('hospital', 'admin', 'family', 'system')),
  action text not null,
  campaign_id text references campaigns(id),
  details text,
  created_at timestamptz not null default now()
);
create index on audit_log (campaign_id, created_at desc);

create table reserve_snapshots (
  id text primary key default 'snap_' || gen_random_uuid(),
  wallet_balance_sats bigint not null,
  ledger_total_sats bigint not null,
  difference_sats bigint not null,
  taken_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Append-only enforcement
-- ---------------------------------------------------------------------------

create function refuse_delete() returns trigger language plpgsql as $$
begin
  raise exception '% rows are append-only and cannot be deleted', tg_table_name;
end $$;

create function refuse_update() returns trigger language plpgsql as $$
begin
  raise exception '% rows are append-only and cannot be changed', tg_table_name;
end $$;

create trigger audit_log_no_delete before delete on audit_log for each row execute function refuse_delete();
create trigger audit_log_no_update before update on audit_log for each row execute function refuse_update();
create trigger snapshots_no_delete before delete on reserve_snapshots for each row execute function refuse_delete();
create trigger snapshots_no_update before update on reserve_snapshots for each row execute function refuse_update();
create trigger donations_no_delete before delete on donations for each row execute function refuse_delete();
create trigger withdrawals_no_delete before delete on withdrawals for each row execute function refuse_delete();

-- Donations: pending → paid | expired, once. Nothing else ever changes.
create function donations_guard() returns trigger language plpgsql as $$
begin
  if old.status <> 'pending' then
    raise exception 'donation % is settled and cannot be changed', old.id;
  end if;
  if new.status not in ('paid', 'expired')
     or new.id <> old.id or new.campaign_id <> old.campaign_id
     or new.amount_sats <> old.amount_sats or new.payment_hash <> old.payment_hash
     or new.payment_request <> old.payment_request or new.created_at <> old.created_at then
    raise exception 'only the settlement fields of donation % may be written', old.id;
  end if;
  if new.status = 'paid' and new.preimage is not null
     and encode(sha256(decode(new.preimage, 'hex')), 'hex') <> new.payment_hash then
    raise exception 'preimage does not match payment hash for %', old.id;
  end if;
  return new;
end $$;
create trigger donations_guard before update on donations for each row execute function donations_guard();

-- Withdrawals: core fields frozen; status pending → sent | failed once;
-- receipt and family confirmation each written once, only after sending.
create function withdrawals_guard() returns trigger language plpgsql as $$
begin
  if new.id <> old.id or new.campaign_id <> old.campaign_id or new.hospital_id <> old.hospital_id
     or new.amount_sats <> old.amount_sats or new.method <> old.method
     or new.destination <> old.destination or new.idempotency_key <> old.idempotency_key
     or new.requested_by <> old.requested_by or new.created_at <> old.created_at
     or new.ngn_per_btc_at_withdrawal <> old.ngn_per_btc_at_withdrawal then
    raise exception 'withdrawal % core fields are immutable', old.id;
  end if;
  if new.status <> old.status and old.status <> 'pending' then
    raise exception 'withdrawal % is already %', old.id, old.status;
  end if;
  if old.status <> 'pending' and (
       new.payment_hash is distinct from old.payment_hash or new.preimage is distinct from old.preimage
       or new.payout_ref is distinct from old.payout_ref or new.sent_at is distinct from old.sent_at) then
    raise exception 'withdrawal % payment proof is immutable', old.id;
  end if;
  if old.receipt_uploaded_at is not null and (
       new.receipt_url is distinct from old.receipt_url or new.receipt_note is distinct from old.receipt_note
       or new.receipt_uploaded_at is distinct from old.receipt_uploaded_at) then
    raise exception 'receipt for withdrawal % already posted', old.id;
  end if;
  if old.family_confirmed_at is not null and new.family_confirmed_at is distinct from old.family_confirmed_at then
    raise exception 'withdrawal % already confirmed by family', old.id;
  end if;
  if (new.receipt_uploaded_at is not null or new.family_confirmed_at is not null) and new.status <> 'sent' then
    raise exception 'withdrawal % must be sent before receipts or confirmations', old.id;
  end if;
  return new;
end $$;
create trigger withdrawals_guard before update on withdrawals for each row execute function withdrawals_guard();

-- ---------------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------------

-- Escrow held across all campaigns.
create function ledger_total_sats() returns bigint language sql stable as $$
  select coalesce((select sum(amount_sats) from donations where status = 'paid'), 0)
       - coalesce((select sum(amount_sats) from withdrawals where status <> 'failed'), 0);
$$;

-- Insert a withdrawal only if the campaign has enough available balance.
-- Locks the campaign row so two concurrent withdrawals cannot overdraw it.
create function create_withdrawal(payload jsonb) returns withdrawals language plpgsql as $$
declare
  c campaigns;
  available bigint;
  w withdrawals;
begin
  select * into c from campaigns where id = payload->>'campaign_id' for update;
  if not found then raise exception 'campaign not found'; end if;
  if c.status in ('pending_verification', 'rejected', 'frozen') then
    raise exception 'campaign % is not withdrawable (%)', c.id, c.status;
  end if;
  if c.hospital_id <> payload->>'hospital_id' then
    raise exception 'campaign % belongs to another hospital', c.id;
  end if;
  select coalesce((select sum(amount_sats) from donations where campaign_id = c.id and status = 'paid'), 0)
       - coalesce((select sum(amount_sats) from withdrawals where campaign_id = c.id and status <> 'failed'), 0)
    into available;
  if (payload->>'amount_sats')::bigint > available then
    raise exception 'amount exceeds available balance of % sats', available;
  end if;
  insert into withdrawals (campaign_id, hospital_id, amount_sats, ngn_per_btc_at_withdrawal, method,
                           destination, idempotency_key, requested_by)
  values (c.id, c.hospital_id, (payload->>'amount_sats')::bigint, (payload->>'ngn_per_btc_at_withdrawal')::numeric,
          payload->>'method', payload->>'destination', payload->>'idempotency_key', payload->>'requested_by')
  returning * into w;
  return w;
end $$;

-- ---------------------------------------------------------------------------
-- Receipt files (public proof, served by /api/files/[id]). Never changed.
-- ---------------------------------------------------------------------------

create table receipt_files (
  id text primary key default 'file_' || gen_random_uuid(),
  withdrawal_id text not null references withdrawals(id),
  content_type text not null,
  data bytea not null,
  created_at timestamptz not null default now()
);
create trigger receipt_files_no_delete before delete on receipt_files for each row execute function refuse_delete();
create trigger receipt_files_no_update before update on receipt_files for each row execute function refuse_update();
