-- JulaDirect gift cards, phase 2: staff list, refunds, recipient inbox/notification, restaurant payout methods.
-- Requires 20261125000000_gift_cards.sql.
begin;

-- ============================================================ staff list
create or replace function public.gift_list_staff(p_restaurant uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.gift_is_owner_of_restaurant(p_restaurant) and not public.gift_is_admin() then return jsonb_build_object('ok',false,'error','FORBIDDEN'); end if;
  return jsonb_build_object('ok',true,'staff',coalesce((select jsonb_agg(jsonb_build_object('user_id',s.user_id,'email',u.email,'added_at',s.created_at) order by s.created_at)
    from public.gift_restaurant_staff s join auth.users u on u.id = s.user_id where s.restaurant_id = p_restaurant),'[]'::jsonb));
end $$;
revoke all on function public.gift_list_staff(uuid) from public, anon;
grant execute on function public.gift_list_staff(uuid) to authenticated;

-- ============================================================ refunds of unspent value
create table if not exists public.gift_refunds (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null unique references public.gift_cards(id) on delete restrict,
  order_id uuid not null references public.gift_orders(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  reason text not null,
  status text not null default 'approved' check (status in ('approved','provider_pending','succeeded','failed')),
  method text check (method in ('modempay','manual')),
  reference text, error text,
  requested_by uuid, created_at timestamptz not null default now(), resolved_at timestamptz
);
alter table public.gift_refunds enable row level security;
revoke all on public.gift_refunds from anon, authenticated;
grant select on public.gift_refunds to authenticated;
drop policy if exists gift_refunds_read on public.gift_refunds;
create policy gift_refunds_read on public.gift_refunds for select to authenticated using (public.gift_is_admin() or exists (select 1 from public.gift_orders o where o.id = gift_refunds.order_id and o.purchaser_id = auth.uid()));

-- Cancels the card (ledger entry) and queues a refund of what was NOT spent. Fees are never refunded here.
create or replace function public.gift_admin_refund_card(p_card uuid, p_reason text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.gift_cards%rowtype; o public.gift_orders%rowtype; v_amt numeric(14,2); v_id uuid;
begin
  perform public.gift_admin_guard();
  if length(btrim(coalesce(p_reason,''))) < 5 then return jsonb_build_object('ok',false,'error','REASON_REQUIRED'); end if;
  select * into c from public.gift_cards where id = p_card for update;
  if not found then return jsonb_build_object('ok',false,'error','NOT_FOUND'); end if;
  select * into o from public.gift_orders where id = c.order_id for update;
  if o.payment_status <> 'paid' or o.provider_reference is null then return jsonb_build_object('ok',false,'error','NOT_REFUNDABLE'); end if;
  if exists (select 1 from public.gift_refunds where card_id = c.id) then return jsonb_build_object('ok',false,'error','ALREADY_REFUNDED'); end if;
  v_amt := c.balance;
  if v_amt <= 0 then return jsonb_build_object('ok',false,'error','NOTHING_TO_REFUND'); end if;
  insert into public.gift_ledger(card_id,kind,amount,balance_after,actor_id,note) values (c.id,'cancel',-v_amt,0,auth.uid(),'Refund: '||p_reason);
  update public.gift_cards set status = 'cancelled', balance = 0 where id = c.id;
  insert into public.gift_refunds(card_id,order_id,amount,reason,requested_by) values (c.id,o.id,v_amt,p_reason,auth.uid()) returning id into v_id;
  perform public.gift_audit_log('refund_queued','gift_card',c.id::text,jsonb_build_object('refund_id',v_id,'amount',v_amt,'reason',p_reason));
  return jsonb_build_object('ok',true,'refund_id',v_id,'amount',v_amt);
end $$;
revoke all on function public.gift_admin_refund_card(uuid,text) from public, anon;
grant execute on function public.gift_admin_refund_card(uuid,text) to authenticated;

create or replace function public.gift_refund_begin(p_refund uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.gift_refunds%rowtype; o public.gift_orders%rowtype;
begin
  select * into r from public.gift_refunds where id = p_refund for update;
  if not found then return jsonb_build_object('ok',false,'error','NOT_FOUND'); end if;
  if r.status not in ('approved','failed') then return jsonb_build_object('ok',false,'error','BAD_TRANSITION','status',r.status); end if;
  select * into o from public.gift_orders where id = r.order_id;
  update public.gift_refunds set status = 'provider_pending', method = 'modempay', error = null where id = r.id;
  return jsonb_build_object('ok',true,'amount',r.amount,'provider_reference',o.provider_reference);
end $$;
revoke all on function public.gift_refund_begin(uuid) from public, anon, authenticated;
grant execute on function public.gift_refund_begin(uuid) to service_role;

create or replace function public.gift_refund_finish(p_refund uuid, p_ok boolean, p_note text default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.gift_refunds%rowtype;
begin
  select * into r from public.gift_refunds where id = p_refund for update;
  if not found or r.status <> 'provider_pending' then return jsonb_build_object('ok',false,'error','BAD_TRANSITION'); end if;
  if p_ok then update public.gift_refunds set status = 'succeeded', resolved_at = now(), reference = left(coalesce(p_note,reference),200) where id = r.id;
  else update public.gift_refunds set status = 'failed', error = left(coalesce(p_note,'Provider rejected the refund'),400) where id = r.id; end if;
  insert into public.gift_audit(actor_id,action,entity_type,entity_id,details) values (null, case when p_ok then 'refund_succeeded' else 'refund_failed' end,'gift_refund',r.id::text,jsonb_build_object('note',p_note));
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.gift_refund_finish(uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.gift_refund_finish(uuid,boolean,text) to service_role;

-- Admin confirms they refunded the buyer outside the system (or reconciles an uncertain provider result).
create or replace function public.gift_admin_refund_manual(p_refund uuid, p_reference text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.gift_refunds%rowtype;
begin
  perform public.gift_admin_guard();
  if length(btrim(coalesce(p_reference,''))) < 3 then return jsonb_build_object('ok',false,'error','REFERENCE_REQUIRED'); end if;
  select * into r from public.gift_refunds where id = p_refund for update;
  if not found or r.status = 'succeeded' then return jsonb_build_object('ok',false,'error','BAD_TRANSITION'); end if;
  update public.gift_refunds set status = 'succeeded', method = coalesce(method,'manual'), reference = btrim(p_reference), resolved_at = now() where id = r.id;
  perform public.gift_audit_log('refund_manual','gift_refund',r.id::text,jsonb_build_object('reference',p_reference,'previous',r.status));
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.gift_admin_refund_manual(uuid,text) from public, anon;
grant execute on function public.gift_admin_refund_manual(uuid,text) to authenticated;

-- ============================================================ recipient inbox (cards addressed to my verified email)
create or replace function public.gift_inbox() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_email text;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','AUTH'); end if;
  select lower(email) into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then return jsonb_build_object('ok',true,'cards','[]'::jsonb); end if;
  return jsonb_build_object('ok',true,'cards',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'share_token',c.share_token,'program',c.program,'amount',c.initial_amount,'design',c.design,'deliver_at',c.deliver_at,'created_at',c.created_at) order by c.created_at desc)
    from public.gift_cards c join public.gift_orders o on o.id = c.order_id
    where lower(o.recipient_email) = v_email and c.status in ('active','partially_redeemed') and c.purchaser_id <> auth.uid()
      and (c.recipient_user_id is null) and (c.deliver_at is null or c.deliver_at <= now())),'[]'::jsonb));
end $$;
revoke all on function public.gift_inbox() from public, anon;
grant execute on function public.gift_inbox() to authenticated;

-- In-app notification the moment a card for an existing member is issued (no external email/SMS provider involved).
create or replace function public.gift_notify_recipient() returns trigger language plpgsql security definer set search_path = '' as $$
declare o public.gift_orders%rowtype; v_user uuid;
begin
  if new.status <> 'active' or (new.deliver_at is not null and new.deliver_at > now()) or to_regclass('public.notifications') is null then return new; end if;
  select * into o from public.gift_orders where id = new.order_id;
  if o.recipient_email is null then return new; end if;
  select id into v_user from auth.users where lower(email) = lower(o.recipient_email) and email_confirmed_at is not null and id <> new.purchaser_id limit 1;
  if v_user is null then return new; end if;
  begin
    execute 'insert into public.notifications(user_id,type,title,message,data) values ($1,$2,$3,$4,$5)' using v_user,'gift_card','You received a gift card','Open it from My gift cards to see your message and balance.',jsonb_build_object('card_id',new.id,'url','gift-cards.html#/mine');
  exception when others then null; end;
  return new;
end $$;
drop trigger if exists gift_cards_notify on public.gift_cards;
create trigger gift_cards_notify after insert on public.gift_cards for each row execute function public.gift_notify_recipient();

-- ============================================================ restaurant payout destination + provider settlements
create table if not exists public.gift_payout_methods (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  network text not null check (network in ('wave','afrimoney')),
  account_number text not null check (account_number ~ '^\+?[0-9]{7,15}$'),
  beneficiary_name text not null check (length(btrim(beneficiary_name)) between 2 and 80),
  status text not null default 'pending' check (status in ('pending','active','rejected')),
  updated_at timestamptz not null default now(), decided_by uuid
);
alter table public.gift_payout_methods enable row level security;
revoke all on public.gift_payout_methods from anon, authenticated;
grant select on public.gift_payout_methods to authenticated;
drop policy if exists gift_payout_methods_read on public.gift_payout_methods;
create policy gift_payout_methods_read on public.gift_payout_methods for select to authenticated using (public.gift_is_admin() or public.gift_is_owner_of_restaurant(restaurant_id));

create or replace function public.gift_set_payout_method(p_restaurant uuid, p_network text, p_number text, p_name text) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.gift_is_owner_of_restaurant(p_restaurant) then return jsonb_build_object('ok',false,'error','FORBIDDEN'); end if;
  if p_network not in ('wave','afrimoney') then return jsonb_build_object('ok',false,'error','BAD_NETWORK'); end if;
  p_number := regexp_replace(coalesce(p_number,''),'[ -]','','g');
  if p_number !~ '^\+?[0-9]{7,15}$' or length(btrim(coalesce(p_name,''))) < 2 or length(btrim(p_name)) > 80 then return jsonb_build_object('ok',false,'error','BAD_DETAILS'); end if;
  insert into public.gift_payout_methods(restaurant_id,network,account_number,beneficiary_name,status) values (p_restaurant,p_network,p_number,btrim(p_name),'pending')
  on conflict (restaurant_id) do update set network = excluded.network, account_number = excluded.account_number, beneficiary_name = excluded.beneficiary_name, status = 'pending', updated_at = now(), decided_by = null;
  perform public.gift_audit_log('payout_method_set','restaurant',p_restaurant::text,jsonb_build_object('network',p_network));
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.gift_set_payout_method(uuid,text,text,text) from public, anon;
grant execute on function public.gift_set_payout_method(uuid,text,text,text) to authenticated;

create or replace function public.gift_admin_review_payout_method(p_restaurant uuid, p_approve boolean) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.gift_admin_guard();
  update public.gift_payout_methods set status = case when p_approve then 'active' else 'rejected' end, decided_by = auth.uid(), updated_at = now() where restaurant_id = p_restaurant and status = 'pending';
  if not found then return jsonb_build_object('ok',false,'error','NOT_FOUND'); end if;
  perform public.gift_audit_log('payout_method_reviewed','restaurant',p_restaurant::text,jsonb_build_object('approved',p_approve));
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.gift_admin_review_payout_method(uuid,boolean) from public, anon;
grant execute on function public.gift_admin_review_payout_method(uuid,boolean) to authenticated;

alter table public.gift_settlements drop constraint if exists gift_settlements_status_check;
alter table public.gift_settlements add constraint gift_settlements_status_check check (status in ('pending_payment','processing','paid','cancelled'));
alter table public.gift_settlements add column if not exists method text check (method in ('modempay','manual'));
alter table public.gift_settlements add column if not exists provider_error text;

-- manual resolution now also accepts a settlement stuck in 'processing' (uncertain provider result)
create or replace function public.gift_admin_resolve_settlement(p_settlement uuid, p_paid boolean, p_reference text default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare st public.gift_settlements%rowtype;
begin
  perform public.gift_admin_guard();
  select * into st from public.gift_settlements where id = p_settlement for update;
  if not found or st.status not in ('pending_payment','processing') then return jsonb_build_object('ok',false,'error','BAD_TRANSITION'); end if;
  if p_paid then
    update public.gift_settlements set status = 'paid', paid_at = now(), method = coalesce(method,'manual'), reference = coalesce(nullif(btrim(p_reference),''), reference) where id = st.id;
    update public.gift_merchant_credits set status = 'settled' where settlement_id = st.id;
  else
    update public.gift_settlements set status = 'cancelled' where id = st.id;
    update public.gift_merchant_credits set status = 'pending', settlement_id = null where settlement_id = st.id;
  end if;
  perform public.gift_audit_log(case when p_paid then 'settlement_paid' else 'settlement_cancelled' end,'gift_settlement',st.id::text,jsonb_build_object('reference',p_reference,'previous',st.status));
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.gift_admin_resolve_settlement(uuid,boolean,text) from public, anon;
grant execute on function public.gift_admin_resolve_settlement(uuid,boolean,text) to authenticated;

create or replace function public.gift_settlement_begin(p_settlement uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare st public.gift_settlements%rowtype; m public.gift_payout_methods%rowtype;
begin
  select * into st from public.gift_settlements where id = p_settlement for update;
  if not found or st.status <> 'pending_payment' then return jsonb_build_object('ok',false,'error','BAD_TRANSITION'); end if;
  select * into m from public.gift_payout_methods where restaurant_id = st.restaurant_id and status = 'active';
  if not found then return jsonb_build_object('ok',false,'error','NO_PAYOUT_METHOD'); end if;
  update public.gift_settlements set status = 'processing', method = 'modempay', provider_error = null where id = st.id;
  return jsonb_build_object('ok',true,'amount',st.total,'network',m.network,'account_number',m.account_number,'beneficiary_name',m.beneficiary_name,'restaurant_id',st.restaurant_id);
end $$;
revoke all on function public.gift_settlement_begin(uuid) from public, anon, authenticated;
grant execute on function public.gift_settlement_begin(uuid) to service_role;

create or replace function public.gift_settlement_finish(p_settlement uuid, p_ok boolean, p_reference text default null, p_error text default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare st public.gift_settlements%rowtype;
begin
  select * into st from public.gift_settlements where id = p_settlement for update;
  if not found or st.status <> 'processing' then return jsonb_build_object('ok',false,'error','BAD_TRANSITION'); end if;
  if p_ok then
    update public.gift_settlements set status = 'paid', paid_at = now(), reference = left(p_reference,200) where id = st.id;
    update public.gift_merchant_credits set status = 'settled' where settlement_id = st.id;
  else
    update public.gift_settlements set status = 'pending_payment', provider_error = left(coalesce(p_error,'Provider rejected the transfer'),400) where id = st.id;
  end if;
  insert into public.gift_audit(actor_id,action,entity_type,entity_id,details) values (null, case when p_ok then 'settlement_transferred' else 'settlement_transfer_failed' end,'gift_settlement',st.id::text,jsonb_build_object('reference',p_reference,'error',p_error));
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.gift_settlement_finish(uuid,boolean,text,text) from public, anon, authenticated;
grant execute on function public.gift_settlement_finish(uuid,boolean,text,text) to service_role;

commit;
