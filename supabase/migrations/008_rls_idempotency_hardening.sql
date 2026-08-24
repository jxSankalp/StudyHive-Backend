begin;

-- Migration 005 first enabled these tables. Re-declare the intended policies
-- here so environments that skipped or partially applied 005 converge on the
-- same deny-by-default posture.
alter table public.tasks enable row level security;
alter table public.notifications enable row level security;
alter table public.message_reactions enable row level security;

drop policy if exists "tasks_member_select" on public.tasks;
create policy "tasks_member_select" on public.tasks for select to authenticated
using (exists (
  select 1 from public.chat_members member
  where member.chat_id = tasks.chat_id and member.user_id = auth.uid()
));

drop policy if exists "notifications_owner_select" on public.notifications;
create policy "notifications_owner_select" on public.notifications for select to authenticated
using (user_id = auth.uid());

drop policy if exists "notifications_owner_update" on public.notifications;
create policy "notifications_owner_update" on public.notifications for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "message_reactions_member_select" on public.message_reactions;
create policy "message_reactions_member_select" on public.message_reactions for select to authenticated
using (exists (
  select 1 from public.messages message
  join public.chat_members member on member.chat_id = message.chat_id
  where message.id = message_reactions.message_id and member.user_id = auth.uid()
));

-- Application mutations use the backend service-role client. Direct anon and
-- authenticated clients receive no mutation grants except acknowledging their
-- own notification's read_at field through its ownership policy.
revoke all on public.tasks from anon;
revoke all on public.notifications from anon;
revoke all on public.message_reactions from anon;
revoke insert, update, delete on public.tasks from authenticated;
revoke insert, delete on public.notifications from authenticated;
revoke insert, update, delete on public.message_reactions from authenticated;
revoke update on public.notifications from authenticated;
grant select on public.tasks, public.notifications, public.message_reactions to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Idempotency key supplied by the client and scoped to the authenticated
-- sender. Existing messages remain valid with a null key.
alter table public.messages add column if not exists client_message_id uuid;
create unique index if not exists messages_sender_client_message_id_uidx
  on public.messages(sender_id, client_message_id)
  where sender_id is not null and client_message_id is not null;

commit;
