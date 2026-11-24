-- Real restaurant orders. Prices are recomputed server-side from the menu; the client never sets totals.
create table if not exists public.food_orders (
  id uuid primary key default gen_random_uuid(),
  code text not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  address text,
  fulfilment text not null default 'delivery' check (fulfilment in ('delivery','pickup')),
  items jsonb not null,
  subtotal numeric(10,2) not null,
  delivery_fee numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  note text,
  status text not null default 'new' check (status in ('new','accepted','preparing','ready','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists food_orders_restaurant_idx on public.food_orders(restaurant_id, status, created_at desc);
create index if not exists food_orders_customer_idx on public.food_orders(customer_id, created_at desc);
alter table public.food_orders enable row level security;

drop policy if exists "food orders customer read" on public.food_orders;
create policy "food orders customer read" on public.food_orders for select to authenticated using (
  customer_id = auth.uid() or public.is_gambasket_admin()
  or exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));
drop policy if exists "food orders owner update" on public.food_orders;
create policy "food orders owner update" on public.food_orders for update to authenticated using (
  public.is_gambasket_admin() or exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid())
  or (customer_id = auth.uid() and status = 'new'))
  with check (true);

-- Owners/customers may only change the status (customers: cancel a brand-new order).
create or replace function public.food_orders_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare is_owner boolean;
begin
  new.updated_at := now();
  if public.is_gambasket_admin() then return new; end if;
  select exists(select 1 from public.restaurants r where r.id = old.restaurant_id and r.owner_id = auth.uid()) into is_owner;
  new.restaurant_id := old.restaurant_id; new.customer_id := old.customer_id; new.items := old.items;
  new.subtotal := old.subtotal; new.delivery_fee := old.delivery_fee; new.total := old.total; new.code := old.code;
  new.customer_name := old.customer_name; new.customer_phone := old.customer_phone; new.address := old.address; new.note := old.note; new.fulfilment := old.fulfilment;
  if not is_owner and new.status <> 'cancelled' then new.status := old.status; end if;
  return new;
end $$;
drop trigger if exists food_orders_guard_trg on public.food_orders;
create trigger food_orders_guard_trg before update on public.food_orders for each row execute function public.food_orders_guard();

-- place_food_order(restaurant, [{id, quantity}], 'delivery'|'pickup', name, phone, address, note)
create or replace function public.place_food_order(p_restaurant uuid, p_items jsonb, p_fulfilment text, p_name text, p_phone text, p_address text, p_note text)
returns public.food_orders language plpgsql security definer set search_path = public as $$
declare r public.restaurants; sub numeric := 0; fee numeric := 0; out jsonb := '[]'::jsonb; it jsonb; m public.restaurant_menu_items; q int; o public.food_orders;
begin
  if auth.uid() is null then raise exception 'Please sign in to place an order.'; end if;
  if not public.food_enabled() then raise exception 'Restaurant ordering is not available.'; end if;
  select * into r from public.restaurants where id = p_restaurant and status = 'approved';
  if not found then raise exception 'Restaurant not found.'; end if;
  if not r.is_open then raise exception 'This restaurant is closed right now.'; end if;
  if p_fulfilment not in ('delivery','pickup') then raise exception 'Choose delivery or pickup.'; end if;
  if p_fulfilment = 'delivery' and not r.offers_delivery then raise exception 'This restaurant does not deliver.'; end if;
  if p_fulfilment = 'pickup' and not r.offers_pickup then raise exception 'This restaurant does not offer pickup.'; end if;
  if char_length(coalesce(trim(p_name),'')) < 2 or char_length(coalesce(trim(p_phone),'')) < 6 then raise exception 'Name and phone are required.'; end if;
  if p_fulfilment = 'delivery' and char_length(coalesce(trim(p_address),'')) < 4 then raise exception 'Delivery address is required.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 40 then raise exception 'Your order is empty.'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    q := least(greatest(coalesce((it->>'quantity')::int, 0), 0), 30);
    continue when q = 0;
    select * into m from public.restaurant_menu_items where id = (it->>'id')::uuid and restaurant_id = p_restaurant and is_available;
    if not found then raise exception 'A meal in your order is no longer available.'; end if;
    sub := sub + m.price * q;
    out := out || jsonb_build_array(jsonb_build_object('id', m.id, 'name', m.name, 'price', m.price, 'quantity', q));
  end loop;
  if jsonb_array_length(out) = 0 then raise exception 'Your order is empty.'; end if;
  if sub < r.min_order then raise exception 'Minimum order is D%.', r.min_order; end if;
  if p_fulfilment = 'delivery' then fee := r.delivery_fee; end if;
  insert into public.food_orders(restaurant_id, customer_id, customer_name, customer_phone, address, fulfilment, items, subtotal, delivery_fee, total, note)
  values (p_restaurant, auth.uid(), trim(p_name), trim(p_phone), nullif(trim(coalesce(p_address,'')),''), p_fulfilment, out, sub, fee, sub + fee, nullif(trim(coalesce(p_note,'')),''))
  returning * into o;
  return o;
end $$;
grant execute on function public.place_food_order(uuid, jsonb, text, text, text, text, text) to authenticated;

alter publication supabase_realtime add table public.food_orders;
