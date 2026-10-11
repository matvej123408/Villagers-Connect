-- Villagers Connect public data and single-administrator access rules.
-- Run this in Supabase Dashboard > SQL Editor as the project owner.

create extension if not exists pgcrypto;

create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  line text not null,
  destination text not null,
  stops jsonb not null default '[]'::jsonb,
  description text not null default '',
  media jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.buses (
  id uuid primary key default gen_random_uuid(),
  model text not null,
  fleet_number text not null default '',
  description text not null default '',
  media jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.routes enable row level security;
alter table public.buses enable row level security;

grant select on public.routes, public.buses to anon, authenticated;
grant insert, update, delete on public.routes, public.buses to authenticated;

drop policy if exists "Anyone can read routes" on public.routes;
create policy "Anyone can read routes"
  on public.routes for select to anon, authenticated using (true);
drop policy if exists "Only Villagers Connect admin can add routes" on public.routes;
create policy "Only Villagers Connect admin can add routes"
  on public.routes for insert to authenticated
  with check ((auth.jwt() ->> 'email') = 'matvejbojko146@gmail.com');
drop policy if exists "Only Villagers Connect admin can edit routes" on public.routes;
create policy "Only Villagers Connect admin can edit routes"
  on public.routes for update to authenticated
  using ((auth.jwt() ->> 'email') = 'matvejbojko146@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'matvejbojko146@gmail.com');
drop policy if exists "Only Villagers Connect admin can remove routes" on public.routes;
create policy "Only Villagers Connect admin can remove routes"
  on public.routes for delete to authenticated
  using ((auth.jwt() ->> 'email') = 'matvejbojko146@gmail.com');

drop policy if exists "Anyone can read buses" on public.buses;
create policy "Anyone can read buses"
  on public.buses for select to anon, authenticated using (true);
drop policy if exists "Only Villagers Connect admin can add buses" on public.buses;
create policy "Only Villagers Connect admin can add buses"
  on public.buses for insert to authenticated
  with check ((auth.jwt() ->> 'email') = 'matvejbojko146@gmail.com');
drop policy if exists "Only Villagers Connect admin can edit buses" on public.buses;
create policy "Only Villagers Connect admin can edit buses"
  on public.buses for update to authenticated
  using ((auth.jwt() ->> 'email') = 'matvejbojko146@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'matvejbojko146@gmail.com');
drop policy if exists "Only Villagers Connect admin can remove buses" on public.buses;
create policy "Only Villagers Connect admin can remove buses"
  on public.buses for delete to authenticated
  using ((auth.jwt() ->> 'email') = 'matvejbojko146@gmail.com');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'villagers-media',
  'villagers-media',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can view Villagers Connect media" on storage.objects;
create policy "Anyone can view Villagers Connect media"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'villagers-media');
drop policy if exists "Only Villagers Connect admin can upload media" on storage.objects;
create policy "Only Villagers Connect admin can upload media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'villagers-media'
    and (auth.jwt() ->> 'email') = 'matvejbojko146@gmail.com'
  );
drop policy if exists "Only Villagers Connect admin can update media" on storage.objects;
create policy "Only Villagers Connect admin can update media"
  on storage.objects for update to authenticated
  using (bucket_id = 'villagers-media' and (auth.jwt() ->> 'email') = 'matvejbojko146@gmail.com')
  with check (bucket_id = 'villagers-media' and (auth.jwt() ->> 'email') = 'matvejbojko146@gmail.com');
drop policy if exists "Only Villagers Connect admin can remove media" on storage.objects;
create policy "Only Villagers Connect admin can remove media"
  on storage.objects for delete to authenticated
  using (bucket_id = 'villagers-media' and (auth.jwt() ->> 'email') = 'matvejbojko146@gmail.com');

-- Public starter route shown on the site and ready to be edited in the admin panel.
insert into public.routes (line, destination, stops, description)
select
  'V5A',
  'Okleśna PKP',
  '["Lwówek Śląski", "Młynka", "Lanckorona", "Lanckorona Wiadukt", "Okleśna PKP"]'::jsonb,
  'A gentle run through the valley, with a handy connection at Okleśna PKP.'
where not exists (select 1 from public.routes where line = 'V5A');

insert into public.buses (model, description)
select starter.model, starter.description
from (values
  ('O405N2', 'A familiar low-floor workhorse, ready for the longer village roads.'),
  ('7000', 'A bright local favourite with a little extra room for the ride.'),
  ('260.04', 'A nimble single-decker for winding lanes and close-set stops.'),
  ('B951', 'A dependable bus for all the little connections between towns.'),
  ('M101I/3', 'A classic shape with a welcoming view of the village outside.'),
  ('7700FL', 'A smooth, modern ride for busy days on the local network.')
) as starter(model, description)
where not exists (select 1 from public.buses where buses.model = starter.model);
