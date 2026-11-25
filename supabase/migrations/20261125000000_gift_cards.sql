-- JulaDirect Gift Cards: Marketplace + universal Restaurant gift cards.
-- All money movement happens inside SECURITY DEFINER functions. Clients get read-only
-- access to their own rows (RLS) and no direct write access to any gift_* table.
begin;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- settings
create table if not exists public.gift_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  marketplace_enabled boolean not null default true,
  restaurant_enabled boolean not null default true,
  virtual_enabled boolean not null default true,
  physical_enabled boolean not null default false,
  collection_enabled boolean not null default false,
  delivery_enabled boolean not null default false,
  min_amount numeric(14,2) not null default 100 check (min_amount > 0),
  max_amount numeric(14,2) not null default 25000 check (max_amount >= min_amount),
  presets integer[] not null default '{200,500,1000,2000,5000}',
  physical_fee numeric(14,2) not null default 0 check (physical_fee >= 0),
  premium_extra_fee numeric(14,2) not null default 0 check (premium_extra_fee >= 0),
  envelope_fee numeric(14,2) not null default 0 check (envelope_fee >= 0),
  delivery_fee numeric(14,2) not null default 0 check (delivery_fee >= 0),
  collection_note text,
  max_pin_failures integer not null default 5 check (max_pin_failures between 3 and 10),
  lock_minutes integer not null default 15 check (lock_minutes between 5 and 1440),
  updated_at timestamptz not null default now()
);
insert into public.gift_settings(id) values (1) on conflict do nothing;

create table if not exists public.gift_templates (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  category text not null,
  name text not null,
  premium boolean not null default false,
  active boolean not null default true,
  sort integer not null default 100
);

-- ------------------------------------------------------------------ orders
create table if not exists public.gift_orders (
  id uuid primary key default gen_random_uuid(),
  purchaser_id uuid not null references auth.users(id) on delete restrict,
  program text not null check (program in ('marketplace','restaurant')),
  format text not null check (format in ('virtual','physical')),
  amount numeric(14,2) not null check (amount > 0),
  fee_amount numeric(14,2) not null default 0 check (fee_amount >= 0),
  total numeric(14,2) not null check (total > 0),
  currency text not null default 'GMD' check (currency = 'GMD'),
  design jsonb not null check (jsonb_typeof(design) = 'object'),
  recipient_email text, recipient_phone text,
  deliver_at timestamptz,
  envelope boolean not null default false,
  delivery jsonb,
  payment_status text not null default 'pending_payment' check (payment_status in ('pending_payment','pending','paid','failed','cancelled')),
  provider_intent_id text unique, provider_reference text unique, payment_link text, payment_attempts integer not null default 0,
  idempotency_key text not null,
  fulfilment_status text check (fulfilment_status in ('queued','printing','ready','shipped','delivered','cancelled')),
  fulfilment_note text,
  card_id uuid,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (purchaser_id, idempotency_key),
  check (total = amount + fee_amount),
  check ((format = 'physical') = (delivery is not null))
);
create index if not exists gift_orders_purchaser_idx on public.gift_orders(purchaser_id, created_at desc);

-- ------------------------------------------------------------------- cards
create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  share_token text not null unique,
  program text not null check (program in ('marketplace','restaurant')),
  format text not null check (format in ('virtual','physical')),
  initial_amount numeric(14,2) not null check (initial_amount > 0),
  balance numeric(14,2) not null check (balance >= 0 and balance <= initial_amount),
  status text not null check (status in ('pending_activation','active','partially_redeemed','fully_redeemed','suspended','cancelled','expired')),
  purchaser_id uuid not null references auth.users(id) on delete restrict,
  recipient_user_id uuid references auth.users(id) on delete set null,
  order_id uuid not null unique references public.gift_orders(id) on delete restrict,
  template_slug text not null,
  design jsonb not null,
  pin_hash text,
  pin_failures integer not null default 0,
  locked_until timestamptz,
  deliver_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists gift_cards_purchaser_idx on public.gift_cards(purchaser_id);
create index if not exists gift_cards_recipient_idx on public.gift_cards(recipient_user_id);
do $$ begin if not exists (select 1 from pg_constraint where conname='gift_orders_card_fk') then alter table public.gift_orders add constraint gift_orders_card_fk foreign key (card_id) references public.gift_cards(id) deferrable initially deferred; end if; end $$;

-- ------------------------------------------------- immutable ledger + audit
create table if not exists public.gift_ledger (
  id bigserial primary key,
  card_id uuid not null references public.gift_cards(id) on delete restrict,
  kind text not null check (kind in ('issue','redeem','reversal','adjustment','cancel')),
  amount numeric(14,2) not null check (amount <> 0),
  balance_after numeric(14,2) not null check (balance_after >= 0),
  ref_type text, ref_id uuid,
  actor_id uuid, note text,
  created_at timestamptz not null default now()
);
create index if not exists gift_ledger_card_idx on public.gift_ledger(card_id, id);

