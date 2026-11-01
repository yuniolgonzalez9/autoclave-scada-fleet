-- =========================================================================
-- EFECTOS NAVIDEÑOS GLOBALES
--
-- Un solo switch global (controlado por SUPERADMIN) enciende nieve + luces
-- para TODA la web en tiempo real. Los usuarios normales conservan un
-- opt-out local (su toggle guarda solo en su dispositivo).
-- =========================================================================

create table if not exists public.global_fx_settings (
  id integer primary key check (id = 1),
  xmas jsonb not null default '{"on":false,"flakes":120,"speed":100,"lights":true}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.global_fx_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.global_fx_settings enable row level security;

-- Todos los autenticados pueden LEER el switch global
drop policy if exists global_fx_read on public.global_fx_settings;
create policy global_fx_read on public.global_fx_settings
  for select to authenticated using (true);

-- Solo SUPERADMIN puede ESCRIBIRLO (vía RPC security definer)
create or replace function public.save_global_xmas(p_xmas jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select upper(coalesce(role, '')) into v_role
  from public.user_profiles
  where user_id = auth.uid();

  if v_role not in ('SUPERADMIN', 'ADMIN') then
    raise exception 'Solo el superadministrador puede cambiar los efectos globales.' using errcode = '42501';
  end if;

  if p_xmas is null or jsonb_typeof(p_xmas) <> 'object' then
    raise exception 'Xmas settings must be a JSON object.';
  end if;

  update public.global_fx_settings
  set xmas = jsonb_build_object(
        'on', coalesce((p_xmas ->> 'on')::boolean, false),
        'flakes', least(400, greatest(10, coalesce((p_xmas ->> 'flakes')::int, 120))),
        'speed', least(300, greatest(10, coalesce((p_xmas ->> 'speed')::int, 100))),
        'lights', coalesce((p_xmas ->> 'lights')::boolean, true),
        'garland', coalesce((p_xmas ->> 'garland')::boolean, true),
        'frost', coalesce((p_xmas ->> 'frost')::boolean, true),
        'caps', coalesce((p_xmas ->> 'caps')::boolean, true)
      ),
      updated_by = auth.uid(),
      updated_at = now()
  where id = 1;
end;
$$;

revoke all on function public.save_global_xmas(jsonb) from public, anon;
grant execute on function public.save_global_xmas(jsonb) to authenticated;

-- Realtime: el switch global llega en vivo a todos los dispositivos
do $$
begin
  alter publication supabase_realtime add table public.global_fx_settings;
exception when duplicate_object then null;
end $$;
