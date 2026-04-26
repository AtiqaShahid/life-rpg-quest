-- 1) Extend quest_status enum
ALTER TYPE public.quest_status ADD VALUE IF NOT EXISTS 'locked';
ALTER TYPE public.quest_status ADD VALUE IF NOT EXISTS 'candidate';
ALTER TYPE public.quest_status ADD VALUE IF NOT EXISTS 'discarded';

-- 2) New columns on quests
ALTER TABLE public.quests
  ADD COLUMN IF NOT EXISTS is_compulsory BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS slot_index INTEGER,
  ADD COLUMN IF NOT EXISTS selection_group UUID;

CREATE INDEX IF NOT EXISTS idx_quests_user_status ON public.quests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_quests_user_slot ON public.quests(user_id, quest_type, slot_index);
CREATE INDEX IF NOT EXISTS idx_quests_user_group ON public.quests(user_id, selection_group);
