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
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
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
ALTER TABLE public.chats
  ADD CONSTRAINT chats_latest_message_id_fkey
  FOREIGN KEY (latest_message_id)
  REFERENCES public.messages (id)
  ON DELETE SET NULL
  NOT VALID;           -- NOT VALID skips locking existing rows

-- ──────────────────────────────────────────────────────────────
-- 5. MEETINGS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meetings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id        TEXT NOT NULL,
  name           TEXT DEFAULT 'Untitled Room',
  chat_id        UUID NOT NULL REFERENCES public.chats    (id) ON DELETE CASCADE,
  created_by_id  UUID          REFERENCES public.profiles (id) ON DELETE SET NULL,
  status         TEXT DEFAULT 'scheduled' CHECK (status IN ('active', 'scheduled', 'ended')),
  duration       TEXT DEFAULT '30 mins',
  scheduled_at   TIMESTAMPTZ DEFAULT NOW(),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

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

-- Profiles: anyone authenticated can read, only self can write
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Chats / members: members can see their own chats
CREATE POLICY "chats_member_select" ON public.chats
  FOR SELECT USING (
    id IN (
      SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "chat_members_select" ON public.chat_members
  FOR SELECT USING (user_id = auth.uid());

-- Messages: members of the chat can read
CREATE POLICY "messages_select" ON public.messages
  FOR SELECT USING (
    chat_id IN (
      SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid()
    )
  );

-- Notes / whiteboards / meetings: same membership check
CREATE POLICY "notes_select" ON public.notes
  FOR SELECT USING (
    chat_id IN (
      SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "whiteboards_select" ON public.whiteboards
  FOR SELECT USING (
    chat_id IN (
      SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "meetings_select" ON public.meetings
  FOR SELECT USING (
    chat_id IN (
      SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "meeting_participants_select" ON public.meeting_participants
  FOR SELECT USING (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────────
-- Done ✓
-- ──────────────────────────────────────────────────────────────
