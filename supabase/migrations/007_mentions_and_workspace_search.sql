-- Message mentions and permission-aware full-text workspace search.

create table if not exists public.message_mentions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists message_mentions_user_created_idx
  on public.message_mentions(user_id, created_at desc);

alter table public.message_mentions enable row level security;

drop policy if exists "message_mentions_member_select" on public.message_mentions;
create policy "message_mentions_member_select" on public.message_mentions for select to authenticated
using (
  exists (
    select 1 from public.messages message
    join public.chat_members member on member.chat_id = message.chat_id
    where message.id = message_mentions.message_id and member.user_id = auth.uid()
  )
);

alter table public.messages
  add column if not exists search_document tsvector
  generated always as (to_tsvector('english', coalesce(content, ''))) stored;
alter table public.notes
  add column if not exists search_document tsvector
  generated always as (
    to_tsvector('english', coalesce(name, '') || ' ' || regexp_replace(coalesce(content, ''), '<[^>]+>', ' ', 'g'))
  ) stored;
alter table public.tasks
  add column if not exists search_document tsvector
  generated always as (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))) stored;
alter table public.meetings
  add column if not exists search_document tsvector
  generated always as (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))) stored;

create index if not exists messages_search_document_idx on public.messages using gin(search_document);
create index if not exists notes_search_document_idx on public.notes using gin(search_document);
create index if not exists tasks_search_document_idx on public.tasks using gin(search_document);
create index if not exists meetings_search_document_idx on public.meetings using gin(search_document);

create or replace function public.search_workspace(
  p_chat_id uuid,
  p_user_id uuid,
  p_query text,
  p_types text[] default null,
  p_limit integer default 20,
  p_cursor_rank double precision default null,
  p_cursor_at timestamptz default null,
  p_cursor_type text default null,
  p_cursor_id text default null
)
returns table (
  resource_type text,
  id text,
  title text,
  snippet text,
  occurred_at timestamptz,
  rank double precision
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  search_query tsquery;
  result_limit integer;
begin
  if not exists (
    select 1 from public.chat_members
    where chat_id = p_chat_id and user_id = p_user_id
  ) then
    raise exception 'workspace access denied' using errcode = '42501';
  end if;

  if p_query is null or char_length(trim(p_query)) < 2 then
    raise exception 'search query must contain at least two characters' using errcode = '22023';
  end if;

  if p_types is not null and exists (
    select 1 from unnest(p_types) item
    where item not in ('message', 'note', 'task', 'meeting')
  ) then
    raise exception 'invalid search resource type' using errcode = '22023';
  end if;

  search_query := websearch_to_tsquery('english', trim(p_query));
  result_limit := least(greatest(coalesce(p_limit, 20), 1), 50);

  return query
  with combined as (
    select
      'message'::text as resource_type,
      message.id::text as id,
      ('Message from ' || coalesce(profile.username, 'Former member'))::text as title,
      ts_headline(
        'english', coalesce(message.content, ''), search_query,
        'StartSel=<mark>, StopSel=</mark>, MaxWords=28, MinWords=8, ShortWord=3'
      )::text as snippet,
      message.created_at as occurred_at,
      ts_rank_cd(message.search_document, search_query)::double precision as rank
    from public.messages message
    left join public.profiles profile on profile.id = message.sender_id
    where message.chat_id = p_chat_id
      and message.deleted_at is null
      and message.search_document @@ search_query

    union all

    select
      'note'::text,
      note.id::text,
      note.name::text,
      ts_headline(
        'english', regexp_replace(coalesce(note.content, ''), '<[^>]+>', ' ', 'g'), search_query,
        'StartSel=<mark>, StopSel=</mark>, MaxWords=28, MinWords=8, ShortWord=3'
      )::text,
      note.updated_at,
      ts_rank_cd(note.search_document, search_query)::double precision
    from public.notes note
    where note.chat_id = p_chat_id and note.search_document @@ search_query

    union all

    select
      'task'::text,
      task.id::text,
      task.title::text,
      ts_headline(
        'english', coalesce(task.description, task.title), search_query,
        'StartSel=<mark>, StopSel=</mark>, MaxWords=28, MinWords=8, ShortWord=3'
      )::text,
      task.updated_at,
      ts_rank_cd(task.search_document, search_query)::double precision
    from public.tasks task
    where task.chat_id = p_chat_id and task.search_document @@ search_query

    union all

    select
      'meeting'::text,
      meeting.call_id::text,
      coalesce(meeting.name, 'Untitled meeting')::text,
      ts_headline(
        'english', coalesce(meeting.description, meeting.name, ''), search_query,
        'StartSel=<mark>, StopSel=</mark>, MaxWords=28, MinWords=8, ShortWord=3'
      )::text,
      coalesce(meeting.scheduled_at, meeting.created_at),
      ts_rank_cd(meeting.search_document, search_query)::double precision
    from public.meetings meeting
    where meeting.chat_id = p_chat_id and meeting.search_document @@ search_query
  )
  select combined.resource_type, combined.id, combined.title, combined.snippet,
    combined.occurred_at, combined.rank
  from combined
  where (p_types is null or combined.resource_type = any(p_types))
    and (
      p_cursor_rank is null
      or (combined.rank, combined.occurred_at, combined.resource_type, combined.id)
        < (p_cursor_rank, p_cursor_at, p_cursor_type, p_cursor_id)
    )
  order by combined.rank desc, combined.occurred_at desc, combined.resource_type desc, combined.id desc
  limit result_limit + 1;
end;
$$;

revoke all on function public.search_workspace(uuid, uuid, text, text[], integer, double precision, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.search_workspace(uuid, uuid, text, text[], integer, double precision, timestamptz, text, text) to service_role;
