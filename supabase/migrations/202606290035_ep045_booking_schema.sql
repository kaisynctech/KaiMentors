-- EP-045: Booking system foundation
-- 4 new tables: booking_session_types, mentor_availability, availability_overrides, bookings
-- 1 new enum: booking_status

CREATE TYPE booking_status AS ENUM (
  'pending',
  'confirmed',
  'cancelled',
  'completed',
  'no_show'
);

CREATE TABLE public.booking_session_types (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id             uuid        NOT NULL REFERENCES public.traders(id) ON DELETE CASCADE,
  name                  text        NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  description           text        CHECK (char_length(description) <= 500),
  duration_minutes      int         NOT NULL CHECK (duration_minutes IN (15,30,45,60,90,120)),
  max_participants      int         NOT NULL DEFAULT 1 CHECK (max_participants BETWEEN 1 AND 50),
  buffer_minutes        int         NOT NULL DEFAULT 0 CHECK (buffer_minutes IN (0,5,10,15,30)),
  requires_approval     boolean     NOT NULL DEFAULT false,
  advance_booking_days  int         NOT NULL DEFAULT 14 CHECK (advance_booking_days BETWEEN 1 AND 60),
  min_notice_hours      int         NOT NULL DEFAULT 24 CHECK (min_notice_hours BETWEEN 1 AND 72),
  cancellation_hours    int         NOT NULL DEFAULT 12 CHECK (cancellation_hours BETWEEN 0 AND 48),
  zoom_meeting_id       text,
  zoom_passcode         text,
  is_active             boolean     NOT NULL DEFAULT true,
  sort_order            int         NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.mentor_availability (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id     uuid        NOT NULL REFERENCES public.traders(id) ON DELETE CASCADE,
  day_of_week   smallint    NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time    time        NOT NULL,
  end_time      time        NOT NULL,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_window CHECK (end_time > start_time)
);

CREATE TABLE public.availability_overrides (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id       uuid        NOT NULL REFERENCES public.traders(id) ON DELETE CASCADE,
  override_date   date        NOT NULL,
  start_time      time,
  end_time        time,
  is_blocked      boolean     NOT NULL DEFAULT false,
  reason          text        CHECK (char_length(reason) <= 200),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_override CHECK (
    (is_blocked = true AND start_time IS NULL AND end_time IS NULL) OR
    (is_blocked = false AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  )
);

CREATE TABLE public.bookings (
  id                    uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id             uuid            NOT NULL REFERENCES public.traders(id) ON DELETE CASCADE,
  session_type_id       uuid            NOT NULL REFERENCES public.booking_session_types(id) ON DELETE RESTRICT,
  student_user_id       uuid            NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id        uuid            NOT NULL REFERENCES public.student_applications(id) ON DELETE CASCADE,
  starts_at             timestamptz     NOT NULL,
  ends_at               timestamptz     NOT NULL,
  status                booking_status  NOT NULL DEFAULT 'pending',
  student_notes         text            CHECK (char_length(student_notes) <= 500),
  mentor_notes          text            CHECK (char_length(mentor_notes) <= 500),
  cancellation_reason   text            CHECK (char_length(cancellation_reason) <= 300),
  cancelled_by          text            CHECK (cancelled_by IN ('mentor', 'student')),
  live_class_id         uuid            REFERENCES public.live_classes(id) ON DELETE SET NULL,
  reminder_24h_sent_at  timestamptz,
  reminder_1h_sent_at   timestamptz,
  created_at            timestamptz     NOT NULL DEFAULT now(),
  updated_at            timestamptz     NOT NULL DEFAULT now(),
  CONSTRAINT valid_booking_window CHECK (ends_at > starts_at)
);

CREATE INDEX bookings_trader_id_starts_at ON public.bookings(trader_id, starts_at);
CREATE INDEX bookings_student_user_id ON public.bookings(student_user_id);
CREATE INDEX bookings_status ON public.bookings(status);
CREATE INDEX bookings_reminders ON public.bookings(starts_at) WHERE status = 'confirmed';

ALTER TABLE public.booking_session_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant manages session types"
  ON public.booking_session_types FOR ALL
  USING (is_trader_member(trader_id) OR is_super_admin());

CREATE POLICY "verified students read active session types"
  ON public.booking_session_types FOR SELECT
  USING (
    is_active = true AND
    EXISTS (
      SELECT 1 FROM public.student_applications sa
      WHERE sa.student_user_id = auth.uid()
        AND sa.trader_id = booking_session_types.trader_id
        AND sa.status = 'verified'
    )
  );

CREATE POLICY "tenant manages availability"
  ON public.mentor_availability FOR ALL
  USING (is_trader_member(trader_id) OR is_super_admin());

CREATE POLICY "verified students read availability"
  ON public.mentor_availability FOR SELECT
  USING (
    is_active = true AND
    EXISTS (
      SELECT 1 FROM public.student_applications sa
      WHERE sa.student_user_id = auth.uid()
        AND sa.trader_id = mentor_availability.trader_id
        AND sa.status = 'verified'
    )
  );

CREATE POLICY "tenant manages overrides"
  ON public.availability_overrides FOR ALL
  USING (is_trader_member(trader_id) OR is_super_admin());

CREATE POLICY "verified students read overrides"
  ON public.availability_overrides FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.student_applications sa
      WHERE sa.student_user_id = auth.uid()
        AND sa.trader_id = availability_overrides.trader_id
        AND sa.status = 'verified'
    )
  );

CREATE POLICY "tenant sees all bookings"
  ON public.bookings FOR ALL
  USING (is_trader_member(trader_id) OR is_super_admin());

CREATE POLICY "students see own bookings"
  ON public.bookings FOR SELECT
  USING (student_user_id = auth.uid());

CREATE POLICY "students create own bookings"
  ON public.bookings FOR INSERT
  WITH CHECK (student_user_id = auth.uid());

CREATE POLICY "students cancel own bookings"
  ON public.bookings FOR UPDATE
  USING (student_user_id = auth.uid())
  WITH CHECK (student_user_id = auth.uid());
