-- Login por username y cola de solicitudes de acceso protegida.
-- Depende de 20261019000100_auth_profiles_and_appearance.sql (user_profiles, is_platform_admin).

begin;

-- Resuelve un identificador (username / auth_email / contact_email) al correo
-- interno de Supabase Auth para poder usar signInWithPassword con "usuario".
create or replace function public.resolve_login_email(p_identifier text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ident text := lower(btrim(coalesce(p_identifier, '')));
  found text;
begin
  if ident = '' then
    return null;
  end if;

  select p.auth_email into found
  from public.user_profiles p
  where lower(p.username) = ident
     or lower(p.auth_email) = ident
     or lower(p.contact_email) = ident
  limit 1;

  return found;
end;
$$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

-- Cola de solicitudes de acceso: reemplaza el uso de usuarios_scada (pass en
-- texto plano, legible por anon). Solo admins pueden leer/actualizar.
create table if not exists public.access_requests (
  id bigint generated always as identity primary key,
  username text not null,
  display_name text not null default '',
  contact_email text not null default '',
  department text,
  requested_password text,
  status text not null default 'PENDIENTE'
    check (status in ('PENDIENTE', 'APROBADA', 'RECHAZADA')),
  created_at timestamptz not null default now()
);

alter table public.access_requests enable row level security;

revoke all on table public.access_requests from anon, authenticated;
grant select on table public.access_requests to authenticated;
grant update (status) on table public.access_requests to authenticated;

drop policy if exists access_requests_admin_read on public.access_requests;
create policy access_requests_admin_read
  on public.access_requests for select to authenticated
  using ((select public.is_platform_admin()));

drop policy if exists access_requests_admin_update on public.access_requests;
create policy access_requests_admin_update
  on public.access_requests for update to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- Insert publico controlado: cualquier visitante puede solicitar acceso,
-- pero nunca puede leer la tabla.
create or replace function public.submit_access_request(
  p_username text,
  p_display_name text,
  p_contact_email text,
  p_department text,
  p_requested_password text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_username text := lower(btrim(coalesce(p_username, '')));
  clean_email text := lower(btrim(coalesce(p_contact_email, '')));
begin
  if clean_username !~ '^[a-z0-9_.-]{3,40}$' then
    raise exception 'Nombre de usuario no valido.' using errcode = '22023';
  end if;
  if clean_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'Correo de contacto no valido.' using errcode = '22023';
  end if;
  if length(coalesce(p_requested_password, '')) < 4 then
    raise exception 'La contrasena propuesta es demasiado corta.' using errcode = '22023';
  end if;

  insert into public.access_requests (username, display_name, contact_email, department, requested_password)
  values (
    clean_username,
    left(btrim(coalesce(p_display_name, '')), 120),
    clean_email,
    nullif(left(btrim(coalesce(p_department, '')), 160), ''),
    p_requested_password
  );
end;
$$;

revoke all on function public.submit_access_request(text, text, text, text, text) from public;
grant execute on function public.submit_access_request(text, text, text, text, text) to anon, authenticated;

commit;
