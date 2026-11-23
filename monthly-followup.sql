-- Месячное возвращение к гипотезе и публикация результатов.
-- Выполнить после trainer-management.sql в Supabase SQL Editor.
-- Безопасно для повторного выполнения.

alter table public.workshops
  add column if not exists followup_published boolean not null default false;

alter table public.workshops
  add column if not exists followup_published_at timestamptz;

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
        'followup_published', w.followup_published,
        'followup_published_at', w.followup_published_at,
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

create or replace function public.trainer_publish_monthly_results(p_workshop_id uuid)
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
  set followup_published = true,
      followup_published_at = coalesce(followup_published_at, now())
  where id = p_workshop_id
    and coalesce(is_archived, false) = false;

  if not found then
    raise exception 'Поток не найден или находится в архиве.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', 'Месячные результаты опубликованы для всех команд потока.'
  );
end;
$$;

create or replace function public.get_monthly_results(p_join_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_workshop public.workshops;
  v_results jsonb;
begin
  select *
    into v_workshop
  from public.workshops
  where upper(trim(join_code)) = upper(trim(p_join_code))
  limit 1;

  if not found then
    raise exception 'Поток не найден.';
  end if;

  if not exists (
    select 1
    from public.team_memberships m
    where m.workshop_id = v_workshop.id
      and m.user_id = auth.uid()
  ) then
    raise exception 'Сначала выберите команду в этом потоке.';
  end if;

  v_results := jsonb_build_object(
    'baseline', jsonb_build_object(
      'late_orders_count', 7,
      'orders_count', 20,
      'late_orders_percent', 35,
      'late_status_count', 8,
      'late_status_total', 20,
      'late_status_percent', 40,
      'urgent_requests', 12,
      'employee_convenience', 3.8
    ),
    'after', jsonb_build_object(
      'late_orders_count', 6,
      'orders_count', 20,
      'late_orders_percent', 30,
      'late_status_count', 3,
      'late_status_total', 20,
      'late_status_percent', 15,
      'urgent_requests', 5,
      'average_processing_time_change_percent', -2,
      'manager_extra_minutes_per_day', 25,
      'employee_convenience', 2.9,
      'safety_quality_violations', 0
    ),
    'targets', jsonb_build_object(
      'late_orders_percent_max', 25,
      'late_status_percent_max', 20,
      'manager_extra_minutes_per_day_max', 15,
      'safety_quality_violations_max', 0
    ),
    'limitations', jsonb_build_array(
      'В проверке участвовали 20 заказов — выборка небольшая.',
      'Контрольной группы не было, поэтому нельзя доказать, что изменения вызваны только экспериментом.',
      'Количество срочных поручений одновременно снизилось с 12 до 5 — это возможное альтернативное объяснение части улучшения.'
    ),
    'trainer_conclusion', 'Текущую версию не масштабировать. Сохранить полезное раннее выявление рисков, доработать отбор заказов для разбора, снизить дополнительную нагрузку и повторить ограниченный тест.'
  );

  return jsonb_build_object(
    'published', v_workshop.followup_published,
    'published_at', v_workshop.followup_published_at,
    'results', case when v_workshop.followup_published then v_results else null end
  );
end;
$$;

-- Сброс потока также закрывает месячный этап, чтобы новый запуск начинался чисто.
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
    'message', 'Прогресс и месячный этап сброшены. Команды и код сохранены.'
  );
end;
$$;

revoke all on function public.trainer_publish_monthly_results(uuid) from public, anon;
revoke all on function public.get_monthly_results(text) from public, anon;

grant execute on function public.trainer_publish_monthly_results(uuid) to authenticated;
grant execute on function public.get_monthly_results(text) to authenticated;
