-- EP-059: Community feature — gallery albums, gallery items, trade posts, likes
-- ─── Enum ────────────────────────────────────────────────────────────────────
CREATE TYPE gallery_item_type AS ENUM ('photo', 'video_upload', 'video_link');

-- ─── Tables ──────────────────────────────────────────────────────────────────
CREATE TABLE public.gallery_albums (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id   uuid        NOT NULL REFERENCES public.traders(id) ON DELETE CASCADE,
  title       text        NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  description text        CHECK (char_length(description) <= 500),
  cover_path  text,
  sort_order  int         NOT NULL DEFAULT 0,
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.gallery_items (
  id          uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id   uuid               NOT NULL REFERENCES public.traders(id) ON DELETE CASCADE,
  album_id    uuid               NOT NULL REFERENCES public.gallery_albums(id) ON DELETE CASCADE,
  type        gallery_item_type  NOT NULL,
  file_path   text,
  video_url   text               CHECK (char_length(video_url) <= 500),
  caption     text               CHECK (char_length(caption) <= 300),
  sort_order  int                NOT NULL DEFAULT 0,
  created_by  uuid               REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz        NOT NULL DEFAULT now(),
  CONSTRAINT valid_media CHECK (
    (type = 'video_link'   AND video_url IS NOT NULL AND file_path IS NULL) OR
    (type IN ('photo', 'video_upload') AND file_path IS NOT NULL AND video_url IS NULL)
  )
);

CREATE TABLE public.trade_posts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id   uuid        NOT NULL REFERENCES public.traders(id) ON DELETE CASCADE,
  body        text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  image_path  text,
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.community_likes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trader_id   uuid        NOT NULL REFERENCES public.traders(id) ON DELETE CASCADE,
  target_type text        NOT NULL CHECK (target_type IN ('gallery_item', 'trade_post')),
  target_id   uuid        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_type, target_id)
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX gallery_albums_trader_id     ON public.gallery_albums(trader_id, sort_order);
CREATE INDEX gallery_items_album_id       ON public.gallery_items(album_id, sort_order);
CREATE INDEX gallery_items_trader_id      ON public.gallery_items(trader_id);
CREATE INDEX trade_posts_trader_id        ON public.trade_posts(trader_id, created_at DESC);
CREATE INDEX community_likes_target       ON public.community_likes(target_type, target_id);
CREATE INDEX community_likes_user         ON public.community_likes(user_id, trader_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.gallery_albums   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_posts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_likes  ENABLE ROW LEVEL SECURITY;

-- gallery_albums ──────────────────────────────────────────────────────────────
CREATE POLICY "mentors manage gallery albums"
  ON public.gallery_albums FOR ALL
  USING (is_trader_member(trader_id) OR is_super_admin());

CREATE POLICY "academy members view gallery albums"
  ON public.gallery_albums FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.student_applications sa
      WHERE sa.student_user_id = auth.uid()
        AND sa.trader_id = gallery_albums.trader_id
    )
  );

-- gallery_items ───────────────────────────────────────────────────────────────
CREATE POLICY "mentors manage gallery items"
  ON public.gallery_items FOR ALL
  USING (is_trader_member(trader_id) OR is_super_admin());

CREATE POLICY "academy members view gallery items"
  ON public.gallery_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.student_applications sa
      WHERE sa.student_user_id = auth.uid()
        AND sa.trader_id = gallery_items.trader_id
    )
  );

-- trade_posts ─────────────────────────────────────────────────────────────────
CREATE POLICY "mentors manage trade posts"
  ON public.trade_posts FOR ALL
  USING (is_trader_member(trader_id) OR is_super_admin());

CREATE POLICY "academy members view trade posts"
  ON public.trade_posts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.student_applications sa
      WHERE sa.student_user_id = auth.uid()
        AND sa.trader_id = trade_posts.trader_id
    )
  );

-- community_likes ─────────────────────────────────────────────────────────────
CREATE POLICY "academy members manage own likes"
  ON public.community_likes FOR ALL
  USING (
    user_id = auth.uid()
    AND (
      is_trader_member(trader_id)
      OR EXISTS (
        SELECT 1 FROM public.student_applications sa
        WHERE sa.student_user_id = auth.uid()
          AND sa.trader_id = community_likes.trader_id
      )
    )
  );

CREATE POLICY "mentors view workspace likes"
  ON public.community_likes FOR SELECT
  USING (is_trader_member(trader_id) OR is_super_admin());
