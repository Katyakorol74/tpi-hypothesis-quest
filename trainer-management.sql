-- Управление потоками практикума «Управление гипотезами».
-- Выполнить один раз в Supabase SQL Editor (повторный запуск безопасен).

alter table public.workshops
  add column if not exists is_archived boolean not null default false;

alter table public.workshops
  add column if not exists archived_previous_status text;

create or replace function public.is_tpi_trainer()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_column text;
  v_allowed boolean := false;
begin
  if auth.uid() is null or to_regclass('public.trainers') is null then
    return false;
  end if;

  select c.column_name
    into v_column
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'trainers'
    and c.column_name in ('user_id', 'id')
  order by case c.column_name when 'user_id' then 0 else 1 end
  limit 1;

  if v_column is null then
    return false;
  end if;

  execute format(
    'select exists (select 1 from public.trainers where %I = $1)',
    v_column
  )
  into v_allowed
  using auth.uid();

  return coalesce(v_allowed, false);
end;
$$;

create or replace function public.trainer_list_workshops()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not public.is_tpi_trainer() then
    raise exception 'Доступ только для тренера.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', w.id,
        'name', w.name,
        'join_code', w.join_code,
        'status', w.status,
        'created_at', w.created_at,
        'is_archived', w.is_archived,
        'team_count', (
          select count(*)::integer
          from public.teams t
          where t.workshop_id = w.id
        )
      )
      order by w.created_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.workshops w;

  return v_result;
end;
$$;

create or replace function public.trainer_archive_workshop(p_workshop_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workshop public.workshops;
begin
  if not public.is_tpi_trainer() then
    raise exception 'Доступ только для тренера.';
  end if;

  select * into v_workshop
  from public.workshops
  where id = p_workshop_id
  for update;

  if not found then
    raise exception 'Поток не найден.';
  end if;

  if v_workshop.is_archived then
    return jsonb_build_object('ok', true, 'message', 'Поток уже находится в архиве.');
  end if;

  update public.workshops
  set archived_previous_status = status,
      is_archived = true,
      status = 'locked'
  where id = p_workshop_id;

  return jsonb_build_object('ok', true, 'message', 'Поток архивирован. Ответы сохранены.');
end;
$$;

create or replace function public.trainer_restore_workshop(p_workshop_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_tpi_trainer() then
    raise exception 'Доступ только для тренера.';
  end if;

  update public.workshops
  set status = coalesce(archived_previous_status, 'active'),
      archived_previous_status = null,
      is_archived = false
  where id = p_workshop_id
    and is_archived = true;

  if not found then
    raise exception 'Архивный поток не найден.';
  end if;

  return jsonb_build_object('ok', true, 'message', 'Поток восстановлен.');
end;
$$;

create or replace function public.trainer_reset_workshop(p_workshop_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_table text;
  v_deleted integer;
  v_total integer := 0;
begin
  if not public.is_tpi_trainer() then
    raise exception 'Доступ только для тренера.';
  end if;

  perform 1
  from public.workshops
  where id = p_workshop_id
    and is_archived = false
  for update;

  if not found then
    raise exception 'Поток не найден или находится в архиве. Сначала восстановите его.';
  end if;

  -- Удаляются только данные выбранного потока. Определение столбца
  -- проверяется на случай необязательной таблицы в конкретной версии схемы.
  foreach v_table in array array[
    'team_answers',
    'individual_answers',
    'workshop_snapshots',
    'team_memberships'
  ]
  loop
    if to_regclass(format('public.%I', v_table)) is not null
       and exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = v_table
           and column_name = 'workshop_id'
       )
    then
      execute format('delete from public.%I where workshop_id = $1', v_table)
      using p_workshop_id;
      get diagnostics v_deleted = row_count;
      v_total := v_total + v_deleted;
    end if;
  end loop;

  update public.workshops
  set status = 'active',
      archived_previous_status = null
  where id = p_workshop_id;

  return jsonb_build_object(
    'ok', true,
    'deleted_rows', v_total,
    'message', 'Прогресс потока сброшен. Команды и код сохранены.'
  );
end;
$$;

revoke all on function public.is_tpi_trainer() from public, anon;
revoke all on function public.trainer_list_workshops() from public, anon;
revoke all on function public.trainer_archive_workshop(uuid) from public, anon;
revoke all on function public.trainer_restore_workshop(uuid) from public, anon;
revoke all on function public.trainer_reset_workshop(uuid) from public, anon;

grant execute on function public.trainer_list_workshops() to authenticated;
grant execute on function public.trainer_archive_workshop(uuid) to authenticated;
grant execute on function public.trainer_restore_workshop(uuid) to authenticated;
grant execute on function public.trainer_reset_workshop(uuid) to authenticated;
