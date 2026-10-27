-- La pagina publica diag.html se elimino: nadie anonimo debe escribir en mobile_diag.
drop policy if exists mobile_diag_insert on public.mobile_diag;
revoke insert on table public.mobile_diag from anon, authenticated;

-- La contrasena propuesta solo se guarda mientras la solicitud esta pendiente.
update public.access_requests
  set requested_password = null
  where status <> 'PENDIENTE' and requested_password is not null;

create or replace function public.clear_processed_request_password()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status <> 'PENDIENTE' then
    new.requested_password := null;
  end if;
  return new;
end;
$$;

drop trigger if exists access_requests_clear_password on public.access_requests;
create trigger access_requests_clear_password
  before update on public.access_requests
  for each row execute function public.clear_processed_request_password();
