create or replace function public.save_global_xmas(p_xmas jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select upper(coalesce(role,'')) into v_role from public.user_profiles where user_id = auth.uid();
  if v_role not in ('SUPERADMIN','ADMIN') then
    raise exception 'Solo el superadministrador puede cambiar los efectos globales.' using errcode = '42501';
  end if;
  update public.global_fx_settings set xmas = jsonb_build_object(
      'on', coalesce((p_xmas ->> 'on')::boolean, false),
      'flakes', least(400, greatest(10, coalesce((p_xmas ->> 'flakes')::int, 120))),
      'speed', least(300, greatest(10, coalesce((p_xmas ->> 'speed')::int, 100))),
      'lights', coalesce((p_xmas ->> 'lights')::boolean, true)),
    updated_by = auth.uid(), updated_at = now() where id = 1;
end;
$$;
revoke all on function public.save_global_xmas(jsonb) from public, anon;
grant execute on function public.save_global_xmas(jsonb) to authenticated;
