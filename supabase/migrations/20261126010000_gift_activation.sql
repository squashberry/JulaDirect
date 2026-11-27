-- JulaDirect gift cards, phase 3: physical cards are activated by their holder
-- (card number or QR + one-time scratch-off code), who then sets a 4-6 digit transaction passcode.
-- Holders can change the passcode and freeze/unfreeze any card they own. Requires phases 1 and 2.
begin;

-- scratch codes: only a hash lives on the card; the plaintext sits in a one-time print table for the admin
create table if not exists public.gift_activation_secrets (
  card_id uuid primary key references public.gift_cards(id) on delete cascade,
  code text not null, created_at timestamptz not null default now()
);
alter table public.gift_activation_secrets enable row level security;
revoke all on public.gift_activation_secrets from anon, authenticated;

create or replace function public.gift_new_scratch_code() returns text language plpgsql volatile security definer set search_path = public, extensions as $$
declare alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea := gen_random_bytes(10); s text := ''; i int;
begin
  for i in 0..9 loop s := s || substr(alpha, (get_byte(b,i) % 32) + 1, 1); end loop;
  return s;
end $$;
revoke all on function public.gift_new_scratch_code() from public, anon, authenticated;

create or replace function public.gift_physical_card_created() returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  if new.format = 'physical' and new.status = 'pending_activation' and new.activation_hash is null then
    v := public.gift_new_scratch_code();
    update public.gift_cards set activation_hash = crypt(v, gen_salt('bf', 8)) where id = new.id;
    insert into public.gift_activation_secrets(card_id, code) values (new.id, v);
  end if;
  return new;
end $$;
drop trigger if exists gift_cards_scratch on public.gift_cards;
create trigger gift_cards_scratch after insert on public.gift_cards for each row execute function public.gift_physical_card_created();

-- Admin prints the code under the scratch panel. Shown once; afterwards only the hash remains.
create or replace function public.gift_admin_reveal_scratch_code(p_card uuid) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare c public.gift_cards%rowtype; v text;
begin
  perform public.gift_admin_guard();
  select * into c from public.gift_cards where id = p_card for update;
  if not found or c.format <> 'physical' then return jsonb_build_object('ok',false,'error','NOT_FOUND'); end if;
  if c.status <> 'pending_activation' then return jsonb_build_object('ok',false,'error','ALREADY_ACTIVE'); end if;
  select code into v from public.gift_activation_secrets where card_id = c.id;
  if v is null then return jsonb_build_object('ok',false,'error','ALREADY_REVEALED'); end if;
  delete from public.gift_activation_secrets where card_id = c.id;
  perform public.gift_audit_log('scratch_code_revealed','gift_card',c.id::text,'{}');
  return jsonb_build_object('ok',true,'code',v,'card_number',c.code);
end $$;
revoke all on function public.gift_admin_reveal_scratch_code(uuid) from public, anon;
grant execute on function public.gift_admin_reveal_scratch_code(uuid) to authenticated;

