begin;

-- Some deployed projects added reply_to_id manually before migration 004.
-- ADD COLUMN IF NOT EXISTS then skipped the inline REFERENCES clause, leaving
-- PostgREST without a relationship and the database without referential
-- integrity. Repair the constraint without blocking on legacy bad rows.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_reply_to_id_fkey'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_reply_to_id_fkey
      foreign key (reply_to_id) references public.messages(id)
      on delete set null not valid;
  end if;
end $$;

-- Ask PostgREST to refresh its relationship cache after the DDL change.
notify pgrst, 'reload schema';

commit;