create table if not exists public.gift_audit (
  id bigserial primary key,
  actor_id uuid, action text not null, entity_type text not null, entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.gift_block_mutation() returns trigger language plpgsql as $$
begin raise exception 'gift ledger and audit records are immutable'; end $$;
drop trigger if exists gift_ledger_immutable on public.gift_ledger;
create trigger gift_ledger_immutable before update or delete on public.gift_ledger for each row execute function public.gift_block_mutation();
drop trigger if exists gift_audit_immutable on public.gift_audit;
create trigger gift_audit_immutable before update or delete on public.gift_audit for each row execute function public.gift_block_mutation();
drop trigger if exists gift_ledger_nt on public.gift_ledger;
create trigger gift_ledger_nt before truncate on public.gift_ledger for each statement execute function public.gift_block_mutation();
drop trigger if exists gift_audit_nt on public.gift_audit;
create trigger gift_audit_nt before truncate on public.gift_audit for each statement execute function public.gift_block_mutation();

-- ----------------------------------------------- restaurant programme tables
create table if not exists public.gift_restaurants (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested','approved','suspended','rejected')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz, decided_by uuid
);
create table if not exists public.gift_restaurant_staff (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid, created_at timestamptz not null default now(),
  primary key (restaurant_id, user_id)
);
create table if not exists public.gift_settlements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  total numeric(14,2) not null check (total > 0),
  status text not null default 'pending_payment' check (status in ('pending_payment','paid','cancelled')),
  reference text, created_by uuid, paid_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.gift_redemptions (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique,
  card_id uuid not null references public.gift_cards(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  balance_after numeric(14,2) not null,
  card_ref text not null,
  bill_total numeric(14,2),
  staff_id uuid not null,
  idem_key text not null,
  status text not null default 'completed' check (status in ('completed','reversed')),
  reversed_at timestamptz, reverse_reason text,
  created_at timestamptz not null default now(),
  unique (restaurant_id, idem_key)
);
create index if not exists gift_redemptions_rest_idx on public.gift_redemptions(restaurant_id, created_at desc);
create table if not exists public.gift_merchant_credits (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  redemption_id uuid not null references public.gift_redemptions(id) on delete restrict,
  kind text not null check (kind in ('redemption','reversal')),
  amount numeric(14,2) not null check (amount <> 0),
  status text not null default 'pending' check (status in ('pending','in_settlement','settled')),
  settlement_id uuid references public.gift_settlements(id),
  created_at timestamptz not null default now(),
  unique (redemption_id, kind),
  check ((kind = 'redemption' and amount > 0) or (kind = 'reversal' and amount < 0))
);
create index if not exists gift_credits_rest_idx on public.gift_merchant_credits(restaurant_id, status);

create table if not exists public.gift_attempts (
  id bigserial primary key,
  kind text not null, actor_id uuid, subject text, ok boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists gift_attempts_idx on public.gift_attempts(kind, actor_id, created_at desc);

-- ---------------------------------------------------------------- helpers
create or replace function public.gift_audit_log(p_action text, p_type text, p_id text, p_details jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.gift_audit(actor_id, action, entity_type, entity_id, details) values (auth.uid(), p_action, p_type, p_id, coalesce(p_details,'{}'));
$$;
revoke all on function public.gift_audit_log(text,text,text,jsonb) from public, anon, authenticated;

create or replace function public.gift_is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and public.is_gambasket_admin();
$$;
create or replace function public.gift_can_staff(p_restaurant uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    exists (select 1 from public.restaurants r where r.id = p_restaurant and r.owner_id = auth.uid())
    or exists (select 1 from public.gift_restaurant_staff s where s.restaurant_id = p_restaurant and s.user_id = auth.uid()));
$$;
create or replace function public.gift_is_owner_of_restaurant(p_restaurant uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.restaurants r where r.id = p_restaurant and r.owner_id = auth.uid());
$$;
create or replace function public.gift_owns_card(p_card uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.gift_cards c where c.id = p_card and (c.purchaser_id = auth.uid() or c.recipient_user_id = auth.uid()));
$$;
grant execute on function public.gift_is_admin(), public.gift_can_staff(uuid), public.gift_is_owner_of_restaurant(uuid), public.gift_owns_card(uuid) to anon, authenticated;

create or replace function public.gift_new_code(p_program text) returns text language plpgsql security definer set search_path = public, extensions as $$
declare alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea; s text := ''; i int; c text;
begin
  loop
    b := gen_random_bytes(12); s := '';
    for i in 0..11 loop s := s || substr(alpha, (get_byte(b,i) % 32) + 1, 1); end loop;
    c := 'JD-' || case p_program when 'restaurant' then 'R' else 'M' end || '-' || substr(s,1,4) || '-' || substr(s,5,4) || '-' || substr(s,9,4);
    exit when not exists (select 1 from public.gift_cards where code = c);
  end loop;
  return c;
end $$;
revoke all on function public.gift_new_code(text) from public, anon, authenticated;

-- --------------------------------------------------------- create purchase
create or replace function public.gift_create_order(
  p_program text, p_format text, p_amount numeric, p_design jsonb, p_idem text,
  p_recipient_email text default null, p_recipient_phone text default null, p_deliver_at timestamptz default null,
  p_envelope boolean default false, p_delivery jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.gift_settings%rowtype; t public.gift_templates%rowtype; v_uid uuid := auth.uid(); v_fee numeric(14,2) := 0;
  v_order public.gift_orders%rowtype; v_img text; v_method text;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','AUTH_REQUIRED'); end if;
  if p_idem is null or length(p_idem) < 12 or length(p_idem) > 128 then return jsonb_build_object('ok',false,'error','BAD_IDEMPOTENCY'); end if;
  select * into v_order from public.gift_orders where purchaser_id = v_uid and idempotency_key = p_idem;
  if found then return jsonb_build_object('ok',true,'order_id',v_order.id,'total',v_order.total,'payment_status',v_order.payment_status,'reused',true); end if;
  select * into s from public.gift_settings where id = 1;
  if not s.enabled then return jsonb_build_object('ok',false,'error','DISABLED'); end if;
  if p_program not in ('marketplace','restaurant') or p_format not in ('virtual','physical') then return jsonb_build_object('ok',false,'error','BAD_PRODUCT'); end if;
  if p_program = 'marketplace' and not s.marketplace_enabled then return jsonb_build_object('ok',false,'error','PROGRAM_UNAVAILABLE'); end if;
  if p_program = 'restaurant' and not (s.restaurant_enabled and public.food_enabled()) then return jsonb_build_object('ok',false,'error','PROGRAM_UNAVAILABLE'); end if;
  if p_format = 'virtual' and not s.virtual_enabled then return jsonb_build_object('ok',false,'error','FORMAT_UNAVAILABLE'); end if;
  if p_format = 'physical' and not s.physical_enabled then return jsonb_build_object('ok',false,'error','FORMAT_UNAVAILABLE'); end if;
  if p_amount is null or p_amount <> round(p_amount,2) or p_amount < s.min_amount or p_amount > s.max_amount then return jsonb_build_object('ok',false,'error','BAD_AMOUNT','min',s.min_amount,'max',s.max_amount); end if;
  select * into t from public.gift_templates where slug = p_design->>'template' and active;
  if not found then return jsonb_build_object('ok',false,'error','BAD_TEMPLATE'); end if;
  if length(coalesce(p_design->>'recipient_name','')) > 60 or length(coalesce(p_design->>'sender_name','')) > 60 or length(coalesce(p_design->>'message','')) > 280 then
    return jsonb_build_object('ok',false,'error','TEXT_TOO_LONG'); end if;
  v_img := nullif(p_design->>'image_path','');
  if v_img is not null and (v_img !~ ('^' || v_uid::text || '/[A-Za-z0-9._-]{4,80}$')) then return jsonb_build_object('ok',false,'error','BAD_IMAGE'); end if;
  if p_recipient_email is not null and p_recipient_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok',false,'error','BAD_RECIPIENT'); end if;
  if p_recipient_phone is not null and p_recipient_phone !~ '^\+?[0-9 ]{7,16}$' then return jsonb_build_object('ok',false,'error','BAD_RECIPIENT'); end if;
  if p_deliver_at is not null and (p_format <> 'virtual' or p_deliver_at < now() - interval '5 minutes' or p_deliver_at > now() + interval '366 days') then return jsonb_build_object('ok',false,'error','BAD_SCHEDULE'); end if;
  if p_format = 'physical' then
    v_method := p_delivery->>'method';
    if v_method not in ('delivery','collection') then return jsonb_build_object('ok',false,'error','BAD_DELIVERY'); end if;
    if v_method = 'delivery' and not s.delivery_enabled then return jsonb_build_object('ok',false,'error','DELIVERY_UNAVAILABLE'); end if;
    if v_method = 'collection' and not s.collection_enabled then return jsonb_build_object('ok',false,'error','COLLECTION_UNAVAILABLE'); end if;
    if length(coalesce(p_delivery->>'name','')) < 2 or coalesce(p_delivery->>'phone','') !~ '^\+?[0-9 ]{7,16}$' or (v_method = 'delivery' and length(coalesce(p_delivery->>'address','')) < 6) then return jsonb_build_object('ok',false,'error','BAD_DELIVERY'); end if;
    v_fee := s.physical_fee + case when t.premium then s.premium_extra_fee else 0 end + case when p_envelope then s.envelope_fee else 0 end + case when v_method = 'delivery' then s.delivery_fee else 0 end;
    p_delivery := jsonb_build_object('method',v_method,'name',left(p_delivery->>'name',80),'phone',p_delivery->>'phone','address',left(coalesce(p_delivery->>'address',''),240),'notes',left(coalesce(p_delivery->>'notes',''),240));
  else p_delivery := null; p_envelope := false; end if;
  insert into public.gift_orders(purchaser_id,program,format,amount,fee_amount,total,design,recipient_email,recipient_phone,deliver_at,envelope,delivery,idempotency_key,fulfilment_status)
  values (v_uid,p_program,p_format,p_amount,v_fee,p_amount+v_fee,
    jsonb_build_object('template',t.slug,'accent',left(coalesce(p_design->>'accent',''),20),'recipient_name',btrim(coalesce(p_design->>'recipient_name','')),'sender_name',btrim(coalesce(p_design->>'sender_name','')),'message',btrim(coalesce(p_design->>'message','')),'image_path',v_img),
    nullif(btrim(p_recipient_email),''),nullif(btrim(p_recipient_phone),''),p_deliver_at,p_envelope,p_delivery,p_idem,null)
  returning * into v_order;
  perform public.gift_audit_log('order_created','gift_order',v_order.id::text,jsonb_build_object('program',p_program,'format',p_format,'total',v_order.total));
  return jsonb_build_object('ok',true,'order_id',v_order.id,'total',v_order.total,'amount',v_order.amount,'fee',v_order.fee_amount,'payment_status',v_order.payment_status);
end $$;

-- --------------------------------------------------- issue after payment
create or replace function public.gift_issue_for_order(p_order uuid) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare o public.gift_orders%rowtype; v_card uuid; v_status text;
begin
  select * into o from public.gift_orders where id = p_order for update;
  if not found or o.payment_status <> 'paid' then raise exception 'order not paid'; end if;
  if o.card_id is not null then return o.card_id; end if;
  v_status := case when o.format = 'physical' then 'pending_activation' else 'active' end;
  insert into public.gift_cards(code,share_token,program,format,initial_amount,balance,status,purchaser_id,order_id,template_slug,design,deliver_at,activated_at)
  values (public.gift_new_code(o.program), encode(gen_random_bytes(24),'hex'), o.program, o.format, o.amount, o.amount, v_status, o.purchaser_id, o.id, o.design->>'template', o.design, o.deliver_at, case when v_status = 'active' then now() end)
  returning id into v_card;
  insert into public.gift_ledger(card_id,kind,amount,balance_after,ref_type,ref_id,note) values (v_card,'issue',o.amount,o.amount,'gift_order',o.id,'Issued after verified payment');
  update public.gift_orders set card_id = v_card, fulfilment_status = case when o.format = 'physical' then 'queued' else null end, updated_at = now() where id = o.id;
  insert into public.gift_audit(actor_id,action,entity_type,entity_id,details) values (null,'card_issued','gift_card',v_card::text,jsonb_build_object('order',o.id,'amount',o.amount));
  return v_card;
end $$;
revoke all on function public.gift_issue_for_order(uuid) from public, anon, authenticated;

-- ------------------------------------------- payment webhook (service role)
create or replace function public.gift_process_payment(p_event_id text, p_event_type text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_eid text := left(trim(coalesce(p_event_id,'')),240); v_type text := lower(trim(coalesce(p_event_type,'')));
  v_oid text := p_payload->'metadata'->>'gift_order_id'; v_intent text := nullif(p_payload->>'payment_intent_id',''); v_ref text := nullif(p_payload->>'transaction_reference','');
  v_status text := lower(coalesce(p_payload->>'status','')); v_event uuid; o public.gift_orders%rowtype; v_amount numeric;
begin
  if v_eid = '' or jsonb_typeof(p_payload) <> 'object' then raise exception 'Invalid event'; end if;
  insert into public.gambasket_payment_events(provider,provider_event_id,event_type,signature_verified,payload,processing_status)
  values ('modempay',v_eid,v_type,true,p_payload,'received') on conflict (provider,provider_event_id) do nothing returning id into v_event;
  if v_event is null then return jsonb_build_object('success',true,'duplicate',true); end if;
  select * into o from public.gift_orders where (v_oid ~* '^[0-9a-f-]{36}$' and id = v_oid::uuid) or (v_intent is not null and provider_intent_id = v_intent) order by created_at desc limit 1 for update;
  if not found then
    update public.gambasket_payment_events set processing_status='ignored',processed_at=now(),processing_error='No matching gift order' where id = v_event;
    return jsonb_build_object('success',true,'ignored',true);
  end if;
  v_amount := nullif(p_payload->>'amount','')::numeric;
  if v_amount is null or round(v_amount,2) <> o.total or upper(coalesce(p_payload->>'currency','')) <> 'GMD' then
    update public.gambasket_payment_events set processing_status='failed',processed_at=now(),processing_error='Amount or currency mismatch' where id = v_event;
    insert into public.gift_audit(action,entity_type,entity_id,details) values ('payment_mismatch','gift_order',o.id::text,jsonb_build_object('expected',o.total,'got',v_amount));
    return jsonb_build_object('success',false,'error','PAYMENT_MISMATCH');
  end if;
  if v_type in ('charge.succeeded','payment.succeeded') or v_status in ('completed','succeeded') then
    if o.payment_status = 'paid' then
      update public.gambasket_payment_events set processing_status='processed',processed_at=now() where id = v_event;
      return jsonb_build_object('success',true,'already_paid',true);
    end if;
    update public.gift_orders set payment_status='paid', paid_at=now(), provider_reference=coalesce(v_ref,provider_reference), provider_intent_id=coalesce(v_intent,provider_intent_id), updated_at=now() where id = o.id;
    perform public.gift_issue_for_order(o.id);
  elsif v_type in ('charge.failed','payment.failed','charge.cancelled','payment.cancelled') or v_status in ('failed','cancelled') then
    if o.payment_status <> 'paid' then update public.gift_orders set payment_status = case when v_type like '%cancel%' or v_status='cancelled' then 'cancelled' else 'failed' end, updated_at=now() where id = o.id; end if;
  end if;
  update public.gambasket_payment_events set processing_status='processed',processed_at=now() where id = v_event;
  return jsonb_build_object('success',true,'order_id',o.id);
end $$;
revoke all on function public.gift_process_payment(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.gift_process_payment(text,text,jsonb) to service_role;

-- ----------------------------------------------- recipient / owner actions
create or replace function public.gift_public_view(p_token text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.gift_cards%rowtype; v_open boolean;
begin
  select * into c from public.gift_cards where share_token = p_token;
  if not found or c.status = 'pending_activation' and c.format = 'virtual' then return jsonb_build_object('ok',false,'error','NOT_FOUND'); end if;
  v_open := c.deliver_at is null or c.deliver_at <= now();
  if not v_open then return jsonb_build_object('ok',true,'scheduled',true,'deliver_at',c.deliver_at,'program',c.program,'template',c.template_slug,'accent',c.design->>'accent'); end if;
  return jsonb_build_object('ok',true,'scheduled',false,'program',c.program,'format',c.format,'status',c.status,'amount',c.initial_amount,'balance',c.balance,
    'design',c.design - 'image_path','image_path',c.design->>'image_path','ref_last4',right(c.code,4),'claimed',c.recipient_user_id is not null);
end $$;
grant execute on function public.gift_public_view(text) to anon, authenticated;

create or replace function public.gift_claim(p_token text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.gift_cards%rowtype; v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','AUTH_REQUIRED'); end if;
  select * into c from public.gift_cards where share_token = p_token for update;
  if not found then return jsonb_build_object('ok',false,'error','NOT_FOUND'); end if;
  if c.purchaser_id = v_uid or c.recipient_user_id = v_uid then return jsonb_build_object('ok',true,'card_id',c.id,'already',true); end if;
  if c.recipient_user_id is not null then return jsonb_build_object('ok',false,'error','ALREADY_CLAIMED'); end if;
  if c.deliver_at is not null and c.deliver_at > now() then return jsonb_build_object('ok',false,'error','NOT_YET'); end if;
  update public.gift_cards set recipient_user_id = v_uid where id = c.id;
  perform public.gift_audit_log('card_claimed','gift_card',c.id::text,'{}');
  return jsonb_build_object('ok',true,'card_id',c.id);
end $$;
grant execute on function public.gift_claim(text) to authenticated;

-- Issues a fresh 6-digit PIN. Only the plaintext return value ever contains it.
create or replace function public.gift_set_pin(p_card uuid) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare c public.gift_cards%rowtype; v_uid uuid := auth.uid(); v_pin text;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','AUTH_REQUIRED'); end if;
  select * into c from public.gift_cards where id = p_card for update;
  if not found or not coalesce(c.recipient_user_id = v_uid or (c.recipient_user_id is null and c.purchaser_id = v_uid), false) then return jsonb_build_object('ok',false,'error','NOT_FOUND'); end if;
  if c.status in ('cancelled','expired') then return jsonb_build_object('ok',false,'error','CARD_CLOSED'); end if;
  v_pin := lpad(((get_byte(gen_random_bytes(4),0)::bigint*16777216 + get_byte(gen_random_bytes(4),1)::bigint*65536 + get_byte(gen_random_bytes(4),2)::bigint*256 + get_byte(gen_random_bytes(4),3)) % 1000000)::text, 6, '0');
  update public.gift_cards set pin_hash = crypt(v_pin, gen_salt('bf', 8)), pin_failures = 0, locked_until = null where id = c.id;
  perform public.gift_audit_log('pin_reset','gift_card',c.id::text,'{}');
  return jsonb_build_object('ok',true,'pin',v_pin);
end $$;
grant execute on function public.gift_set_pin(uuid) to authenticated;

-- ------------------------------------------------ restaurant redemption
create or replace function public.gift_restaurant_eligible(p_restaurant uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.gift_restaurants g join public.restaurants r on r.id = g.restaurant_id
    where g.restaurant_id = p_restaurant and g.status = 'approved' and r.status = 'approved') and public.food_enabled()
    and (select restaurant_enabled and enabled from public.gift_settings where id = 1);
$$;
revoke all on function public.gift_restaurant_eligible(uuid) from public, anon, authenticated;

create or replace function public.gift_lookup(p_restaurant uuid, p_ref text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.gift_cards%rowtype; v_uid uuid := auth.uid(); v_ref text := upper(btrim(coalesce(p_ref,''))); v_tok text := lower(btrim(coalesce(p_ref,''))); v_found boolean;
begin
  if v_uid is null or not public.gift_can_staff(p_restaurant) then return jsonb_build_object('ok',false,'error','FORBIDDEN'); end if;
  if (select count(*) from public.gift_attempts where kind='lookup' and actor_id=v_uid and created_at > now() - interval '1 minute') >= 20
     or (select count(*) from public.gift_attempts where kind='lookup' and actor_id=v_uid and not ok and created_at > now() - interval '15 minutes') >= 8 then
    return jsonb_build_object('ok',false,'error','RATE_LIMITED'); end if;
  if v_tok ~ '^[0-9a-f]{48}$' then select * into c from public.gift_cards where share_token = v_tok;
  else select * into c from public.gift_cards where code = v_ref; end if;
  v_found := found;
  insert into public.gift_attempts(kind,actor_id,subject,ok) values ('lookup',v_uid,null,v_found);
  if not v_found or c.program <> 'restaurant' then return jsonb_build_object('ok',false,'error','NOT_FOUND'); end if;
  if not public.gift_restaurant_eligible(p_restaurant) then return jsonb_build_object('ok',false,'error','RESTAURANT_NOT_ENROLLED'); end if;
  return jsonb_build_object('ok',true,'card_id',c.id,'ref','JD-R-••••-••••-'||right(c.code,4),'balance',c.balance,'status',c.status,'usable',c.status in ('active','partially_redeemed') and (c.locked_until is null or c.locked_until < now()),'locked',c.locked_until is not null and c.locked_until > now(),'recipient_name',c.design->>'recipient_name');
end $$;
grant execute on function public.gift_lookup(uuid,text) to authenticated;

create or replace function public.gift_redeem(p_restaurant uuid, p_card uuid, p_pin text, p_amount numeric, p_idem text, p_bill numeric default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare c public.gift_cards%rowtype; s public.gift_settings%rowtype; v_uid uuid := auth.uid(); r public.gift_redemptions%rowtype; v_bal numeric(14,2); v_receipt text; v_id uuid;
begin
  if v_uid is null or not public.gift_can_staff(p_restaurant) then return jsonb_build_object('ok',false,'error','FORBIDDEN'); end if;
  if p_idem is null or length(p_idem) < 12 or length(p_idem) > 100 then return jsonb_build_object('ok',false,'error','BAD_IDEMPOTENCY'); end if;
  select * into r from public.gift_redemptions where restaurant_id = p_restaurant and idem_key = p_idem;
  if found then
    if r.card_id <> p_card or r.amount <> p_amount then return jsonb_build_object('ok',false,'error','IDEMPOTENCY_CONFLICT'); end if;
    return jsonb_build_object('ok',true,'duplicate',true,'redemption_id',r.id,'receipt_no',r.receipt_no,'amount',r.amount,'balance_after',r.balance_after);
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount,2) then return jsonb_build_object('ok',false,'error','BAD_AMOUNT'); end if;
  if not public.gift_restaurant_eligible(p_restaurant) then return jsonb_build_object('ok',false,'error','RESTAURANT_NOT_ENROLLED'); end if;
  select * into s from public.gift_settings where id = 1;
  select * into c from public.gift_cards where id = p_card for update;
  if not found or c.program <> 'restaurant' then return jsonb_build_object('ok',false,'error','NOT_FOUND'); end if;
  if c.locked_until is not null and c.locked_until > now() then return jsonb_build_object('ok',false,'error','LOCKED','until',c.locked_until); end if;
  if c.status not in ('active','partially_redeemed') then return jsonb_build_object('ok',false,'error','CARD_NOT_USABLE','status',c.status); end if;
  if c.pin_hash is null then return jsonb_build_object('ok',false,'error','PIN_NOT_SET'); end if;
  if p_pin is null or p_pin !~ '^[0-9]{6}$' or crypt(p_pin, c.pin_hash) <> c.pin_hash then
    update public.gift_cards set
      locked_until = case when pin_failures + 1 >= s.max_pin_failures then now() + make_interval(mins => s.lock_minutes) else locked_until end,
      pin_failures = case when pin_failures + 1 >= s.max_pin_failures then 0 else pin_failures + 1 end where id = c.id;
    insert into public.gift_attempts(kind,actor_id,subject,ok) values ('pin',v_uid,c.id::text,false);
    insert into public.gift_audit(actor_id,action,entity_type,entity_id,details) values (v_uid,'pin_failed','gift_card',c.id::text,jsonb_build_object('restaurant',p_restaurant));
    return jsonb_build_object('ok',false,'error','BAD_PIN');
  end if;
  if p_amount > c.balance then return jsonb_build_object('ok',false,'error','INSUFFICIENT_BALANCE','balance',c.balance); end if;
  if p_bill is not null and p_amount > p_bill then return jsonb_build_object('ok',false,'error','AMOUNT_EXCEEDS_BILL'); end if;
  v_bal := c.balance - p_amount;
  v_receipt := 'GR-' || to_char(now(),'YYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4),'hex'),1,6));
  insert into public.gift_redemptions(receipt_no,card_id,restaurant_id,amount,balance_after,card_ref,bill_total,staff_id,idem_key)
  values (v_receipt,c.id,p_restaurant,p_amount,v_bal,'••••'||right(c.code,4),p_bill,v_uid,p_idem) returning id into v_id;
  insert into public.gift_ledger(card_id,kind,amount,balance_after,ref_type,ref_id,actor_id,note) values (c.id,'redeem',-p_amount,v_bal,'gift_redemption',v_id,v_uid,'Redeemed at restaurant');
  insert into public.gift_merchant_credits(restaurant_id,redemption_id,kind,amount) values (p_restaurant,v_id,'redemption',p_amount);
  update public.gift_cards set balance = v_bal, pin_failures = 0, status = case when v_bal = 0 then 'fully_redeemed' else 'partially_redeemed' end where id = c.id;
  insert into public.gift_audit(actor_id,action,entity_type,entity_id,details) values (v_uid,'redeemed','gift_redemption',v_id::text,jsonb_build_object('card',c.id,'restaurant',p_restaurant,'amount',p_amount));
  return jsonb_build_object('ok',true,'redemption_id',v_id,'receipt_no',v_receipt,'amount',p_amount,'balance_after',v_bal);
end $$;
grant execute on function public.gift_redeem(uuid,uuid,text,numeric,text,numeric) to authenticated;

create or replace function public.gift_request_enrolment(p_restaurant uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.gift_is_owner_of_restaurant(p_restaurant) then return jsonb_build_object('ok',false,'error','FORBIDDEN'); end if;
  insert into public.gift_restaurants(restaurant_id) values (p_restaurant) on conflict (restaurant_id) do update set status = 'requested', requested_at = now() where public.gift_restaurants.status = 'rejected';
  perform public.gift_audit_log('enrolment_requested','restaurant',p_restaurant::text,'{}');
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.gift_request_enrolment(uuid) to authenticated;

create or replace function public.gift_set_staff(p_restaurant uuid, p_email text, p_add boolean) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if not public.gift_is_owner_of_restaurant(p_restaurant) then return jsonb_build_object('ok',false,'error','FORBIDDEN'); end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then return jsonb_build_object('ok',false,'error','USER_NOT_FOUND'); end if;
  if p_add then insert into public.gift_restaurant_staff(restaurant_id,user_id,added_by) values (p_restaurant,v_user,auth.uid()) on conflict do nothing;
  else delete from public.gift_restaurant_staff where restaurant_id = p_restaurant and user_id = v_user; end if;
  perform public.gift_audit_log(case when p_add then 'staff_added' else 'staff_removed' end,'restaurant',p_restaurant::text,jsonb_build_object('user',v_user));
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.gift_set_staff(uuid,text,boolean) to authenticated;

create or replace function public.gift_restaurant_summary(p_restaurant uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.gift_can_staff(p_restaurant) or public.gift_is_admin()) then return jsonb_build_object('ok',false,'error','FORBIDDEN'); end if;
  return jsonb_build_object('ok',true,
    'enrolment',(select status from public.gift_restaurants where restaurant_id = p_restaurant),
    'redemptions',(select count(*) from public.gift_redemptions where restaurant_id = p_restaurant and status = 'completed'),
    'redeemed_total',coalesce((select sum(amount) from public.gift_merchant_credits where restaurant_id = p_restaurant and kind='redemption'),0) + coalesce((select sum(amount) from public.gift_merchant_credits where restaurant_id = p_restaurant and kind='reversal'),0),
    'pending',coalesce((select sum(amount) from public.gift_merchant_credits where restaurant_id = p_restaurant and status in ('pending','in_settlement')),0),
    'settled',coalesce((select sum(amount) from public.gift_merchant_credits where restaurant_id = p_restaurant and status = 'settled'),0));
end $$;
grant execute on function public.gift_restaurant_summary(uuid) to authenticated;

-- ------------------------------------------------------------------ admin
create or replace function public.gift_admin_guard() returns void language plpgsql stable security definer set search_path = '' as $$
begin if not public.gift_is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if; end $$;
revoke all on function public.gift_admin_guard() from public, anon, authenticated;

create or replace function public.gift_admin_set_card_status(p_card uuid, p_status text, p_reason text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.gift_cards%rowtype; v_new text;
begin
  perform public.gift_admin_guard();
  if length(btrim(coalesce(p_reason,''))) < 5 then return jsonb_build_object('ok',false,'error','REASON_REQUIRED'); end if;
  select * into c from public.gift_cards where id = p_card for update;
  if not found then return jsonb_build_object('ok',false,'error','NOT_FOUND'); end if;
  if p_status = 'suspended' then
    if c.status not in ('active','partially_redeemed') then return jsonb_build_object('ok',false,'error','BAD_TRANSITION'); end if;
    update public.gift_cards set status = 'suspended' where id = c.id;
  elsif p_status = 'active' then
    if c.status <> 'suspended' then return jsonb_build_object('ok',false,'error','BAD_TRANSITION'); end if;
    v_new := case when c.balance = 0 then 'fully_redeemed' when c.balance < c.initial_amount then 'partially_redeemed' else 'active' end;
    update public.gift_cards set status = v_new where id = c.id;
  elsif p_status = 'cancelled' then
    if c.status = 'cancelled' then return jsonb_build_object('ok',false,'error','BAD_TRANSITION'); end if;
    if c.balance > 0 then insert into public.gift_ledger(card_id,kind,amount,balance_after,actor_id,note) values (c.id,'cancel',-c.balance,0,auth.uid(),p_reason); end if;
    update public.gift_cards set status = 'cancelled', balance = 0 where id = c.id;
  else return jsonb_build_object('ok',false,'error','BAD_STATUS'); end if;
  perform public.gift_audit_log('card_status','gift_card',c.id::text,jsonb_build_object('from',c.status,'to',p_status,'reason',p_reason,'balance_before',c.balance));
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.gift_admin_set_card_status(uuid,text,text) to authenticated;

create or replace function public.gift_admin_adjust(p_card uuid, p_delta numeric, p_reason text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.gift_cards%rowtype; v_bal numeric(14,2);
begin
  perform public.gift_admin_guard();
  if length(btrim(coalesce(p_reason,''))) < 10 then return jsonb_build_object('ok',false,'error','REASON_REQUIRED'); end if;
  if p_delta is null or p_delta = 0 or p_delta <> round(p_delta,2) then return jsonb_build_object('ok',false,'error','BAD_AMOUNT'); end if;
  select * into c from public.gift_cards where id = p_card for update;
  if not found or c.status in ('cancelled','expired') then return jsonb_build_object('ok',false,'error','NOT_FOUND'); end if;
  v_bal := c.balance + p_delta;
  if v_bal < 0 or v_bal > c.initial_amount then return jsonb_build_object('ok',false,'error','OUT_OF_RANGE'); end if;
  insert into public.gift_ledger(card_id,kind,amount,balance_after,actor_id,note) values (c.id,'adjustment',p_delta,v_bal,auth.uid(),p_reason);
  update public.gift_cards set balance = v_bal, status = case when c.status = 'suspended' then 'suspended' when v_bal = 0 then 'fully_redeemed' when v_bal < c.initial_amount then 'partially_redeemed' else 'active' end where id = c.id;
  perform public.gift_audit_log('card_adjusted','gift_card',c.id::text,jsonb_build_object('delta',p_delta,'reason',p_reason,'balance_after',v_bal));
  return jsonb_build_object('ok',true,'balance',v_bal);
end $$;
grant execute on function public.gift_admin_adjust(uuid,numeric,text) to authenticated;

create or replace function public.gift_admin_reverse_redemption(p_redemption uuid, p_reason text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.gift_redemptions%rowtype; c public.gift_cards%rowtype; v_bal numeric(14,2);
begin
  perform public.gift_admin_guard();
  if length(btrim(coalesce(p_reason,''))) < 5 then return jsonb_build_object('ok',false,'error','REASON_REQUIRED'); end if;
  select * into r from public.gift_redemptions where id = p_redemption for update;
  if not found then return jsonb_build_object('ok',false,'error','NOT_FOUND'); end if;
  if r.status = 'reversed' then return jsonb_build_object('ok',false,'error','ALREADY_REVERSED'); end if;
  select * into c from public.gift_cards where id = r.card_id for update;
  if c.status = 'cancelled' then return jsonb_build_object('ok',false,'error','CARD_CANCELLED'); end if;
  v_bal := c.balance + r.amount;
  insert into public.gift_ledger(card_id,kind,amount,balance_after,ref_type,ref_id,actor_id,note) values (c.id,'reversal',r.amount,v_bal,'gift_redemption',r.id,auth.uid(),p_reason);
  insert into public.gift_merchant_credits(restaurant_id,redemption_id,kind,amount) values (r.restaurant_id,r.id,'reversal',-r.amount);
  update public.gift_redemptions set status = 'reversed', reversed_at = now(), reverse_reason = p_reason where id = r.id;
  update public.gift_cards set balance = v_bal, status = case when c.status = 'suspended' then 'suspended' when v_bal < c.initial_amount then 'partially_redeemed' else 'active' end where id = c.id;
  perform public.gift_audit_log('redemption_reversed','gift_redemption',r.id::text,jsonb_build_object('reason',p_reason,'amount',r.amount));
  return jsonb_build_object('ok',true,'balance',v_bal);
end $$;
grant execute on function public.gift_admin_reverse_redemption(uuid,text) to authenticated;

create or replace function public.gift_admin_set_restaurant(p_restaurant uuid, p_status text) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.gift_admin_guard();
  if p_status not in ('approved','suspended','rejected') then return jsonb_build_object('ok',false,'error','BAD_STATUS'); end if;
  update public.gift_restaurants set status = p_status, decided_at = now(), decided_by = auth.uid() where restaurant_id = p_restaurant;
  if not found then return jsonb_build_object('ok',false,'error','NOT_FOUND'); end if;
  perform public.gift_audit_log('restaurant_'||p_status,'restaurant',p_restaurant::text,'{}');
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.gift_admin_set_restaurant(uuid,text) to authenticated;

create or replace function public.gift_admin_create_settlement(p_restaurant uuid, p_reference text default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_total numeric(14,2); v_id uuid;
begin
  perform public.gift_admin_guard();
  perform 1 from public.gift_merchant_credits where restaurant_id = p_restaurant and status = 'pending' for update;
  select coalesce(sum(amount),0) into v_total from public.gift_merchant_credits where restaurant_id = p_restaurant and status = 'pending';
  if v_total <= 0 then return jsonb_build_object('ok',false,'error','NOTHING_TO_SETTLE'); end if;
  insert into public.gift_settlements(restaurant_id,total,reference,created_by) values (p_restaurant,v_total,nullif(btrim(p_reference),''),auth.uid()) returning id into v_id;
  update public.gift_merchant_credits set status = 'in_settlement', settlement_id = v_id where restaurant_id = p_restaurant and status = 'pending';
  perform public.gift_audit_log('settlement_created','gift_settlement',v_id::text,jsonb_build_object('total',v_total,'restaurant',p_restaurant));
  return jsonb_build_object('ok',true,'settlement_id',v_id,'total',v_total);
end $$;
grant execute on function public.gift_admin_create_settlement(uuid,text) to authenticated;

create or replace function public.gift_admin_resolve_settlement(p_settlement uuid, p_paid boolean, p_reference text default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare st public.gift_settlements%rowtype;
begin
  perform public.gift_admin_guard();
  select * into st from public.gift_settlements where id = p_settlement for update;
  if not found or st.status <> 'pending_payment' then return jsonb_build_object('ok',false,'error','BAD_TRANSITION'); end if;
  if p_paid then
    update public.gift_settlements set status = 'paid', paid_at = now(), reference = coalesce(nullif(btrim(p_reference),''), reference) where id = st.id;
    update public.gift_merchant_credits set status = 'settled' where settlement_id = st.id;
  else
    update public.gift_settlements set status = 'cancelled' where id = st.id;
    update public.gift_merchant_credits set status = 'pending', settlement_id = null where settlement_id = st.id;
  end if;
  perform public.gift_audit_log(case when p_paid then 'settlement_paid' else 'settlement_cancelled' end,'gift_settlement',st.id::text,jsonb_build_object('reference',p_reference));
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.gift_admin_resolve_settlement(uuid,boolean,text) to authenticated;

create or replace function public.gift_admin_set_fulfilment(p_order uuid, p_status text, p_note text default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.gift_orders%rowtype;
begin
  perform public.gift_admin_guard();
  if p_status not in ('queued','printing','ready','shipped','delivered','cancelled') then return jsonb_build_object('ok',false,'error','BAD_STATUS'); end if;
  select * into o from public.gift_orders where id = p_order for update;
  if not found or o.format <> 'physical' or o.payment_status <> 'paid' then return jsonb_build_object('ok',false,'error','NOT_FOUND'); end if;
  update public.gift_orders set fulfilment_status = p_status, fulfilment_note = p_note, updated_at = now() where id = o.id;
  if p_status = 'delivered' then update public.gift_cards set status = 'active', activated_at = now() where id = o.card_id and status = 'pending_activation'; end if;
  perform public.gift_audit_log('fulfilment','gift_order',o.id::text,jsonb_build_object('status',p_status,'note',p_note));
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.gift_admin_set_fulfilment(uuid,text,text) to authenticated;

create or replace function public.gift_admin_update_settings(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.gift_admin_guard();
  update public.gift_settings set
    enabled = coalesce((p->>'enabled')::boolean, enabled), marketplace_enabled = coalesce((p->>'marketplace_enabled')::boolean, marketplace_enabled),
    restaurant_enabled = coalesce((p->>'restaurant_enabled')::boolean, restaurant_enabled), virtual_enabled = coalesce((p->>'virtual_enabled')::boolean, virtual_enabled),
    physical_enabled = coalesce((p->>'physical_enabled')::boolean, physical_enabled), collection_enabled = coalesce((p->>'collection_enabled')::boolean, collection_enabled),
    delivery_enabled = coalesce((p->>'delivery_enabled')::boolean, delivery_enabled), min_amount = coalesce((p->>'min_amount')::numeric, min_amount), max_amount = coalesce((p->>'max_amount')::numeric, max_amount),
    physical_fee = coalesce((p->>'physical_fee')::numeric, physical_fee), premium_extra_fee = coalesce((p->>'premium_extra_fee')::numeric, premium_extra_fee),
    envelope_fee = coalesce((p->>'envelope_fee')::numeric, envelope_fee), delivery_fee = coalesce((p->>'delivery_fee')::numeric, delivery_fee),
    collection_note = coalesce(p->>'collection_note', collection_note), updated_at = now() where id = 1;
  perform public.gift_audit_log('settings_updated','gift_settings','1',p);
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.gift_admin_update_settings(jsonb) to authenticated;

create or replace function public.gift_admin_set_template(p_slug text, p_active boolean) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.gift_admin_guard();
  update public.gift_templates set active = p_active where slug = p_slug;
  perform public.gift_audit_log('template_toggled','gift_template',p_slug,jsonb_build_object('active',p_active));
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.gift_admin_set_template(text,boolean) to authenticated;

-- ----------------------------------------------------------- RLS + grants
do $$ declare t text; begin
  foreach t in array array['gift_settings','gift_templates','gift_orders','gift_cards','gift_ledger','gift_audit','gift_restaurants','gift_restaurant_staff','gift_settlements','gift_redemptions','gift_merchant_credits','gift_attempts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on sequence public.gift_ledger_id_seq, public.gift_audit_id_seq, public.gift_attempts_id_seq from anon, authenticated;

grant select on public.gift_settings, public.gift_templates to anon, authenticated;
grant select on public.gift_orders, public.gift_ledger, public.gift_audit, public.gift_restaurants, public.gift_restaurant_staff, public.gift_settlements, public.gift_redemptions, public.gift_merchant_credits to authenticated;
grant select (id,code,share_token,program,format,initial_amount,balance,status,purchaser_id,recipient_user_id,order_id,template_slug,design,deliver_at,activated_at,created_at,locked_until) on public.gift_cards to authenticated;

drop policy if exists gs_read on public.gift_settings; create policy gs_read on public.gift_settings for select to anon, authenticated using (true);
drop policy if exists gt_read on public.gift_templates; create policy gt_read on public.gift_templates for select to anon, authenticated using (active or public.gift_is_admin());
drop policy if exists go_read on public.gift_orders; create policy go_read on public.gift_orders for select to authenticated using (purchaser_id = auth.uid() or public.gift_is_admin());
drop policy if exists gc_read on public.gift_cards; create policy gc_read on public.gift_cards for select to authenticated using (purchaser_id = auth.uid() or recipient_user_id = auth.uid() or public.gift_is_admin());
drop policy if exists gl_read on public.gift_ledger; create policy gl_read on public.gift_ledger for select to authenticated using (public.gift_owns_card(card_id) or public.gift_is_admin());
drop policy if exists ga_read on public.gift_audit; create policy ga_read on public.gift_audit for select to authenticated using (public.gift_is_admin());
drop policy if exists gr_read on public.gift_restaurants; create policy gr_read on public.gift_restaurants for select to authenticated using (public.gift_can_staff(restaurant_id) or public.gift_is_admin());
drop policy if exists gst_read on public.gift_restaurant_staff; create policy gst_read on public.gift_restaurant_staff for select to authenticated using (public.gift_is_owner_of_restaurant(restaurant_id) or user_id = auth.uid() or public.gift_is_admin());
drop policy if exists gse_read on public.gift_settlements; create policy gse_read on public.gift_settlements for select to authenticated using (public.gift_can_staff(restaurant_id) or public.gift_is_admin());
drop policy if exists gre_read on public.gift_redemptions; create policy gre_read on public.gift_redemptions for select to authenticated using (public.gift_can_staff(restaurant_id) or public.gift_is_admin());
drop policy if exists gmc_read on public.gift_merchant_credits; create policy gmc_read on public.gift_merchant_credits for select to authenticated using (public.gift_can_staff(restaurant_id) or public.gift_is_admin());

-- ----------------------------------------------------------- template seed
insert into public.gift_templates(slug,category,name,premium,sort) values
 ('birthday-confetti','Birthday','Confetti Party',false,10),('birthday-balloons','Birthday','Balloon Sky',false,11),('birthday-gold','Birthday','Golden Birthday',true,12),
 ('love-bloom','Love & Anniversary','Rose Bloom',false,20),('love-hearts','Love & Anniversary','Floating Hearts',false,21),('anniv-noir','Love & Anniversary','Anniversary Noir',true,22),
 ('valentine-ruby','Valentine''s Day','Ruby Valentine',false,30),('valentine-blush','Valentine''s Day','Blush Letter',false,31),
 ('xmas-snow','Christmas','Snowfall',false,40),('xmas-tree','Christmas','Evergreen',false,41),('xmas-gold','Christmas','Gold & Berry',true,42),
 ('eid-lantern','Eid & Festive','Lantern Night',false,50),('eid-crescent','Eid & Festive','Crescent Gold',true,51),('festive-kente','Eid & Festive','Festive Weave',false,52),
 ('congrats-burst','Congratulations','Burst of Joy',false,60),('congrats-laurel','Congratulations','Laurel',true,61),
 ('grad-cap','Graduation','Cap & Gown',false,70),('grad-scroll','Graduation','Scroll Honours',true,71),
 ('thanks-petals','Thank You','Petal Thanks',false,80),('thanks-warm','Thank You','Warm Sunrise',false,81),
 ('wedding-ivory','Wedding','Ivory Lace',true,90),('wedding-garden','Wedding','Garden Vows',false,91),
 ('baby-clouds','New Baby','Soft Clouds',false,100),('baby-stars','New Baby','Little Stars',false,101),
 ('well-sunny','Get Well Soon','Sunny Side',false,110),('well-calm','Get Well Soon','Calm Waters',false,111),
 ('appreciate-ribbon','Appreciation','Ribbon of Thanks',false,120),('appreciate-mosaic','Appreciation','Mosaic',false,121),
 ('justbecause-waves','Just Because','Playful Waves',false,130),('justbecause-pop','Just Because','Pop Art',false,131),
 ('corp-slate','Corporate','Slate Executive',true,140),('corp-blue','Corporate','JulaDirect Blue',false,141),
 ('lux-obsidian','Minimalist & Luxury','Obsidian',true,150),('lux-pearl','Minimalist & Luxury','Pearl',true,151),('min-paper','Minimalist & Luxury','Paper White',false,152),
 ('photo-custom','Your Photo','Your Photo',true,160)
on conflict (slug) do nothing;

-- ----------------------------------------------------------- media bucket
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('gift-media','gift-media',true,4194304,array['image/jpeg','image/png','image/webp']) on conflict (id) do nothing;
    drop policy if exists gift_media_write on storage.objects;
    create policy gift_media_write on storage.objects for insert to authenticated with check (bucket_id = 'gift-media' and (storage.foldername(name))[1] = auth.uid()::text);
    drop policy if exists gift_media_delete on storage.objects;
    create policy gift_media_delete on storage.objects for delete to authenticated using (bucket_id = 'gift-media' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;
commit;
