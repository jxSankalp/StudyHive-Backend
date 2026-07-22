-- Collaboration upgrade: roles, scheduled meetings, notifications, tasks, and richer messages.

alter table public.chat_members
  add column if not exists role text not null default 'member';

update public.chat_members cm
set role = 'owner'
from public.chats c
where cm.chat_id = c.id and cm.user_id = c.group_admin_id;

alter table public.chat_members drop constraint if exists chat_members_role_check;
alter table public.chat_members
  add constraint chat_members_role_check check (role in ('owner', 'admin', 'member'));

create index if not exists chat_members_chat_role_idx on public.chat_members(chat_id, role);

alter table public.meetings
  add column if not exists description text,
  add column if not exists duration_minutes integer not null default 30;

alter table public.meetings drop constraint if exists meetings_description_length;
alter table public.meetings add constraint meetings_description_length
  check (description is null or char_length(description) <= 2000);
alter table public.meetings drop constraint if exists meetings_duration_minutes_range;
alter table public.meetings add constraint meetings_duration_minutes_range
  check (duration_minutes between 15 and 480);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat_id uuid references public.chats(id) on delete cascade,
  type text not null check (type in ('meeting_scheduled','task_assigned','message_mention','system')),
  title text not null check (char_length(title) between 1 and 160),
  body text check (body is null or char_length(body) <= 1000),
  entity_type text,
  entity_id text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_unread_idx on public.notifications(user_id, read_at, created_at desc);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  description text check (description is null or char_length(description) <= 4000),
  status text not null default 'todo' check (status in ('todo','in_progress','done')),
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  due_at timestamptz,
  assignee_id uuid references public.profiles(id) on delete set null,
  created_by_id uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_chat_status_due_idx on public.tasks(chat_id, status, due_at);
create index if not exists tasks_assignee_idx on public.tasks(assignee_id, status);

alter table public.messages
  add column if not exists reply_to_id uuid references public.messages(id) on delete set null,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index if not exists message_reactions_message_idx on public.message_reactions(message_id);
