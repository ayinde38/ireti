-- Hospitals anywhere in Africa, priced in their own currency, and hospitals
-- that register themselves (then wait for Ireti to verify them).

-- Money columns are in the campaign's currency, not always naira.
alter table hospitals rename column min_withdrawal_ngn to min_withdrawal_amount;
alter table campaigns rename column goal_ngn to goal_amount;
alter table donations rename column ngn_per_btc_at_payment to fiat_per_btc_at_payment;
alter table withdrawals rename column ngn_per_btc_at_withdrawal to fiat_per_btc_at_withdrawal;

alter table hospitals
  add column country text not null default 'NG' check (country ~ '^[A-Z]{2}$'),
  add column currency text not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  -- What the hospital submits so Ireti can check it is a real, licensed facility.
  add column address text,
  add column registration_number text,
  add column registration_authority text,
  add column website text,
  add column phone text,
  add column rejection_reason text,
  add column reviewed_at timestamptz;
alter table hospitals alter column country drop default, alter column currency drop default;

alter table hospital_users add column role text;

-- A campaign keeps the currency it was created in, even if its hospital's changes.
alter table campaigns add column currency text check (currency ~ '^[A-Z]{3}$');
update campaigns c set currency = h.currency from hospitals h where h.id = c.hospital_id;
alter table campaigns alter column currency set not null;

-- The guard and the withdrawal function name the renamed column.
create or replace function withdrawals_guard() returns trigger language plpgsql as $$
begin
  if new.id <> old.id or new.campaign_id <> old.campaign_id or new.hospital_id <> old.hospital_id
     or new.amount_sats <> old.amount_sats or new.method <> old.method
     or new.destination <> old.destination or new.idempotency_key <> old.idempotency_key
     or new.requested_by <> old.requested_by or new.created_at <> old.created_at
     or new.fiat_per_btc_at_withdrawal <> old.fiat_per_btc_at_withdrawal then
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

create or replace function create_withdrawal(payload jsonb) returns withdrawals language plpgsql as $$
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
  insert into withdrawals (campaign_id, hospital_id, amount_sats, fiat_per_btc_at_withdrawal, method,
                           destination, idempotency_key, requested_by)
  values (c.id, c.hospital_id, (payload->>'amount_sats')::bigint, (payload->>'fiat_per_btc_at_withdrawal')::numeric,
          payload->>'method', payload->>'destination', payload->>'idempotency_key', payload->>'requested_by')
  returning * into w;
  return w;
end $$;
