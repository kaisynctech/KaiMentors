-- Sharesworldwide: make /apply open the Verify page.
-- The site's Next.js redirect is ignored in a static export, and the app never
-- reads custom_site_route_rules, so /apply returned 404 on the custom domain.
-- A manifest page that reuses verify.html is the mechanism the renderer honours.
-- Only the bandi-shares package is touched.

update public.custom_site_packages pk
set manifest = jsonb_set(
  pk.manifest,
  '{pages}',
  (
    select jsonb_agg(page order by ord)
    from (
      select page, ord * 10 as ord
      from jsonb_array_elements(pk.manifest->'pages') with ordinality as p(page, ord)
      union all
      select jsonb_build_object(
               'slug', 'apply',
               'file', 'verify.html',
               'label', 'Apply',
               'path', '/apply'
             ),
             (
               select ord * 10 - 5
               from jsonb_array_elements(pk.manifest->'pages') with ordinality as v(page, ord)
               where v.page->>'slug' = 'verify'
             )
    ) pages
  )
)
where pk.package_key = 'bandi-shares'
  and not exists (
    select 1 from jsonb_array_elements(pk.manifest->'pages') p
    where p->>'slug' = 'apply'
  );
