-- Индивидуальные результаты месячной проверки для каждой команды.
-- Выполнить после trainer-management.sql и monthly-followup.sql в Supabase SQL Editor.
-- Миграция не удаляет старую таблицу/данные; общая публикация больше не используется приложением.

create table if not exists public.team_followup_results (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  results jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  published_at timestamptz,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id, team_id)
);

alter table public.team_followup_results enable row level security;

revoke all on public.team_followup_results from anon, authenticated;
grant select on public.team_followup_results to authenticated;

drop policy if exists team_followup_results_read_own_team on public.team_followup_results;
create policy team_followup_results_read_own_team
  on public.team_followup_results
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.team_memberships m
      where m.workshop_id = team_followup_results.workshop_id
        and m.team_id = team_followup_results.team_id
        and m.user_id = auth.uid()
    )
  );

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
        ),
        'followup_published_count', (
          select count(*)::integer
          from public.team_followup_results r
          where r.workshop_id = w.id
            and r.is_published = true
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

create or replace function public.trainer_get_team_followups(p_workshop_id uuid)
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

  if not exists (
    select 1
    from public.workshops w
    where w.id = p_workshop_id
      and coalesce(w.is_archived, false) = false
  ) then
    raise exception 'Поток не найден или находится в архиве.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'team_id', t.id,
        'team_name', t.name,
        'answers', coalesce(a.answer_map, '{}'::jsonb),
        'results', r.results,
        'is_published', coalesce(r.is_published, false),
        'published_at', r.published_at,
        'updated_at', r.updated_at
      )
      order by t.name
    ),
    '[]'::jsonb
  )
  into v_result
  from public.teams t
  left join lateral (
    select jsonb_object_agg(ta.field_key, ta.answer) as answer_map
    from public.team_answers ta
    where ta.workshop_id = p_workshop_id
      and ta.team_id = t.id
  ) a on true
  left join public.team_followup_results r
    on r.workshop_id = p_workshop_id
   and r.team_id = t.id
  where t.workshop_id = p_workshop_id;

  return v_result;
end;
$$;

create or replace function public.trainer_save_team_followup(
  p_workshop_id uuid,
  p_team_id uuid,
  p_results jsonb,
  p_publish boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.team_followup_results;
begin
  if not public.is_tpi_trainer() then
    raise exception 'Доступ только для тренера.';
  end if;

  if jsonb_typeof(p_results) is distinct from 'object' then
    raise exception 'Результаты должны быть переданы в виде объекта.';
  end if;

  if not exists (
    select 1
    from public.teams t
    join public.workshops w on w.id = t.workshop_id
    where t.id = p_team_id
      and t.workshop_id = p_workshop_id
      and coalesce(w.is_archived, false) = false
  ) then
    raise exception 'Команда не найдена в выбранном активном потоке.';
  end if;

  if p_publish then
    if nullif(trim(coalesce(p_results->>'metric_name','')), '') is null
       or nullif(trim(coalesce(p_results->>'baseline_value','')), '') is null
       or nullif(trim(coalesce(p_results->>'target_value','')), '') is null
       or nullif(trim(coalesce(p_results->>'actual_value','')), '') is null
       or coalesce(p_results->>'outcome','') not in ('met','partial','not_met','inconclusive') then
      raise exception 'Для публикации заполните название метрики, baseline, цель, фактический результат и итог оценки.';
    end if;
  end if;

  insert into public.team_followup_results (
    workshop_id, team_id, results, is_published, published_at, updated_by, updated_at
  )
  values (
    p_workshop_id,
    p_team_id,
    p_results,
    p_publish,
    case when p_publish then now() else null end,
    auth.uid(),
    now()
  )
  on conflict (workshop_id, team_id)
  do update set
    results = excluded.results,
    is_published = case
      when p_publish then true
      else public.team_followup_results.is_published
    end,
    published_at = case
      when p_publish then now()
      else public.team_followup_results.published_at
    end,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'is_published', v_row.is_published,
    'published_at', v_row.published_at,
    'message', case when v_row.is_published
      then 'Результаты этой команды опубликованы.'
      else 'Черновик результатов сохранён.'
    end
  );
end;
$$;

-- Эта функция возвращает результат только той команды, к которой привязан текущий пользователь.
create or replace function public.get_monthly_results(p_join_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_workshop_id uuid;
  v_team_id uuid;
  v_result public.team_followup_results;
begin
  select w.id
    into v_workshop_id
  from public.workshops w
  where upper(trim(w.join_code)) = upper(trim(p_join_code))
  limit 1;

  if v_workshop_id is null then
    raise exception 'Поток не найден.';
  end if;

  select m.team_id
    into v_team_id
  from public.team_memberships m
  where m.workshop_id = v_workshop_id
    and m.user_id = auth.uid()
  limit 1;

  if v_team_id is null then
    raise exception 'Сначала выберите команду в этом потоке.';
  end if;

  select *
    into v_result
  from public.team_followup_results r
  where r.workshop_id = v_workshop_id
    and r.team_id = v_team_id
    and r.is_published = true
  limit 1;

  if not found then
    return jsonb_build_object(
      'published', false,
      'published_at', null,
      'results', null
    );
  end if;

  return jsonb_build_object(
    'published', true,
    'published_at', v_result.published_at,
    'results', v_result.results
  );
end;
$$;

-- При сбросе потока очищаем индивидуальные результаты команд вместе с их ответами.
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

  foreach v_table in array array[
    'team_answers',
    'individual_answers',
    'workshop_snapshots',
    'team_followup_results',
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
      archived_previous_status = null,
      followup_published = false,
      followup_published_at = null
  where id = p_workshop_id;

  return jsonb_build_object(
    'ok', true,
    'deleted_rows', v_total,
    'message', 'Прогресс и индивидуальные месячные результаты сброшены. Команды и код сохранены.'
  );
end;
$$;

revoke all on function public.trainer_get_team_followups(uuid) from public, anon;
revoke all on function public.trainer_save_team_followup(uuid, uuid, jsonb, boolean) from public, anon;
revoke all on function public.get_monthly_results(text) from public, anon;

grant execute on function public.trainer_get_team_followups(uuid) to authenticated;
grant execute on function public.trainer_save_team_followup(uuid, uuid, jsonb, boolean) to authenticated;
grant execute on function public.get_monthly_results(text) to authenticated;

-- Enable Postgres Changes for team-specific publication, if the publication exists.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'team_followup_results'
     ) then
    execute 'alter publication supabase_realtime add table public.team_followup_results';
  end if;
end;
$$;
