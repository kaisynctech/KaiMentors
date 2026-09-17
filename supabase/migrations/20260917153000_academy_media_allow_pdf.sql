-- Resources allow PDF (and already allow video). TUS 415'd application/pdf
-- because academy-media's MIME allowlist omitted it.

update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct mime)
  from unnest(
    coalesce(allowed_mime_types, '{}'::text[])
    || array['application/pdf']::text[]
  ) as mime
)
where id = 'academy-media';