-- A misprinted or damaged card: issue a new scratch code (old one stops working).
create or replace function public.gift_admin_regenerate_scratch_code(p_card uuid, p_reason text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare c public.gift_cards%rowtype; v text;
begin
  perform public.gift_admin_guard();
  if length(btrim(coalesce(p_reason,''))) < 5 then return jsonb_build_object('ok',false,'error','REASON_REQUIRED'); end if;
  select * into c from public.gift_cards where id = p_card for update;
  if not found or c.format <> 'physical' or c.status <> 'pending_activation' then return jsonb_build_object('ok',false,'error','NOT_FOUND'); end if;
  v := public.gift_new_scratch_code();
  update public.gift_cards set activation_hash = crypt(v, gen_salt('bf', 8)), activation_failures = 0, activation_locked_until = null where id = c.id;
  insert into public.gift_activation_secrets(card_id, code) values (c.id, v) on conflict (card_id) do update set code = excluded.code, created_at = now();
  perform public.gift_audit_log('scratch_code_regenerated','gift_card',c.id::text,jsonb_build_object('reason',p_reason));
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.gift_admin_regenerate_scratch_code(uuid,text) from public, anon;
grant execute on function public.gift_admin_regenerate_scratch_code(uuid,text) to authenticated;

-- ------------------------------------------------------------------ passcode rules
create or replace function public.gift_passcode_weak(p text) returns boolean language sql immutable set search_path = '' as $$
  select p !~ '^[0-9]{4,6}$'
    or p ~ '^(.)\1+$'                                        -- 0000, 111111
    or position(p in '01234567890') > 0                     -- 1234, 345678
    or position(p in '09876543210') > 0                     -- 4321, 987654
    or p ~ '^(..)\1+$' or p ~ '^(...)\1$'                   -- 1212, 123123
    or p in ('2580','1004','2000','2001','1990','1999','2020','2021','2022','2023','2024','2025','2026','5683','1313','6969','4200','696969','112233','121212','159753','654321','123321')
$$;
revoke all on function public.gift_passcode_weak(text) from public, anon, authenticated;

-- ------------------------------------------------------------------ activation
-- What the holder sees after typing or scanning the card: just enough to confirm it is theirs.
create or replace function public.gift_activation_check(p_ref text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.gift_cards%rowtype; v_uid uuid := auth.uid(); v_ref text := upper(regexp_replace(coalesce(p_ref,''),'[^A-Za-z0-9]','','g')); v_tok text := lower(btrim(coalesce(p_ref,''))); v_found boolean; o public.gift_orders%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','AUTH_REQUIRED'); end if;
  if (select count(*) from public.gift_attempts where kind='activate_check' and actor_id=v_uid and created_at > now() - interval '1 minute') >= 15
     or (select count(*) from public.gift_attempts where kind='activate_check' and actor_id=v_uid and not ok and created_at > now() - interval '15 minutes') >= 8 then
    return jsonb_build_object('ok',false,'error','RATE_LIMITED'); end if;
  if v_tok ~ '^[0-9a-f]{48}$' then select * into c from public.gift_cards where share_token = v_tok;
  elsif v_tok ~ '^https?://' and v_tok ~ '[?&]t=[0-9a-f]{48}' then select * into c from public.gift_cards where share_token = substring(v_tok from '[?&]t=([0-9a-f]{48})');
  else select * into c from public.gift_cards where replace(code,'-','') = v_ref; end if;
  v_found := found and c.format = 'physical';
  insert into public.gift_attempts(kind,actor_id,subject,ok) values ('activate_check',v_uid,null,v_found);
  if not v_found then return jsonb_build_object('ok',false,'error','NOT_FOUND'); end if;
  if c.status <> 'pending_activation' then return jsonb_build_object('ok',false,'error','ALREADY_ACTIVE'); end if;
  select * into o from public.gift_orders where id = c.order_id;
  return jsonb_build_object('ok',true,'card_id',c.id,'program',c.program,'amount',c.initial_amount,'design',c.design,'ready',coalesce(o.fulfilment_status in ('ready','shipped','delivered'),false),'number_last4',right(c.code,4));
end $$;
revoke all on function public.gift_activation_check(text) from public, anon;
grant execute on function public.gift_activation_check(text) to authenticated;

create or replace function public.gift_activate_card(p_card uuid, p_scratch text, p_passcode text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare c public.gift_cards%rowtype; o public.gift_orders%rowtype; s public.gift_settings%rowtype; v_uid uuid := auth.uid(); v_code text := upper(regexp_replace(coalesce(p_scratch,''),'[^A-Za-z0-9]','','g'));
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','AUTH_REQUIRED'); end if;
  if (select count(*) from public.gift_attempts where kind='activate' and actor_id=v_uid and not ok and created_at > now() - interval '15 minutes') >= 6 then
    return jsonb_build_object('ok',false,'error','RATE_LIMITED'); end if;
  if public.gift_passcode_weak(p_passcode) then return jsonb_build_object('ok',false,'error','WEAK_PASSCODE'); end if;
  select * into s from public.gift_settings where id = 1;
  select * into c from public.gift_cards where id = p_card for update;
  if not found or c.format <> 'physical' then return jsonb_build_object('ok',false,'error','NOT_FOUND'); end if;
  if c.status <> 'pending_activation' then return jsonb_build_object('ok',false,'error','ALREADY_ACTIVE'); end if;
  if c.activation_locked_until is not null and c.activation_locked_until > now() then return jsonb_build_object('ok',false,'error','LOCKED','until',c.activation_locked_until); end if;
  select * into o from public.gift_orders where id = c.order_id;
  if o.payment_status <> 'paid' or coalesce(o.fulfilment_status,'') not in ('ready','shipped','delivered') then return jsonb_build_object('ok',false,'error','NOT_READY'); end if;
  if c.activation_hash is null or length(v_code) <> 10 or crypt(v_code, c.activation_hash) <> c.activation_hash then
    update public.gift_cards set
      activation_locked_until = case when activation_failures + 1 >= s.max_pin_failures then now() + make_interval(mins => s.lock_minutes) else activation_locked_until end,
      activation_failures = case when activation_failures + 1 >= s.max_pin_failures then 0 else activation_failures + 1 end where id = c.id;
    insert into public.gift_attempts(kind,actor_id,subject,ok) values ('activate',v_uid,null,false);
    perform public.gift_audit_log('activation_failed','gift_card',c.id::text,'{}');
    return jsonb_build_object('ok',false,'error','BAD_SCRATCH_CODE');
  end if;
  update public.gift_cards set status = 'active', activated_at = now(), activated_by = v_uid, recipient_user_id = v_uid, activation_hash = null, activation_failures = 0, activation_locked_until = null,
    pin_hash = crypt(p_passcode, gen_salt('bf', 8)), pin_failures = 0, locked_until = null where id = c.id;
  delete from public.gift_activation_secrets where card_id = c.id;
  insert into public.gift_attempts(kind,actor_id,subject,ok) values ('activate',v_uid,null,true);
  perform public.gift_audit_log('card_activated','gift_card',c.id::text,jsonb_build_object('by',v_uid));
  return jsonb_build_object('ok',true,'card_id',c.id,'balance',c.balance);
end $$;
revoke all on function public.gift_activate_card(uuid,text,text) from public, anon;
grant execute on function public.gift_activate_card(uuid,text,text) to authenticated;

-- ------------------------------------------------------------------ owner controls (any card the caller owns)
create or replace function public.gift_set_passcode(p_card uuid, p_passcode text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare c public.gift_cards%rowtype; v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','AUTH_REQUIRED'); end if;
  if public.gift_passcode_weak(p_passcode) then return jsonb_build_object('ok',false,'error','WEAK_PASSCODE'); end if;
  select * into c from public.gift_cards where id = p_card for update;
  if not found or not coalesce(c.recipient_user_id = v_uid or (c.recipient_user_id is null and c.purchaser_id = v_uid), false) then return jsonb_build_object('ok',false,'error','NOT_FOUND'); end if;
  if c.status not in ('active','partially_redeemed','suspended') then return jsonb_build_object('ok',false,'error','CARD_CLOSED'); end if;
  update public.gift_cards set pin_hash = crypt(p_passcode, gen_salt('bf', 8)), pin_failures = 0, locked_until = null where id = c.id;
  perform public.gift_audit_log('passcode_changed','gift_card',c.id::text,'{}');
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.gift_set_passcode(uuid,text) from public, anon;
grant execute on function public.gift_set_passcode(uuid,text) to authenticated;

create or replace function public.gift_set_frozen(p_card uuid, p_frozen boolean) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.gift_cards%rowtype; v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','AUTH_REQUIRED'); end if;
  select * into c from public.gift_cards where id = p_card for update;
  if not found or not coalesce(c.recipient_user_id = v_uid or (c.recipient_user_id is null and c.purchaser_id = v_uid), false) then return jsonb_build_object('ok',false,'error','NOT_FOUND'); end if;
  if c.status in ('cancelled','expired','pending_activation') then return jsonb_build_object('ok',false,'error','CARD_CLOSED'); end if;
  update public.gift_cards set frozen_at = case when p_frozen then coalesce(frozen_at, now()) else null end where id = c.id;
  perform public.gift_audit_log(case when p_frozen then 'card_frozen' else 'card_unfrozen' end,'gift_card',c.id::text,'{}');
  return jsonb_build_object('ok',true,'frozen',p_frozen);
end $$;
revoke all on function public.gift_set_frozen(uuid,boolean) from public, anon;
grant execute on function public.gift_set_frozen(uuid,boolean) to authenticated;

commit;
