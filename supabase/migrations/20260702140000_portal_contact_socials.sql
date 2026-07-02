ALTER TABLE public.portals
  ADD COLUMN IF NOT EXISTS contact_phone TEXT
    CONSTRAINT portals_contact_phone_length
      CHECK (contact_phone IS NULL OR char_length(contact_phone) <= 32),
  ADD COLUMN IF NOT EXISTS facebook_url TEXT
    CONSTRAINT portals_facebook_url_length
      CHECK (facebook_url IS NULL OR char_length(facebook_url) <= 500),
  ADD COLUMN IF NOT EXISTS youtube_url TEXT
    CONSTRAINT portals_youtube_url_length
      CHECK (youtube_url IS NULL OR char_length(youtube_url) <= 500),
  ADD COLUMN IF NOT EXISTS twitter_url TEXT
    CONSTRAINT portals_twitter_url_length
      CHECK (twitter_url IS NULL OR char_length(twitter_url) <= 500),
  ADD COLUMN IF NOT EXISTS tiktok_url TEXT
    CONSTRAINT portals_tiktok_url_length
      CHECK (tiktok_url IS NULL OR char_length(tiktok_url) <= 500),
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT
    CONSTRAINT portals_linkedin_url_length
      CHECK (linkedin_url IS NULL OR char_length(linkedin_url) <= 500);
