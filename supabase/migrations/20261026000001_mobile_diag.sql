create table if not exists public.mobile_diag (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  payload jsonb not null
);

alter table public.mobile_diag enable row level security;

drop policy if exists mobile_diag_insert on public.mobile_diag;
create policy mobile_diag_insert
  on public.mobile_diag for insert
  to anon, authenticated
  with check (true);

drop policy if exists mobile_diag_select_admin on public.mobile_diag;
create policy mobile_diag_select_admin
  on public.mobile_diag for select
  to authenticated
  using (public.is_platform_admin());
