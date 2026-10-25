-- Staged Auth-backed profiles and appearance preferences.
-- This migration does not harden legacy tables or change their policies.
-- Do not apply until the client and account migration use Supabase Auth.

begin;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  auth_email text not null,
  contact_email text not null,
  display_name text not null default '',
  role text not null default 'OPERADOR'
    check (role in ('OPERADOR', 'CLIENTE', 'TECNICO', 'AUDITOR_CALIDAD', 'ADMIN', 'DIRECTOR', 'SUPERADMIN')),
  department text,
  authorized_devices text[] not null default '{}',
  status text not null default 'PENDIENTE'
    check (status in ('PENDIENTE', 'ACTIVO', 'INACTIVO', 'SUSPENDIDO')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_profiles_auth_email_lower_uidx
  on public.user_profiles (lower(auth_email));

create table if not exists public.user_appearance_preferences (
  user_id uuid primary key references public.user_profiles(user_id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb
    check (jsonb_typeof(preferences) = 'object'),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_appearance_overrides (
  user_id uuid primary key references public.user_profiles(user_id) on delete cascade,
  overrides jsonb not null default '{}'::jsonb
    check (jsonb_typeof(overrides) = 'object'),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles p
    where p.user_id = (select auth.uid())
      and p.status = 'ACTIVO'
      and p.role in ('ADMIN', 'DIRECTOR', 'SUPERADMIN')
  );
$$;

revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

create or replace function public.handle_new_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_username text;
begin
  if new.email is null or btrim(new.email) = '' then
    raise exception 'An email address is required for a Biofleet account.';
  end if;

  new_username := lower(coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    split_part(new.email, '@', 1)
  ));

  insert into public.user_profiles (user_id, username, auth_email, contact_email, display_name, role, status)
  values (
    new.id,
    new_username,
    lower(new.email),
    lower(coalesce(nullif(new.raw_user_meta_data ->> 'contact_email', ''), new.email)),
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), new_username),
    'OPERADOR',
    'PENDIENTE'
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_auth_profile() from public, anon, authenticated;

create or replace function public.sync_auth_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or btrim(new.email) = '' then
    raise exception 'An email address is required for a Biofleet account.';
  end if;

  update public.user_profiles
  set auth_email = lower(new.email), updated_at = now()
  where user_id = new.id;

  return new;
end;
$$;

revoke all on function public.sync_auth_profile_email() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_auth_profile();

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.sync_auth_profile_email();

alter table public.user_profiles enable row level security;
alter table public.user_appearance_preferences enable row level security;
alter table public.admin_appearance_overrides enable row level security;

revoke all on table public.user_profiles from anon, authenticated;
revoke all on table public.user_appearance_preferences from anon, authenticated;
revoke all on table public.admin_appearance_overrides from anon, authenticated;

grant select on table public.user_profiles to authenticated;
grant select on table public.user_appearance_preferences to authenticated;
grant select on table public.admin_appearance_overrides to authenticated;

drop policy if exists user_profiles_read_own_or_admin on public.user_profiles;
create policy user_profiles_read_own_or_admin
  on public.user_profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_platform_admin()));

drop policy if exists appearance_read_own on public.user_appearance_preferences;
create policy appearance_read_own
  on public.user_appearance_preferences for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists admin_overrides_read_own_or_admin on public.admin_appearance_overrides;
create policy admin_overrides_read_own_or_admin
  on public.admin_appearance_overrides for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_platform_admin()));

create or replace function public.validate_appearance_preferences(p_preferences jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_preferences is null or jsonb_typeof(p_preferences) <> 'object' then
    raise exception 'Appearance preferences must be a JSON object.';
  end if;

  if p_preferences - 'theme' - 'background' - 'opacity' <> '{}'::jsonb then
    raise exception 'Unsupported appearance preference key.';
  end if;

  if p_preferences ? 'theme' and (
    jsonb_typeof(p_preferences -> 'theme') <> 'string'
    or p_preferences ->> 'theme' not in ('tactical', 'cyber', 'hybrid')
  ) then
    raise exception 'Unsupported theme.';
  end if;

  if p_preferences ? 'background' and (
    jsonb_typeof(p_preferences -> 'background') <> 'string'
    or p_preferences ->> 'background' not in (
      'circuit-pcb', 'planet-nodes', 'cyber-matrix', 'motherboard-gold',
      'quantum-connections', 'server-datacenter', 'oled'
    )
  ) then
    raise exception 'Unsupported background.';
  end if;

  if p_preferences ? 'opacity' and (
    jsonb_typeof(p_preferences -> 'opacity') <> 'number'
    or (p_preferences ->> 'opacity')::numeric < 0
    or (p_preferences ->> 'opacity')::numeric > 100
  ) then
    raise exception 'Opacity must be a number between 0 and 100.';
  end if;
end;
$$;

revoke all on function public.validate_appearance_preferences(jsonb) from public, anon, authenticated;

create or replace function public.get_my_appearance_preferences()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  personal jsonb;
  managed jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select preferences into personal
  from public.user_appearance_preferences
  where user_id = current_user_id;

  select overrides into managed
  from public.admin_appearance_overrides
  where user_id = current_user_id;

  return jsonb_build_object('theme', 'tactical', 'background', 'circuit-pcb', 'opacity', 82)
    || coalesce(personal, '{}'::jsonb)
    || coalesce(managed, '{}'::jsonb);
end;
$$;

create or replace function public.save_my_appearance_preferences(p_preferences jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  perform public.validate_appearance_preferences(p_preferences);

  insert into public.user_appearance_preferences (user_id, preferences, updated_at)
  values (current_user_id, p_preferences, now())
  on conflict (user_id) do update
    set preferences = excluded.preferences,
        updated_at = excluded.updated_at;

  return public.get_my_appearance_preferences();
end;
$$;

create or replace function public.set_user_appearance_overrides(p_user_id uuid, p_overrides jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select public.is_platform_admin()) then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.user_profiles where user_id = p_user_id) then
    raise exception 'Target user does not exist.';
  end if;

  perform public.validate_appearance_preferences(p_overrides);

  insert into public.admin_appearance_overrides (user_id, overrides, updated_by, updated_at)
  values (p_user_id, p_overrides, (select auth.uid()), now())
  on conflict (user_id) do update
    set overrides = excluded.overrides,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.get_my_appearance_preferences() from public, anon;
revoke all on function public.save_my_appearance_preferences(jsonb) from public, anon;
revoke all on function public.set_user_appearance_overrides(uuid, jsonb) from public, anon;
grant execute on function public.get_my_appearance_preferences() to authenticated;
grant execute on function public.save_my_appearance_preferences(jsonb) to authenticated;
grant execute on function public.set_user_appearance_overrides(uuid, jsonb) to authenticated;

commit;