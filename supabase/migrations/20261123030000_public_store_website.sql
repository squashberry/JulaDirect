-- Public lookup of a seller's published SquashberryPro website (only the public URL is exposed).
create or replace function public.public_store_website(p_seller uuid)
returns table (site_name text, public_url text)
language sql stable security definer set search_path = public as $$
  select s.site_name, s.public_url
  from public.juladirect_store_sites s
  where s.seller_user_id = p_seller and s.is_published = true
    and s.public_url like 'https://squashberrypro.pages.dev/%'
  order by s.updated_at desc limit 1;
$$;
revoke all on function public.public_store_website(uuid) from public;
grant execute on function public.public_store_website(uuid) to anon, authenticated;
