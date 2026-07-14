-- Run this in Supabase SQL Editor

-- Subdomains table
create table if not exists public.subdomains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text unique not null,
  description text default '',
  created_at timestamptz default now()
);

-- RLS
alter table public.subdomains enable row level security;

create policy "Users can view own subdomains"
  on public.subdomains for select
  using (auth.uid() = user_id);

create policy "Users can insert own subdomains"
  on public.subdomains for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own subdomains"
  on public.subdomains for delete
  using (auth.uid() = user_id);

-- Storage bucket
insert into storage.buckets (id, name, public)
values ('sites', 'sites', true)
on conflict do nothing;

-- Storage policies
create policy "Public read sites"
  on storage.objects for select
  using (bucket_id = 'sites');

create policy "Auth users upload to own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'sites' AND
    (storage.foldername(name))[1] IN (
      SELECT name FROM public.subdomains WHERE user_id = auth.uid()
    )
  );

create policy "Auth users update own folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'sites' AND
    (storage.foldername(name))[1] IN (
      SELECT name FROM public.subdomains WHERE user_id = auth.uid()
    )
  );

create policy "Auth users delete from own folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'sites' AND
    (storage.foldername(name))[1] IN (
      SELECT name FROM public.subdomains WHERE user_id = auth.uid()
    )
  );
