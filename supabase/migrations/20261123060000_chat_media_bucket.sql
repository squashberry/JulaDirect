-- Voice notes and photos sent in chat. Public bucket (links are unguessable), only signed-in users
-- can upload, and only into their own folder. Message text stays "[voice]<url> <seconds>" / "[img]<url> caption".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', true, 8388608,
  array['image/jpeg','image/png','image/webp','image/gif','audio/webm','audio/mp4','audio/x-m4a','audio/aac','audio/ogg','audio/mpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "chat media upload own folder" on storage.objects;
create policy "chat media upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "chat media read" on storage.objects;
create policy "chat media read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'chat-media');

drop policy if exists "chat media delete own" on storage.objects;
create policy "chat media delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'chat-media' and (storage.foldername(name))[1] = auth.uid()::text);
