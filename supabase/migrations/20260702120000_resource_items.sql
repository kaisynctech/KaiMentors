-- EP-062: Resource items — standalone content published by mentors
CREATE TABLE resource_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id       UUID        NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  title           TEXT        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description     TEXT        CHECK (char_length(description) <= 1000),
  type            TEXT        NOT NULL CHECK (type IN ('video', 'pdf', 'link')),
  storage_path    TEXT,
  external_url    TEXT,
  thumbnail_path  TEXT,
  labels          TEXT[]      NOT NULL DEFAULT '{}',
  access_scope    TEXT        NOT NULL DEFAULT 'all_verified'
                              CHECK (access_scope IN ('all_students', 'all_verified')),
  status          TEXT        NOT NULL DEFAULT 'published'
                              CHECK (status IN ('draft', 'published')),
  sort_order      INT         NOT NULL DEFAULT 0,
  created_by      UUID        NOT NULL REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX resource_items_trader_idx  ON resource_items (trader_id);
CREATE INDEX resource_items_labels_idx  ON resource_items USING GIN (labels);
CREATE INDEX resource_items_created_idx ON resource_items (trader_id, created_at DESC);

ALTER TABLE resource_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mentors_all_resource_items"
  ON resource_items
  FOR ALL
  USING  (is_trader_member(trader_id))
  WITH CHECK (is_trader_member(trader_id));

CREATE POLICY "students_select_resource_items"
  ON resource_items
  FOR SELECT
  USING (
    status = 'published'
    AND (
      (
        access_scope = 'all_students'
        AND EXISTS (
          SELECT 1 FROM student_applications sa
          WHERE sa.trader_id       = resource_items.trader_id
            AND sa.student_user_id = auth.uid()
        )
      )
      OR (
        access_scope = 'all_verified'
        AND EXISTS (
          SELECT 1 FROM student_applications sa
          WHERE sa.trader_id       = resource_items.trader_id
            AND sa.student_user_id = auth.uid()
            AND sa.status          = 'verified'
        )
      )
    )
  );
