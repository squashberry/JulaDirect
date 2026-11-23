-- Restaurant service. Everything is gated by platform_features.restaurants (default OFF).
-- While it is off, the public tables return nothing, so the site looks exactly as before.

create table if not exists public.platform_features (
  key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into public.platform_features(key, enabled) values ('restaurants', false) on conflict (key) do nothing;
alter table public.platform_features enable row level security;
drop policy if exists "features readable" on public.platform_features;
create policy "features readable" on public.platform_features for select to anon, authenticated using (true);
drop policy if exists "features admin write" on public.platform_features;
create policy "features admin write" on public.platform_features for all to authenticated
  using (public.is_gambasket_admin()) with check (public.is_gambasket_admin());

create or replace function public.food_enabled() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from public.platform_features where key = 'restaurants'), false);
$$;
grant execute on function public.food_enabled() to anon, authenticated;

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  tagline text,
  description text,
  cuisines text[] not null default '{}',
  logo_url text,
  cover_url text,
  location text,
  phone text,
  whatsapp text,
  opening_hours text,
  offers_delivery boolean not null default true,
  offers_pickup boolean not null default true,
  delivery_fee numeric(10,2) not null default 0,
  min_order numeric(10,2) not null default 0,
  prep_minutes int not null default 25,
  is_open boolean not null default true,
  status text not null default 'pending' check (status in ('pending','approved','suspended')),
  rating numeric(2,1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists restaurants_owner_idx on public.restaurants(owner_id);
create index if not exists restaurants_status_idx on public.restaurants(status);

create table if not exists public.restaurant_menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category text not null default 'Mains',
  name text not null check (char_length(name) between 2 and 100),
  description text,
  price numeric(10,2) not null check (price >= 0),
  image_url text,
  emoji text,
  tags text[] not null default '{}',
  spicy smallint not null default 0 check (spicy between 0 and 3),
  is_available boolean not null default true,
  is_featured boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists menu_items_restaurant_idx on public.restaurant_menu_items(restaurant_id, category, sort);

-- Owners can edit their profile but never their own approval status, rating or owner.
create or replace function public.restaurants_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if public.is_gambasket_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.rating := null; new.owner_id := auth.uid();
  else
    new.status := old.status; new.rating := old.rating; new.owner_id := old.owner_id;
  end if;
  return new;
end $$;
drop trigger if exists restaurants_guard_trg on public.restaurants;
create trigger restaurants_guard_trg before insert or update on public.restaurants
  for each row execute function public.restaurants_guard();

alter table public.restaurants enable row level security;
alter table public.restaurant_menu_items enable row level security;

drop policy if exists "restaurants public read" on public.restaurants;
create policy "restaurants public read" on public.restaurants for select to anon, authenticated using (
  (status = 'approved' and public.food_enabled()) or owner_id = auth.uid() or public.is_gambasket_admin());
drop policy if exists "restaurants owner insert" on public.restaurants;
create policy "restaurants owner insert" on public.restaurants for insert to authenticated
  with check (owner_id = auth.uid() and public.food_enabled());
drop policy if exists "restaurants owner update" on public.restaurants;
create policy "restaurants owner update" on public.restaurants for update to authenticated
  using (owner_id = auth.uid() or public.is_gambasket_admin()) with check (owner_id = auth.uid() or public.is_gambasket_admin());
drop policy if exists "restaurants owner delete" on public.restaurants;
create policy "restaurants owner delete" on public.restaurants for delete to authenticated
  using (owner_id = auth.uid() or public.is_gambasket_admin());

drop policy if exists "menu public read" on public.restaurant_menu_items;
create policy "menu public read" on public.restaurant_menu_items for select to anon, authenticated using (
  exists (select 1 from public.restaurants r where r.id = restaurant_id
    and ((r.status = 'approved' and public.food_enabled()) or r.owner_id = auth.uid() or public.is_gambasket_admin())));
drop policy if exists "menu owner write" on public.restaurant_menu_items;
create policy "menu owner write" on public.restaurant_menu_items for all to authenticated
  using (exists (select 1 from public.restaurants r where r.id = restaurant_id and (r.owner_id = auth.uid() or public.is_gambasket_admin())))
  with check (exists (select 1 from public.restaurants r where r.id = restaurant_id and (r.owner_id = auth.uid() or public.is_gambasket_admin())));

-- Photos for logos, covers and meals
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('food-media', 'food-media', true, 6291456, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true;
drop policy if exists "food media upload own" on storage.objects;
create policy "food media upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'food-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "food media read" on storage.objects;
create policy "food media read" on storage.objects for select to anon, authenticated using (bucket_id = 'food-media');
drop policy if exists "food media delete own" on storage.objects;
create policy "food media delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'food-media' and (storage.foldername(name))[1] = auth.uid()::text);
