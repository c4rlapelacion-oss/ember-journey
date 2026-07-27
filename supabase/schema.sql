-- EMBER JOURNEY DATABASE
-- Run this complete file in Supabase: SQL Editor → New query → Run.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  full_name text not null,
  bio text not null default '',
  role text not null default 'participant' check (role in ('admin', 'participant')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.talks (
  number integer primary key check (number between 1 and 8),
  title text not null
);

create table if not exists public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  talk_number integer not null references public.talks(number) on delete cascade,
  token text not null unique,
  is_active boolean not null default true,
  opens_at timestamptz,
  closes_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.journey_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  talk_number integer not null references public.talks(number) on delete cascade,
  reflection text not null check (char_length(reflection) >= 20),
  encouragement_message text not null,
  encouragement_verse text not null,
  encouragement_verse_text text not null,
  qr_token text not null,
  completed_at timestamptz not null default now(),
  unique (user_id, talk_number)
);

insert into public.talks (number, title) values
  (1, 'God''s Love'),
  (2, 'Who Is Jesus Christ?'),
  (3, 'Repentance and Faith'),
  (4, 'Loving God and Neighbor'),
  (5, 'The Christian Family'),
  (6, 'Empowered by the Holy Spirit'),
  (7, 'Growing in the Spirit'),
  (8, 'Transformation in Christ')
on conflict (number) do update set title = excluded.title;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  derived_username text;
  derived_role text;
  derived_name text;
begin
  derived_username := lower(split_part(new.email, '@', 1));
  derived_role := case
    when derived_username in ('jesember', 'cassyember') then 'admin'
    else coalesce(new.raw_user_meta_data->>'role', 'participant')
  end;
  derived_name := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    initcap(replace(derived_username, '.', ' '))
  );

  insert into public.profiles (id, username, full_name, role)
  values (new.id, derived_username, derived_name, derived_role)
  on conflict (id) do update
  set username = excluded.username,
      full_name = excluded.full_name,
      role = excluded.role;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.protect_profile_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.role := old.role;
    new.username := old.username;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_permissions_trigger on public.profiles;
create trigger protect_profile_permissions_trigger
before update on public.profiles
for each row execute procedure public.protect_profile_permissions();

alter table public.profiles enable row level security;
alter table public.talks enable row level security;
alter table public.qr_codes enable row level security;
alter table public.journey_entries enable row level security;

drop policy if exists "Profiles: view own or admin" on public.profiles;
create policy "Profiles: view own or admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "Profiles: update own or admin" on public.profiles;
create policy "Profiles: update own or admin"
on public.profiles for update
to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

drop policy if exists "Talks: authenticated read" on public.talks;
create policy "Talks: authenticated read"
on public.talks for select
to authenticated
using (true);

drop policy if exists "QR: authenticated read" on public.qr_codes;
create policy "QR: authenticated read"
on public.qr_codes for select
to authenticated
using (true);

drop policy if exists "QR: admins insert" on public.qr_codes;
create policy "QR: admins insert"
on public.qr_codes for insert
to authenticated
with check (public.is_admin() and created_by = auth.uid());

drop policy if exists "QR: admins update" on public.qr_codes;
create policy "QR: admins update"
on public.qr_codes for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "QR: admins delete" on public.qr_codes;
create policy "QR: admins delete"
on public.qr_codes for delete
to authenticated
using (public.is_admin());

drop policy if exists "Entries: own or admin read" on public.journey_entries;
create policy "Entries: own or admin read"
on public.journey_entries for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Entries: own insert" on public.journey_entries;
create policy "Entries: own insert"
on public.journey_entries for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Entries: admins delete" on public.journey_entries;
create policy "Entries: admins delete"
on public.journey_entries for delete
to authenticated
using (public.is_admin());
