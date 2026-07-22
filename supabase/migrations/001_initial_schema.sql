-- =============================================================
-- StudyHive — Full Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → Run
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. PROFILES
--    Mirrors auth.users; auto-populated via trigger on sign-up.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id        UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email     TEXT NOT NULL,
  username  TEXT NOT NULL,
  photo     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: auto-insert a profile row whenever a new auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ──────────────────────────────────────────────────────────────
-- 2. CHATS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chats (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_name           TEXT NOT NULL,
  description         TEXT,
  group_admin_id      UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  latest_message_id   UUID,          -- FK added after messages table (see below)
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- 3. CHAT_MEMBERS  (junction: chat ↔ user)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_members (
  chat_id    UUID NOT NULL REFERENCES public.chats    (id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (chat_id, user_id)
);

-- ──────────────────────────────────────────────────────────────
-- 4. MESSAGES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id    UUID NOT NULL REFERENCES public.chats    (id) ON DELETE CASCADE,
  sender_id  UUID          REFERENCES public.profiles (id) ON DELETE SET NULL,
  content    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Now safe to add the FK from chats → messages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chats_latest_message_id_fkey'
      AND conrelid = 'public.chats'::regclass
  ) THEN
    ALTER TABLE public.chats
      ADD CONSTRAINT chats_latest_message_id_fkey
      FOREIGN KEY (latest_message_id)
      REFERENCES public.messages (id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────
-- 5. MEETINGS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meetings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id        TEXT UNIQUE NOT NULL,
  name           TEXT DEFAULT 'Untitled Room',
  chat_id        UUID NOT NULL REFERENCES public.chats    (id) ON DELETE CASCADE,
  created_by_id  UUID          REFERENCES public.profiles (id) ON DELETE SET NULL,
  status         TEXT DEFAULT 'scheduled' CHECK (status IN ('active', 'scheduled', 'ended')),
  duration       TEXT DEFAULT '30 mins',
  scheduled_at   TIMESTAMPTZ DEFAULT NOW(),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS meetings_call_id_key ON public.meetings (call_id);

-- ──────────────────────────────────────────────────────────────
-- 6. MEETING_PARTICIPANTS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meeting_participants (
  meeting_id  UUID NOT NULL REFERENCES public.meetings (id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  PRIMARY KEY (meeting_id, user_id)
);

-- ──────────────────────────────────────────────────────────────
-- 7. NOTES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  content         TEXT,
  chat_id         UUID NOT NULL REFERENCES public.chats    (id) ON DELETE CASCADE,
  created_by_id   UUID          REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- 8. WHITEBOARDS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whiteboards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  chat_id         UUID NOT NULL REFERENCES public.chats    (id) ON DELETE CASCADE,
  created_by_id   UUID          REFERENCES public.profiles (id) ON DELETE SET NULL,
  data            JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 9. CALENDAR EVENTS
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

-- ──────────────────────────────────────────────────────────────
-- 9. ROW LEVEL SECURITY (RLS)
--    Service-role key bypasses all RLS — these policies only
--    matter if you ever use the anon/user key from the client.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whiteboards        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events    ENABLE ROW LEVEL SECURITY;

-- Profiles: anyone authenticated can read, only self can write
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Chats / members: members can see their own chats
DROP POLICY IF EXISTS "chats_member_select" ON public.chats;
CREATE POLICY "chats_member_select" ON public.chats
  FOR SELECT USING (
    id IN (
      SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "chat_members_select" ON public.chat_members;
CREATE POLICY "chat_members_select" ON public.chat_members
  FOR SELECT USING (user_id = auth.uid());

-- Messages: members of the chat can read
DROP POLICY IF EXISTS "messages_select" ON public.messages;
CREATE POLICY "messages_select" ON public.messages
  FOR SELECT USING (
    chat_id IN (
      SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid()
    )
  );

-- Notes / whiteboards / meetings: same membership check
DROP POLICY IF EXISTS "notes_select" ON public.notes;
CREATE POLICY "notes_select" ON public.notes
  FOR SELECT USING (
    chat_id IN (
      SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "whiteboards_select" ON public.whiteboards;
CREATE POLICY "whiteboards_select" ON public.whiteboards
  FOR SELECT USING (
    chat_id IN (
      SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "meetings_select" ON public.meetings;
CREATE POLICY "meetings_select" ON public.meetings
  FOR SELECT USING (
    chat_id IN (
      SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "meeting_participants_select" ON public.meeting_participants;
CREATE POLICY "meeting_participants_select" ON public.meeting_participants
  FOR SELECT USING (user_id = auth.uid());

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

-- ──────────────────────────────────────────────────────────────
-- Done ✓
-- ──────────────────────────────────────────────────────────────
