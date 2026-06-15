create table public.website_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique
    check (template_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  description text not null,
  thumbnail_path text,
  category text not null,
  is_active boolean not null default true,
  version integer not null default 1 check (version > 0),
  blueprint jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.website_pages (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  portal_id uuid not null references public.portals(id) on delete cascade,
  slug text not null check (
    slug = 'home' or slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  title text not null,
  description text,
  sort_order integer not null default 0,
  is_home boolean not null default false,
  is_enabled boolean not null default true,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (portal_id, slug),
  unique (id, trader_id),
  foreign key (portal_id, trader_id)
    references public.portals(id, trader_id) on delete cascade
);

create unique index website_pages_one_home_idx
  on public.website_pages (portal_id)
  where is_home;

create table public.website_sections (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  page_id uuid not null,
  section_key text not null,
  section_type text not null check (
    section_type in (
      'hero',
      'about',
      'features',
      'courses',
      'testimonials',
      'community',
      'cta',
      'faq',
      'contact',
      'join_academy'
    )
  ),
  variant text not null default 'default',
  content jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (page_id, section_key),
  foreign key (page_id, trader_id)
    references public.website_pages(id, trader_id) on delete cascade
);

create table public.website_theme_settings (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null unique references public.traders(id) on delete cascade,
  portal_id uuid not null unique references public.portals(id) on delete cascade,
  template_id uuid not null references public.website_templates(id) on delete restrict,
  logo_path text,
  hero_image_path text,
  primary_color text not null default '#111315'
    check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text not null default '#D8FF59'
    check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  background_color text not null default '#FFFFFF'
    check (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  surface_color text not null default '#F3F5F6'
    check (surface_color ~ '^#[0-9A-Fa-f]{6}$'),
  text_color text not null default '#111315'
    check (text_color ~ '^#[0-9A-Fa-f]{6}$'),
  heading_font text not null default 'Inter',
  body_font text not null default 'Inter',
  social_links jsonb not null default '{}'::jsonb,
  custom_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (portal_id, trader_id)
    references public.portals(id, trader_id) on delete cascade
);

create table public.website_media (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  portal_id uuid not null references public.portals(id) on delete cascade,
  storage_path text not null unique,
  media_type text not null check (media_type in ('logo', 'hero', 'image')),
  alt_text text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (portal_id, trader_id)
    references public.portals(id, trader_id) on delete cascade
);

create table public.website_navigation (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  portal_id uuid not null references public.portals(id) on delete cascade,
  page_id uuid,
  label text not null,
  href text,
  location text not null default 'header'
    check (location in ('header', 'footer')),
  sort_order integer not null default 0,
  is_enabled boolean not null default true,
  open_in_new_tab boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (portal_id, trader_id)
    references public.portals(id, trader_id) on delete cascade,
  foreign key (page_id, trader_id)
    references public.website_pages(id, trader_id) on delete cascade
);

create index website_pages_portal_sort_idx
  on public.website_pages (portal_id, sort_order);
create index website_sections_page_sort_idx
  on public.website_sections (page_id, sort_order);
create index website_navigation_portal_location_sort_idx
  on public.website_navigation (portal_id, location, sort_order);
create index website_media_portal_created_idx
  on public.website_media (portal_id, created_at desc);

insert into public.website_templates (
  template_key,
  name,
  description,
  category,
  version,
  blueprint
)
values
(
  'professional-academy',
  'Professional Academy',
  'A polished, trust-led academy website for structured education and verified communities.',
  'academy',
  1,
  $json$
  {
    "theme": {
      "primaryColor": "#111315",
      "accentColor": "#D8FF59",
      "backgroundColor": "#FFFFFF",
      "surfaceColor": "#F3F5F6",
      "textColor": "#111315",
      "headingFont": "Inter",
      "bodyFont": "Inter"
    },
    "pages": [
      {
        "slug": "home",
        "title": "Home",
        "isHome": true,
        "sections": [
          {"key":"hero","type":"hero","variant":"split","content":{"eyebrow":"Trading education with standards","title":"Build confidence. Trade with a plan.","body":"Practical education, private resources, and a verified community designed to help traders improve with structure.","primaryCta":"Join Academy","secondaryCta":"Explore Courses"}},
          {"key":"why-join","type":"features","variant":"cards","content":{"eyebrow":"Why join","title":"A professional environment built for progress.","body":"Learn with a clear path and the support to stay consistent.","items":["Structured video courses","Live market education","Verified student community"]}},
          {"key":"testimonials","type":"testimonials","variant":"grid","content":{"eyebrow":"Student results","title":"Trusted by ambitious traders.","items":["The structure helped me stop guessing and start following a process.","I finally found a community focused on learning, not hype.","The course library makes every lesson easy to revisit."]}},
          {"key":"community","type":"community","variant":"panel","content":{"eyebrow":"Community","title":"Learn alongside traders who take growth seriously.","body":"Join conversations, live sessions, and a private learning environment shaped by your mentor."}},
          {"key":"final-cta","type":"cta","variant":"band","content":{"eyebrow":"Ready to begin?","title":"Join the academy and start learning with purpose.","body":"Create your student account and complete verification to unlock the private academy.","buttonText":"Join Academy"}}
        ]
      },
      {"slug":"about","title":"About","sections":[{"key":"about","type":"about","variant":"editorial","content":{"eyebrow":"About the academy","title":"Education built around clarity, discipline, and long-term growth.","body":"Share your academy story, teaching philosophy, and the experience students can expect."}}]},
      {"slug":"why-join","title":"Why Join","sections":[{"key":"features","type":"features","variant":"cards","content":{"eyebrow":"Why join","title":"Everything students need to learn with confidence.","items":["A structured learning path","Practical mentor guidance","A focused private community","Secure verified access"]}}]},
      {"slug":"courses","title":"Courses","sections":[{"key":"courses","type":"courses","variant":"grid","content":{"eyebrow":"Course library","title":"Learn at your pace. Apply with confidence.","body":"Published courses from your academy appear here automatically."}}]},
      {"slug":"testimonials","title":"Testimonials","sections":[{"key":"testimonials","type":"testimonials","variant":"grid","content":{"eyebrow":"Testimonials","title":"What students say about the academy.","items":["Add a student success story.","Add another student experience.","Add a result that builds trust."]}}]},
      {"slug":"community","title":"Community","sections":[{"key":"community","type":"community","variant":"panel","content":{"eyebrow":"Community","title":"A private space for serious traders.","body":"Explain how students connect, learn, and receive support inside your academy."}}]},
      {"slug":"faq","title":"FAQ","sections":[{"key":"faq","type":"faq","variant":"list","content":{"eyebrow":"Frequently asked questions","title":"Everything you need to know before joining.","items":["Who is this academy for?|This academy is for traders who want structured education and community support.","How do I access the courses?|Create an account, complete verification, and sign in to your student portal.","Can beginners join?|Yes. Courses can support students from foundational concepts through advanced execution."]}}]},
      {"slug":"contact","title":"Contact","sections":[{"key":"contact","type":"contact","variant":"split","content":{"eyebrow":"Contact","title":"Start a conversation with the academy.","body":"Use the academy social channels or send an enquiry to learn more."}}]},
      {"slug":"join-academy","title":"Join Academy","sections":[{"key":"join","type":"join_academy","variant":"form","content":{"eyebrow":"Student application","title":"Verify once. Learn privately.","body":"Create your student account and provide your broker account details to apply for access."}}]}
    ]
  }
  $json$::jsonb
),
(
  'luxury-trader',
  'Luxury Trader',
  'An editorial, high-touch presentation for premium mentorship brands and exclusive communities.',
  'premium',
  1,
  $json$
  {
    "theme": {
      "primaryColor": "#191713",
      "accentColor": "#C8A96B",
      "backgroundColor": "#FFFEFA",
      "surfaceColor": "#F3EEE4",
      "textColor": "#191713",
      "headingFont": "Georgia",
      "bodyFont": "Inter"
    },
    "pages": [
      {
        "slug":"home",
        "title":"Home",
        "isHome":true,
        "sections":[
          {"key":"hero","type":"hero","variant":"editorial","content":{"eyebrow":"Private trading mentorship","title":"Refine your edge. Elevate your execution.","body":"A premium academy experience for traders committed to precision, discipline, and sustainable performance.","primaryCta":"Request Access","secondaryCta":"Discover the Academy"}},
          {"key":"about","type":"about","variant":"editorial","content":{"eyebrow":"The academy","title":"A considered approach to becoming a more complete trader.","body":"Combine technical education, market context, and personal accountability in one focused environment."}},
          {"key":"testimonials","type":"testimonials","variant":"quotes","content":{"eyebrow":"Member perspective","title":"A standard of education students can feel.","items":["A more thoughtful way to learn and trade.","The mentorship feels personal, focused, and genuinely premium.","Every detail supports better decision-making."]}},
          {"key":"final-cta","type":"cta","variant":"band","content":{"eyebrow":"Private membership","title":"Your next level begins with a stronger process.","body":"Apply to join the academy and access its private learning environment.","buttonText":"Request Access"}}
        ]
      },
      {"slug":"about","title":"About","sections":[{"key":"about","type":"about","variant":"editorial","content":{"eyebrow":"Our philosophy","title":"Trading excellence is built deliberately.","body":"Introduce your experience, standards, and the philosophy behind your mentorship."}}]},
      {"slug":"why-join","title":"Why Join","sections":[{"key":"features","type":"features","variant":"minimal","content":{"eyebrow":"Membership","title":"Designed for traders who value depth.","items":["Curated education","Private mentor access","Focused community","Premium learning experience"]}}]},
      {"slug":"courses","title":"Courses","sections":[{"key":"courses","type":"courses","variant":"editorial","content":{"eyebrow":"Curriculum","title":"A considered path from knowledge to execution.","body":"Published academy programmes appear here automatically."}}]},
      {"slug":"testimonials","title":"Testimonials","sections":[{"key":"testimonials","type":"testimonials","variant":"quotes","content":{"eyebrow":"Member stories","title":"Progress, in their own words.","items":["Add a premium student testimonial.","Add a transformation story.","Add a statement of trust."]}}]},
      {"slug":"community","title":"Community","sections":[{"key":"community","type":"community","variant":"editorial","content":{"eyebrow":"Private community","title":"Surround yourself with higher standards.","body":"Describe the conversations, sessions, and support available to members."}}]},
      {"slug":"faq","title":"FAQ","sections":[{"key":"faq","type":"faq","variant":"list","content":{"eyebrow":"Enquiries","title":"Before you apply.","items":["Who is membership designed for?|For traders committed to developing a professional process.","How is access approved?|Applicants complete account and broker verification before private access is granted.","What is included?|Your curriculum, resources, live education, and community access are managed in one place."]}}]},
      {"slug":"contact","title":"Contact","sections":[{"key":"contact","type":"contact","variant":"editorial","content":{"eyebrow":"Private enquiries","title":"Speak with the academy.","body":"Connect through the academy social channels for membership enquiries."}}]},
      {"slug":"join-academy","title":"Join Academy","sections":[{"key":"join","type":"join_academy","variant":"premium","content":{"eyebrow":"Membership application","title":"Request private academy access.","body":"Complete your details and verification to begin your application."}}]}
    ]
  }
  $json$::jsonb
),
(
  'market-trader',
  'Market Trader',
  'A bold, market-led website for active trading educators, live sessions, and energetic communities.',
  'trading',
  1,
  $json$
  {
    "theme": {
      "primaryColor": "#0C1821",
      "accentColor": "#3EE6A8",
      "backgroundColor": "#FFFFFF",
      "surfaceColor": "#EEF4F3",
      "textColor": "#0C1821",
      "headingFont": "Inter",
      "bodyFont": "Inter"
    },
    "pages": [
      {
        "slug":"home",
        "title":"Home",
        "isHome":true,
        "sections":[
          {"key":"hero","type":"hero","variant":"market","content":{"eyebrow":"Read the market. Execute the plan.","title":"Train for the market you actually trade.","body":"Build practical skill through video lessons, live sessions, market breakdowns, and a community that stays engaged.","primaryCta":"Join the Trading Floor","secondaryCta":"View Courses"}},
          {"key":"features","type":"features","variant":"metrics","content":{"eyebrow":"Inside the academy","title":"Built for active learning.","items":["Video-first curriculum","Live market sessions","Broker-verified access","Responsive trader community"]}},
          {"key":"courses","type":"courses","variant":"market","content":{"eyebrow":"Latest training","title":"Turn market knowledge into repeatable execution.","body":"Your published courses are presented automatically."}},
          {"key":"community","type":"community","variant":"market","content":{"eyebrow":"The trading floor","title":"Stay close to the market and the community.","body":"Bring together live education, trade reviews, and focused discussion in one private academy."}},
          {"key":"final-cta","type":"cta","variant":"band","content":{"eyebrow":"Start training","title":"Build the skills behind better decisions.","body":"Join the academy and unlock its complete learning environment.","buttonText":"Join the Trading Floor"}}
        ]
      },
      {"slug":"about","title":"About","sections":[{"key":"about","type":"about","variant":"market","content":{"eyebrow":"Meet your mentor","title":"Experience translated into practical market education.","body":"Tell students about your trading background, teaching style, and academy mission."}}]},
      {"slug":"why-join","title":"Why Join","sections":[{"key":"features","type":"features","variant":"metrics","content":{"eyebrow":"Why train here","title":"Education that stays connected to the market.","items":["Actionable lessons","Live analysis","Repeatable frameworks","Accountable community"]}}]},
      {"slug":"courses","title":"Courses","sections":[{"key":"courses","type":"courses","variant":"market","content":{"eyebrow":"Training library","title":"Master the process, one lesson at a time.","body":"Published courses from your dashboard appear here."}}]},
      {"slug":"testimonials","title":"Testimonials","sections":[{"key":"testimonials","type":"testimonials","variant":"grid","content":{"eyebrow":"Trader feedback","title":"Real experiences from the community.","items":["Add a trader success story.","Add a lesson breakthrough.","Add a community result."]}}]},
      {"slug":"community","title":"Community","sections":[{"key":"community","type":"community","variant":"market","content":{"eyebrow":"Community","title":"Trade, review, improve, repeat.","body":"Explain how members engage with live sessions, discussion, and ongoing support."}}]},
      {"slug":"faq","title":"FAQ","sections":[{"key":"faq","type":"faq","variant":"list","content":{"eyebrow":"FAQ","title":"Questions before you join.","items":["Is this suitable for new traders?|Yes. Your academy can publish learning paths for different experience levels.","Are lessons live or recorded?|The platform supports video courses and live classes.","How do I get access?|Complete student registration and verification through this website."]}}]},
      {"slug":"contact","title":"Contact","sections":[{"key":"contact","type":"contact","variant":"market","content":{"eyebrow":"Contact","title":"Connect with the trading floor.","body":"Use the academy social channels to ask a question or learn more."}}]},
      {"slug":"join-academy","title":"Join Academy","sections":[{"key":"join","type":"join_academy","variant":"market","content":{"eyebrow":"Join the trading floor","title":"Create your account and apply for access.","body":"Submit your details and broker information to begin verification."}}]}
    ]
  }
  $json$::jsonb
);

create or replace function public.apply_website_template(
  target_portal_id uuid,
  target_template_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_trader_id uuid;
  request_role text;
  template_blueprint jsonb;
  template_theme jsonb;
  page_blueprint jsonb;
  section_blueprint jsonb;
  created_page_id uuid;
  page_position integer := 0;
  section_position integer;
begin
  select trader_id
  into resolved_trader_id
  from public.portals
  where id = target_portal_id;

  if resolved_trader_id is null then
    raise exception 'portal not found';
  end if;

  request_role := current_setting('request.jwt.claim.role', true);

  if request_role is not null
    and request_role <> 'service_role'
    and not public.is_super_admin()
    and not public.is_trader_member(resolved_trader_id) then
    raise exception 'forbidden';
  end if;

  select blueprint
  into template_blueprint
  from public.website_templates
  where id = target_template_id
    and is_active;

  if template_blueprint is null then
    raise exception 'template not found';
  end if;

  template_theme := template_blueprint -> 'theme';

  insert into public.website_theme_settings (
    trader_id,
    portal_id,
    template_id,
    primary_color,
    accent_color,
    background_color,
    surface_color,
    text_color,
    heading_font,
    body_font
  )
  values (
    resolved_trader_id,
    target_portal_id,
    target_template_id,
    coalesce(template_theme ->> 'primaryColor', '#111315'),
    coalesce(template_theme ->> 'accentColor', '#D8FF59'),
    coalesce(template_theme ->> 'backgroundColor', '#FFFFFF'),
    coalesce(template_theme ->> 'surfaceColor', '#F3F5F6'),
    coalesce(template_theme ->> 'textColor', '#111315'),
    coalesce(template_theme ->> 'headingFont', 'Inter'),
    coalesce(template_theme ->> 'bodyFont', 'Inter')
  )
  on conflict (portal_id) do update
  set
    template_id = excluded.template_id,
    updated_at = now();

  for page_blueprint in
    select value from jsonb_array_elements(template_blueprint -> 'pages')
  loop
    page_position := page_position + 1;
    section_position := 0;

    insert into public.website_pages (
      trader_id,
      portal_id,
      slug,
      title,
      sort_order,
      is_home
    )
    values (
      resolved_trader_id,
      target_portal_id,
      page_blueprint ->> 'slug',
      page_blueprint ->> 'title',
      coalesce((page_blueprint ->> 'sortOrder')::integer, page_position),
      coalesce((page_blueprint ->> 'isHome')::boolean, false)
    )
    on conflict (portal_id, slug) do update
    set title = excluded.title
    returning id into created_page_id;

    for section_blueprint in
      select value from jsonb_array_elements(page_blueprint -> 'sections')
    loop
      section_position := section_position + 1;

      insert into public.website_sections (
        trader_id,
        page_id,
        section_key,
        section_type,
        variant,
        content,
        sort_order
      )
      values (
        resolved_trader_id,
        created_page_id,
        section_blueprint ->> 'key',
        section_blueprint ->> 'type',
        coalesce(section_blueprint ->> 'variant', 'default'),
        coalesce(section_blueprint -> 'content', '{}'::jsonb),
        coalesce(
          (section_blueprint ->> 'sortOrder')::integer,
          section_position
        )
      )
      on conflict (page_id, section_key) do update
      set
        section_type = excluded.section_type,
        variant = excluded.variant;
    end loop;
  end loop;

  insert into public.website_navigation (
    trader_id,
    portal_id,
    page_id,
    label,
    location,
    sort_order
  )
  select
    resolved_trader_id,
    target_portal_id,
    page.id,
    page.title,
    'header',
    row_number() over (order by page.is_home desc, page.sort_order, page.title)
  from public.website_pages page
  where page.portal_id = target_portal_id
    and not exists (
      select 1
      from public.website_navigation navigation
      where navigation.portal_id = target_portal_id
        and navigation.location = 'header'
        and navigation.page_id = page.id
    );
end;
$$;

revoke all on function public.apply_website_template(uuid, uuid)
  from public, anon;
grant execute on function public.apply_website_template(uuid, uuid)
  to authenticated, service_role;

create or replace function public.initialize_website_builder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  default_template_id uuid;
begin
  select id into default_template_id
  from public.website_templates
  where template_key = 'professional-academy'
  limit 1;

  perform public.apply_website_template(new.id, default_template_id);
  return new;
end;
$$;

create trigger initialize_website_builder_after_portal
  after insert on public.portals
  for each row execute function public.initialize_website_builder();

do $$
declare
  existing_portal record;
  default_template_id uuid;
begin
  select id into default_template_id
  from public.website_templates
  where template_key = 'professional-academy'
  limit 1;

  for existing_portal in select id from public.portals loop
    perform public.apply_website_template(
      existing_portal.id,
      default_template_id
    );
  end loop;

  update public.website_theme_settings theme
  set
    primary_color = portal.primary_color,
    accent_color = portal.accent_color,
    social_links = jsonb_strip_nulls(
      jsonb_build_object(
        'whatsapp', portal.whatsapp_number,
        'telegram', portal.telegram_url,
        'instagram', portal.instagram_url
      )
    )
  from public.portals portal
  where theme.portal_id = portal.id;

  update public.website_sections section
  set content = section.content || jsonb_strip_nulls(
    jsonb_build_object(
      'title', portal.hero_title,
      'body', portal.hero_subtitle,
      'primaryCta', portal.cta_label,
      'secondaryCta', portal.broker_cta_label
    )
  )
  from public.website_pages page
  join public.portals portal on portal.id = page.portal_id
  where section.page_id = page.id
    and page.is_home
    and section.section_type = 'hero';

  update public.website_sections section
  set content = section.content || jsonb_build_object(
    'body',
    portal.welcome_message
  )
  from public.website_pages page
  join public.portals portal on portal.id = page.portal_id
  where section.page_id = page.id
    and section.section_type = 'about';
end;
$$;

create or replace function public.get_public_website_courses(
  target_portal_slug text
)
returns table (
  id uuid,
  title text,
  description text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    course.id,
    course.title,
    course.description
  from public.portals portal
  join public.courses course on course.trader_id = portal.trader_id
  where portal.slug = target_portal_slug
    and portal.is_published
    and course.status = 'published'
  order by course.sort_order, course.created_at
  limit 12;
$$;

grant execute on function public.get_public_website_courses(text)
  to anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'website_templates',
    'website_pages',
    'website_sections',
    'website_theme_settings',
    'website_media',
    'website_navigation'
  ]
  loop
    execute format(
      'create trigger set_%I_updated_at before update on public.%I
       for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end;
$$;

alter table public.website_templates enable row level security;
alter table public.website_pages enable row level security;
alter table public.website_sections enable row level security;
alter table public.website_theme_settings enable row level security;
alter table public.website_media enable row level security;
alter table public.website_navigation enable row level security;

create policy "active website templates are readable"
on public.website_templates for select
using (is_active or public.is_super_admin());

create policy "platform admins manage website templates"
on public.website_templates for all
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "website pages are tenant managed or public"
on public.website_pages for select
using (
  public.is_super_admin()
  or public.is_trader_member(trader_id)
  or (
    is_enabled
    and exists (
      select 1 from public.portals portal
      where portal.id = portal_id and portal.is_published
    )
  )
);

create policy "tenant members manage website pages"
on public.website_pages for all
using (public.is_super_admin() or public.is_trader_member(trader_id))
with check (public.is_super_admin() or public.is_trader_member(trader_id));

create policy "website sections are tenant managed or public"
on public.website_sections for select
using (
  public.is_super_admin()
  or public.is_trader_member(trader_id)
  or (
    is_enabled
    and exists (
      select 1
      from public.website_pages page
      join public.portals portal on portal.id = page.portal_id
      where page.id = page_id
        and page.is_enabled
        and portal.is_published
    )
  )
);

create policy "tenant members manage website sections"
on public.website_sections for all
using (public.is_super_admin() or public.is_trader_member(trader_id))
with check (public.is_super_admin() or public.is_trader_member(trader_id));

create policy "website themes are tenant managed or public"
on public.website_theme_settings for select
using (
  public.is_super_admin()
  or public.is_trader_member(trader_id)
  or exists (
    select 1 from public.portals portal
    where portal.id = portal_id and portal.is_published
  )
);

create policy "tenant members manage website themes"
on public.website_theme_settings for all
using (public.is_super_admin() or public.is_trader_member(trader_id))
with check (public.is_super_admin() or public.is_trader_member(trader_id));

create policy "website media is tenant managed or public"
on public.website_media for select
using (
  public.is_super_admin()
  or public.is_trader_member(trader_id)
  or exists (
    select 1 from public.portals portal
    where portal.id = portal_id and portal.is_published
  )
);

create policy "tenant members manage website media"
on public.website_media for all
using (public.is_super_admin() or public.is_trader_member(trader_id))
with check (public.is_super_admin() or public.is_trader_member(trader_id));

create policy "website navigation is tenant managed or public"
on public.website_navigation for select
using (
  public.is_super_admin()
  or public.is_trader_member(trader_id)
  or (
    is_enabled
    and exists (
      select 1 from public.portals portal
      where portal.id = portal_id and portal.is_published
    )
  )
);

create policy "tenant members manage website navigation"
on public.website_navigation for all
using (public.is_super_admin() or public.is_trader_member(trader_id))
with check (public.is_super_admin() or public.is_trader_member(trader_id));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'website_pages',
    'website_sections',
    'website_theme_settings',
    'website_media',
    'website_navigation'
  ]
  loop
    execute format(
      'create trigger audit_%I after insert or update or delete on public.%I
       for each row execute function public.write_audit_log()',
      table_name,
      table_name
    );
  end loop;
end;
$$;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'website-media',
  'website-media',
  true,
  10485760,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml'
  ]
)
on conflict (id) do nothing;

create policy "public website media"
on storage.objects for select
using (bucket_id = 'website-media');

create policy "tenant members manage website media objects"
on storage.objects for all
using (
  bucket_id = 'website-media'
  and public.is_trader_member((storage.foldername(name))[1]::uuid)
)
with check (
  bucket_id = 'website-media'
  and public.is_trader_member((storage.foldername(name))[1]::uuid)
);
