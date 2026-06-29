-- EP-043: add mentor-side columns to live_classes
-- join_url made nullable (Zoom sessions don't use it)
-- meeting_id / meeting_passcode for Zoom embed (passcode never returned to client)
-- room_status lifecycle: scheduled → live → ended
-- recording_enabled toggle + recording_url post-session

ALTER TABLE public.live_classes
  ALTER COLUMN join_url DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS meeting_id       text,
  ADD COLUMN IF NOT EXISTS meeting_passcode text,
  ADD COLUMN IF NOT EXISTS room_status      text NOT NULL DEFAULT 'scheduled'
    CHECK (room_status IN ('scheduled', 'live', 'ended')),
  ADD COLUMN IF NOT EXISTS recording_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recording_url    text;
