-- Paquetes estériles con ID rotativo de 4 dígitos.
-- Flujo: cliente entrega paquete → se asigna código libre del pool 0000-9999 →
-- ticket impreso con QR → el equipo lo procesa → ESTERILIZADO con vigencia
-- (días según empaque) → ENTREGADO o CADUCADO libera el código para rehuso.
-- Consulta pública por RPC (campos limitados) — la tabla nunca se lee directo
-- con la llave anon.

create table if not exists public.paquetes_esteriles (
  id uuid primary key default gen_random_uuid(),
  codigo text not null check (codigo ~ '^\d{4}$'),
  mac text not null,
  equipo_alias text,
  cliente text not null default 'CLIENTE',
  contenido text not null default '',
  programa text not null default '134°C INSTRUMENTAL',
  dias_esterilidad integer not null default 30 check (dias_esterilidad between 1 and 365),
  estado text not null default 'REGISTRADO'
    check (estado in ('REGISTRADO','EN_PROCESO','ESTERILIZADO','FALLIDO','ENTREGADO','ANULADO','CADUCADO')),
  session_id text,
  creado_por text,
  creado_at timestamptz not null default now(),
  iniciado_at timestamptz,
  esterilizado_at timestamptz,
  expira_at timestamptz,
  entregado_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists paquetes_esteriles_estado on public.paquetes_esteriles (estado, creado_at desc);
create index if not exists paquetes_esteriles_mac on public.paquetes_esteriles (mac, estado);

-- Un código solo puede estar VIVO una vez. Los estados terminales
-- (ENTREGADO/ANULADO/CADUCADO/FALLIDO) liberan el código para rehuso —
-- el índice parcial permite reuso histórico sin chocar.
create unique index if not exists paquetes_esteriles_codigo_vivo
  on public.paquetes_esteriles (codigo)
  where estado in ('REGISTRADO','EN_PROCESO','ESTERILIZADO');

alter table public.paquetes_esteriles enable row level security;

drop policy if exists paquetes_select on public.paquetes_esteriles;
create policy paquetes_select on public.paquetes_esteriles
  for select to authenticated using (public.is_active_member());

drop policy if exists paquetes_insert on public.paquetes_esteriles;
create policy paquetes_insert on public.paquetes_esteriles
  for insert to authenticated
  with check (public.can_operate() and public.can_access_mac(mac));

drop policy if exists paquetes_update on public.paquetes_esteriles;
create policy paquetes_update on public.paquetes_esteriles
  for update to authenticated
  using (public.can_operate() and public.can_access_mac(mac))
  with check (public.can_operate() and public.can_access_mac(mac));

drop policy if exists paquetes_delete on public.paquetes_esteriles;
create policy paquetes_delete on public.paquetes_esteriles
  for delete to authenticated using (public.my_role() = 'SUPERADMIN');

-- ── Barrido de expirados: libera códigos antes de reclamar uno nuevo ──
-- ESTERILIZADO pasada su vigencia → CADUCADO. REGISTRADO/EN_PROCESO
-- abandonado >48h → ANULADO. FALLIDO también libera (ciclo no conforme).
create or replace function public.paquetes_sweep_expired()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
  m integer := 0;
begin
  update public.paquetes_esteriles
     set estado = 'CADUCADO', updated_at = now()
   where estado = 'ESTERILIZADO' and expira_at is not null and expira_at < now();
  get diagnostics n = row_count;

  update public.paquetes_esteriles
     set estado = 'ANULADO', updated_at = now()
   where estado in ('REGISTRADO','EN_PROCESO') and creado_at < now() - interval '48 hours';
  get diagnostics m = row_count;

  return n + m;
end;
$$;

revoke all on function public.paquetes_sweep_expired() from public;
grant execute on function public.paquetes_sweep_expired() to authenticated;

-- ── Reclamar código libre del pool 0000-9999 ──
-- Corre el sweep y devuelve un código aleatorio no usado por ningún
-- paquete vivo. El índice parcial único protege la carrera: si dos
-- estaciones reclaman el mismo código, el segundo insert falla y reintenta.
create or replace function public.claim_paquete_codigo()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text;
begin
  perform public.paquetes_sweep_expired();

  select c into v_codigo
    from (
      select lpad(g::text, 4, '0') as c
        from generate_series(0, 9999) g
    ) t
   where not exists (
      select 1 from public.paquetes_esteriles p
       where p.codigo = t.c
         and p.estado in ('REGISTRADO','EN_PROCESO','ESTERILIZADO')
   )
   order by random()
   limit 1;

  return v_codigo; -- null = pool agotado (10k paquetes vivos simultáneos)
end;
$$;

revoke all on function public.claim_paquete_codigo() from public;
grant execute on function public.claim_paquete_codigo() to authenticated;

-- ── Consulta pública por código: campos mínimos para el cliente ──
-- Security definer para que la llave anon no necesite SELECT en la tabla.
create or replace function public.get_package_status(p_codigo text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_estado text;
begin
  if p_codigo is null or p_codigo !~ '^\d{4}$' then
    return json_build_object('ok', false, 'error', 'CODIGO_INVALIDO');
  end if;

  select p.codigo, p.estado, p.programa, p.contenido, p.equipo_alias,
         p.dias_esterilidad, p.creado_at, p.iniciado_at,
         p.esterilizado_at, p.expira_at, p.entregado_at
    into r
    from public.paquetes_esteriles p
   where p.codigo = p_codigo
   order by p.creado_at desc
   limit 1;

  if not found then
    return json_build_object('ok', false, 'error', 'NO_ENCONTRADO');
  end if;

  -- Estado efectivo: vigencia vencida se reporta como CADUCADO aunque la
  -- fila aún diga ESTERILIZADO (el sweep la corrige al próximo uso).
  v_estado := r.estado;
  if v_estado = 'ESTERILIZADO' and r.expira_at is not null and r.expira_at < now() then
    v_estado := 'CADUCADO';
  end if;

  return json_build_object(
    'ok', true,
    'codigo', r.codigo,
    'estado', v_estado,
    'programa', r.programa,
    'contenido', r.contenido,
    'equipo', r.equipo_alias,
    'creado_at', r.creado_at,
    'esterilizado_at', r.esterilizado_at,
    'expira_at', r.expira_at,
    'entregado_at', r.entregado_at
  );
end;
$$;

revoke all on function public.get_package_status(text) from public;
grant execute on function public.get_package_status(text) to anon, authenticated;
