BEGIN;

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id        UUID NOT NULL,
  created_by_id  UUID,
  meeting_id     UUID,
  title          TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  description    TEXT CHECK (description IS NULL OR char_length(description) <= 2000),
  location       TEXT CHECK (location IS NULL OR char_length(location) <= 200),
  starts_at      TIMESTAMPTZ NOT NULL,
  ends_at        TIMESTAMPTZ NOT NULL,
  all_day        BOOLEAN NOT NULL DEFAULT FALSE,
  color          TEXT NOT NULL DEFAULT 'indigo'
                 CHECK (color IN ('indigo', 'emerald', 'amber', 'rose', 'sky', 'violet')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT calendar_events_valid_range CHECK (ends_at > starts_at),
  CONSTRAINT calendar_events_chat_id_fkey
    FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE,
  CONSTRAINT calendar_events_created_by_id_fkey
    FOREIGN KEY (created_by_id) REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT calendar_events_meeting_id_fkey
    FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS calendar_events_chat_range_idx
  ON public.calendar_events (chat_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS calendar_events_creator_idx
  ON public.calendar_events (created_by_id);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calendar_events_member_select" ON public.calendar_events;
CREATE POLICY "calendar_events_member_select" ON public.calendar_events
  FOR SELECT USING (
    chat_id IN (
      SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "calendar_events_member_insert" ON public.calendar_events;
CREATE POLICY "calendar_events_member_insert" ON public.calendar_events
  FOR INSERT WITH CHECK (
    created_by_id = auth.uid() AND
    chat_id IN (
      SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "calendar_events_owner_update" ON public.calendar_events;
CREATE POLICY "calendar_events_owner_update" ON public.calendar_events
  FOR UPDATE USING (created_by_id = auth.uid())
  WITH CHECK (created_by_id = auth.uid());

DROP POLICY IF EXISTS "calendar_events_owner_delete" ON public.calendar_events;
CREATE POLICY "calendar_events_owner_delete" ON public.calendar_events
  FOR DELETE USING (created_by_id = auth.uid());

COMMIT;
