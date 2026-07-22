begin;

-- Message pagination needs a deterministic compound cursor. UUID is the
-- tie-breaker when multiple messages share the same timestamp.
create index if not exists messages_chat_created_id_idx
  on public.messages (chat_id, created_at desc, id desc);

-- Private chat file metadata. Object bytes live in the private Storage bucket;
-- only short-lived signed URLs leave the backend.
create table if not exists public.chat_files (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  uploader_id uuid references public.profiles(id) on delete set null,
  message_id uuid references public.messages(id) on delete cascade,
  bucket text not null default 'chat-files' check (bucket = 'chat-files'),
  storage_path text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 180),
  mime_type text not null check (char_length(mime_type) between 1 and 120),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  status text not null default 'pending' check (status in ('pending', 'ready')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chat_files_message_idx on public.chat_files(message_id) where message_id is not null;
create index if not exists chat_files_pending_idx on public.chat_files(created_at) where status = 'pending';

-- One monotonic read watermark per user/workspace. The timestamp powers unread
-- counts; the message id is retained for audit/UI anchoring.
create table if not exists public.chat_read_state (
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  last_read_message_id uuid references public.messages(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);
create index if not exists chat_read_state_user_idx on public.chat_read_state(user_id, last_read_at desc);

-- Close the audit finding: every collaboration table exposed through the
-- public Supabase schema has RLS enabled. The application writes through the
-- service-role backend; direct clients receive only narrowly scoped reads.
alter table public.tasks enable row level security;
alter table public.notifications enable row level security;
alter table public.message_reactions enable row level security;
alter table public.chat_files enable row level security;
alter table public.chat_read_state enable row level security;

drop policy if exists "tasks_member_select" on public.tasks;
create policy "tasks_member_select" on public.tasks for select to authenticated
using (exists (
  select 1 from public.chat_members cm
  where cm.chat_id = tasks.chat_id and cm.user_id = auth.uid()
));

drop policy if exists "notifications_owner_select" on public.notifications;
create policy "notifications_owner_select" on public.notifications for select to authenticated
using (user_id = auth.uid());

drop policy if exists "notifications_owner_update" on public.notifications;
create policy "notifications_owner_update" on public.notifications for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
-- If direct access is ever used, an authenticated user may acknowledge only
-- their own notification; they cannot rewrite its title/body/entity fields.
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

drop policy if exists "message_reactions_member_select" on public.message_reactions;
create policy "message_reactions_member_select" on public.message_reactions for select to authenticated
using (exists (
  select 1 from public.messages m
  join public.chat_members cm on cm.chat_id = m.chat_id
  where m.id = message_reactions.message_id and cm.user_id = auth.uid()
));

drop policy if exists "chat_files_member_select" on public.chat_files;
create policy "chat_files_member_select" on public.chat_files for select to authenticated
using (status = 'ready' and exists (
  select 1 from public.chat_members cm
  where cm.chat_id = chat_files.chat_id and cm.user_id = auth.uid()
));

drop policy if exists "chat_read_state_member_select" on public.chat_read_state;
create policy "chat_read_state_member_select" on public.chat_read_state for select to authenticated
using (exists (
  select 1 from public.chat_members cm
  where cm.chat_id = chat_read_state.chat_id and cm.user_id = auth.uid()
));

-- Keep unread aggregation in Postgres instead of issuing an N+1 count query
-- from the API for every workspace.
create or replace function public.get_user_chat_unread_counts(p_user_id uuid)
returns table(chat_id uuid, unread_count bigint, last_read_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select cm.chat_id,
         count(m.id) filter (
           where m.sender_id is distinct from p_user_id
             and m.deleted_at is null
             and m.created_at > coalesce(crs.last_read_at, 'epoch'::timestamptz)
         )::bigint as unread_count,
         crs.last_read_at
  from public.chat_members cm
  left join public.chat_read_state crs
    on crs.chat_id = cm.chat_id and crs.user_id = cm.user_id
  left join public.messages m on m.chat_id = cm.chat_id
  where cm.user_id = p_user_id
  group by cm.chat_id, crs.last_read_at;
$$;
revoke all on function public.get_user_chat_unread_counts(uuid) from public, anon, authenticated;
grant execute on function public.get_user_chat_unread_counts(uuid) to service_role;

-- Atomically advance (never regress) a read watermark. The backend passes the
-- authenticated user id and this function independently verifies membership.
create or replace function public.mark_chat_read(p_chat_id uuid, p_user_id uuid, p_message_id uuid default null)
returns table(chat_id uuid, user_id uuid, last_read_at timestamptz, last_read_message_id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  target_time timestamptz;
begin
  if not exists (
    select 1 from public.chat_members cm
    where cm.chat_id = p_chat_id and cm.user_id = p_user_id
  ) then
    raise exception 'workspace membership required' using errcode = '42501';
  end if;

  if p_message_id is null then
    select m.id, m.created_at into target_id, target_time
    from public.messages m where m.chat_id = p_chat_id
    order by m.created_at desc, m.id desc limit 1;
  else
    select m.id, m.created_at into target_id, target_time
    from public.messages m where m.chat_id = p_chat_id and m.id = p_message_id;
    if target_id is null then raise exception 'message not found in workspace' using errcode = '22023'; end if;
  end if;

  target_time := coalesce(target_time, now());
  insert into public.chat_read_state as crs (chat_id, user_id, last_read_at, last_read_message_id, updated_at)
  values (p_chat_id, p_user_id, target_time, target_id, now())
  on conflict (chat_id, user_id) do update set
    last_read_at = greatest(crs.last_read_at, excluded.last_read_at),
    last_read_message_id = case when excluded.last_read_at >= crs.last_read_at then excluded.last_read_message_id else crs.last_read_message_id end,
    updated_at = now();

  return query select s.chat_id, s.user_id, s.last_read_at, s.last_read_message_id, s.updated_at
  from public.chat_read_state s where s.chat_id = p_chat_id and s.user_id = p_user_id;
end;
$$;
revoke all on function public.mark_chat_read(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_chat_read(uuid, uuid, uuid) to service_role;

-- Private Storage bucket. Signed upload/download URLs are created only after
-- backend membership and metadata validation.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-files',
  'chat-files',
  false,
  10485760,
  array[
    'image/jpeg','image/png','image/webp','image/gif',
    'application/pdf','text/plain','text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
