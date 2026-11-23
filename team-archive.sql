-- Архивирование отдельной команды независимо от всего потока.
-- Выполнить после team-specific-followup.sql в Supabase SQL Editor.
-- Архивация команды сохраняет её ответы и месячные результаты.

alter table public.teams
  add column if not exists is_archived boolean not null default false;

alter table public.teams
  add column if not exists archived_at timestamptz;

alter table public.teams
  add column if not exists archived_by uuid;

create or replace function public.get_archived_team_ids(p_join_code text)
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(t.id), '{}'::uuid[])
  from public.teams t
  join public.workshops w on w.id = t.workshop_id
  where upper(trim(w.join_code)) = upper(trim(p_join_code))
    and t.is_archived = true;
$$;

-- Защита на уровне БД: даже прямой или устаревший вызов join_workshop
-- не позволит создать membership в архивную команду.
create or replace function public.reject_archived_team_membership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.teams t
    where t.id = new.team_id
      and t.workshop_id = new.workshop_id
      and t.is_archived = true
  ) then
    raise exception 'Эта команда находится в архиве. Выберите другую команду или попросите тренера восстановить её.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reject_archived_team_membership on public.team_memberships;
create trigger trg_reject_archived_team_membership
before insert or update of team_id, workshop_id
on public.team_memberships
for each row
execute function public.reject_archived_team_membership();

create or replace function public.trainer_archive_team(
  p_workshop_id uuid,
  p_team_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team public.teams;
  v_memberships_deleted integer := 0;
begin
  if not public.is_tpi_trainer() then
    raise exception 'Доступ только для тренера.';
  end if;

  perform 1
  from public.workshops
  where id = p_workshop_id
    and coalesce(is_archived, false) = false
  for update;

  if not found then
    raise exception 'Поток не найден или находится в архиве.';
  end if;

  select *
    into v_team
  from public.teams
  where id = p_team_id
    and workshop_id = p_workshop_id
  for update;

  if not found then
    raise exception 'Команда не найдена в выбранном потоке.';
  end if;

  if v_team.is_archived then
    return jsonb_build_object('ok', true, 'message', 'Команда уже находится в архиве.');
  end if;

  update public.teams
  set is_archived = true,
      archived_at = now(),
      archived_by = auth.uid()
  where id = p_team_id
    and workshop_id = p_workshop_id;

  -- Отвязываем участников, чтобы после обновления они увидели список
  -- доступных команд, а не остались в закрытой рабочей комнате.
  delete from public.team_memberships
  where workshop_id = p_workshop_id
    and team_id = p_team_id;
  get diagnostics v_memberships_deleted = row_count;

  return jsonb_build_object(
    'ok', true,
    'memberships_removed', v_memberships_deleted,
    'message', 'Команда архивирована. Ответы и результаты сохранены.'
  );
end;
$$;

create or replace function public.trainer_restore_team(
  p_workshop_id uuid,
  p_team_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_tpi_trainer() then
    raise exception 'Доступ только для тренера.';
  end if;

  perform 1
  from public.workshops
  where id = p_workshop_id
    and coalesce(is_archived, false) = false;

  if not found then
    raise exception 'Поток не найден или находится в архиве.';
  end if;

  update public.teams
  set is_archived = false,
      archived_at = null,
      archived_by = null
  where id = p_team_id
    and workshop_id = p_workshop_id
    and is_archived = true;

  if not found then
    raise exception 'Архивная команда не найдена.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', 'Команда восстановлена. Участники могут снова выбрать её; сохранённые ответы доступны.'
  );
end;
$$;

-- Расширяем тренерский список: отдельно считаем активные команды и архивные.
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
            and t.is_archived = false
        ),
        'archived_team_count', (
          select count(*)::integer
          from public.teams t
          where t.workshop_id = w.id
            and t.is_archived = true
        ),
        'followup_published_count', (
          select count(*)::integer
          from public.team_followup_results r
          join public.teams t on t.id = r.team_id
          where r.workshop_id = w.id
            and r.is_published = true
            and t.is_archived = false
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

-- В список результатов добавляем признак архива команды.
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
        'is_archived', t.is_archived,
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

revoke all on function public.get_archived_team_ids(text) from public, anon;
revoke all on function public.reject_archived_team_membership() from public, anon, authenticated;
revoke all on function public.trainer_archive_team(uuid, uuid) from public, anon;
revoke all on function public.trainer_restore_team(uuid, uuid) from public, anon;

grant execute on function public.get_archived_team_ids(text) to authenticated;
grant execute on function public.trainer_archive_team(uuid, uuid) to authenticated;
grant execute on function public.trainer_restore_team(uuid, uuid) to authenticated;

-- Realtime для мгновенного обновления списка, если публикация включена.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'teams'
     ) then
    execute 'alter publication supabase_realtime add table public.teams';
  end if;
end;
$$;
