-- Создание новой команды внутри выбранного потока из кабинета тренера.
-- Выполнить после team-archive.sql в Supabase SQL Editor.

create or replace function public.trainer_create_team(
  p_workshop_id uuid,
  p_team_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := trim(coalesce(p_team_name, ''));
  v_team public.teams;
begin
  if not public.is_tpi_trainer() then
    raise exception 'Доступ только для тренера.';
  end if;

  if length(v_name) < 2 then
    raise exception 'Название команды должно содержать минимум 2 символа.';
  end if;

  if length(v_name) > 80 then
    raise exception 'Название команды не должно превышать 80 символов.';
  end if;

  perform 1
  from public.workshops
  where id = p_workshop_id
    and coalesce(is_archived, false) = false
    and status <> 'locked'
  for update;

  if not found then
    raise exception 'Поток не найден, находится в архиве или результаты уже зафиксированы.';
  end if;

  if exists (
    select 1
    from public.teams
    where workshop_id = p_workshop_id
      and lower(trim(name)) = lower(v_name)
  ) then
    raise exception 'Команда с таким названием уже существует в этом потоке.';
  end if;

  insert into public.teams (
    id,
    workshop_id,
    name,
    is_archived
  )
  values (
    gen_random_uuid(),
    p_workshop_id,
    v_name,
    false
  )
  returning * into v_team;

  return jsonb_build_object(
    'ok', true,
    'team_id', v_team.id,
    'team_name', v_team.name,
    'message', 'Команда создана и добавлена в выбранный поток.'
  );
end;
$$;

revoke all on function public.trainer_create_team(uuid, text) from public, anon;
grant execute on function public.trainer_create_team(uuid, text) to authenticated;
