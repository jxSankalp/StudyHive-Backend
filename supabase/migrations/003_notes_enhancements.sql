-- Notes organization metadata used by the upgraded editor.
alter table public.notes
  add column if not exists is_pinned boolean not null default false,
  add column if not exists tags text[] not null default '{}'::text[];

create index if not exists notes_chat_pinned_updated_idx
  on public.notes (chat_id, is_pinned desc, updated_at desc);

alter table public.notes drop constraint if exists notes_tags_limit;
alter table public.notes
  add constraint notes_tags_limit check (cardinality(tags) <= 10);
