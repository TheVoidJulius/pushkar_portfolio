-- =====================================================================
-- Portfolio CMS schema
-- Single-owner model: anyone can READ published content, only users listed
-- in public.admin_users can WRITE. Visitors may only INSERT contact messages.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Authorization
-- ---------------------------------------------------------------------
create table public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- security definer so policies can call it without exposing admin_users
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- Shared updated_at trigger
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Singleton tables (always exactly one row, id = 1)
-- ---------------------------------------------------------------------
create table public.site_settings (
  id               smallint primary key default 1 check (id = 1),
  site_title       text not null default 'Portfolio' check (char_length(site_title) between 1 and 120),
  meta_description text not null default '' check (char_length(meta_description) <= 300),
  footer_note      text not null default '' check (char_length(footer_note) <= 300),
  show_assistant   boolean not null default true,
  updated_at       timestamptz not null default now()
);

create table public.profiles (
  id                  smallint primary key default 1 check (id = 1),
  name                text not null check (char_length(name) between 1 and 120),
  designation         text not null default '' check (char_length(designation) <= 160),
  introduction        text not null default '' check (char_length(introduction) <= 400),
  description         text not null default '' check (char_length(description) <= 1200),
  location            text not null default '' check (char_length(location) <= 120),
  availability        text not null default '' check (char_length(availability) <= 160),
  profile_image_url   text,
  cta_primary_label   text not null default 'See my work',
  cta_primary_href    text not null default '#work',
  cta_secondary_label text not null default 'Get in touch',
  cta_secondary_href  text not null default '#contact',
  -- [{ "value": "8+", "label": "years building" }]
  stats               jsonb not null default '[]'::jsonb check (jsonb_typeof(stats) = 'array'),
  updated_at          timestamptz not null default now()
);

create table public.about_content (
  id           smallint primary key default 1 check (id = 1),
  headline     text not null default '' check (char_length(headline) <= 200),
  introduction text not null default '' check (char_length(introduction) <= 800),
  biography    text not null default '' check (char_length(biography) <= 4000),
  background   text not null default '' check (char_length(background) <= 2000),
  interests    text[] not null default '{}',
  -- [{ "title": "...", "description": "..." }]
  highlights   jsonb not null default '[]'::jsonb check (jsonb_typeof(highlights) = 'array'),
  image_url    text,
  updated_at   timestamptz not null default now()
);

create table public.contact_details (
  id                smallint primary key default 1 check (id = 1),
  email             text not null default '' check (email = '' or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone             text not null default '' check (char_length(phone) <= 40),
  location          text not null default '' check (char_length(location) <= 120),
  availability_note text not null default '' check (char_length(availability_note) <= 300),
  -- [{ "platform": "github", "label": "GitHub", "url": "https://..." }]
  socials           jsonb not null default '[]'::jsonb check (jsonb_typeof(socials) = 'array'),
  form_enabled      boolean not null default true,
  updated_at        timestamptz not null default now()
);

create table public.assistant_settings (
  id                  smallint primary key default 1 check (id = 1),
  name                text not null default 'Momo' check (char_length(name) between 1 and 40),
  greeting            text not null default '' check (char_length(greeting) <= 400),
  personality         text not null default '' check (char_length(personality) <= 3000),
  default_language    text not null default 'en-US' check (char_length(default_language) <= 20),
  greeting_enabled    boolean not null default true,
  voice_enabled       boolean not null default true,
  voice_provider      text not null default 'auto' check (voice_provider in ('auto', 'elevenlabs', 'browser')),
  voice_id            text not null default '' check (char_length(voice_id) <= 80),
  voice_model         text not null default 'eleven_v3' check (char_length(voice_model) <= 80),
  voice_stability     numeric(3,2) not null default 0.40 check (voice_stability between 0 and 1),
  voice_style         numeric(3,2) not null default 0.55 check (voice_style between 0 and 1),
  voice_speed         numeric(3,2) not null default 1.00 check (voice_speed between 0.7 and 1.2),
  browser_pitch       numeric(3,2) not null default 1.45 check (browser_pitch between 0 and 2),
  browser_rate        numeric(3,2) not null default 1.02 check (browser_rate between 0.5 and 1.5),
  suggested_questions text[] not null default '{}',
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Collection tables
-- ---------------------------------------------------------------------
create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 120),
  summary      text not null default '' check (char_length(summary) <= 300),
  description  text not null default '' check (char_length(description) <= 4000),
  category     text not null default '' check (char_length(category) <= 60),
  year         text not null default '' check (char_length(year) <= 12),
  highlight    text not null default '' check (char_length(highlight) <= 160),
  image_url    text,
  technologies text[] not null default '{}',
  github_url   text check (github_url is null or github_url ~* '^https?://'),
  demo_url     text check (demo_url is null or demo_url ~* '^https?://'),
  featured     boolean not null default false,
  published    boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index projects_order_idx on public.projects (sort_order, created_at);

create table public.skill_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 240),
  icon        text not null default 'sparkles' check (char_length(icon) <= 40),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.skills (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.skill_categories (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  level       text not null default 'proficient' check (level in ('expert', 'proficient', 'familiar')),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index skills_category_idx on public.skills (category_id, sort_order);

create table public.experiences (
  id           uuid primary key default gen_random_uuid(),
  company      text not null check (char_length(company) between 1 and 120),
  role         text not null check (char_length(role) between 1 and 120),
  location     text not null default '' check (char_length(location) <= 120),
  company_url  text check (company_url is null or company_url ~* '^https?://'),
  start_date   date not null,
  end_date     date,
  is_current   boolean not null default false,
  description  text not null default '' check (char_length(description) <= 2000),
  achievements text[] not null default '{}',
  technologies text[] not null default '{}',
  logo_url     text,
  published    boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint experiences_dates_chk check (end_date is null or end_date >= start_date)
);

create table public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 120),
  email      text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  subject    text not null default '' check (char_length(subject) <= 200),
  message    text not null check (char_length(message) between 10 and 5000),
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['site_settings','profiles','about_content','contact_details',
                           'assistant_settings','projects','skill_categories','skills','experiences']
  loop
    execute format('create trigger %I_touch before update on public.%I
                    for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.admin_users        enable row level security;
alter table public.site_settings      enable row level security;
alter table public.profiles           enable row level security;
alter table public.about_content      enable row level security;
alter table public.contact_details    enable row level security;
alter table public.assistant_settings enable row level security;
alter table public.projects           enable row level security;
alter table public.skill_categories   enable row level security;
alter table public.skills             enable row level security;
alter table public.experiences        enable row level security;
alter table public.contact_messages   enable row level security;

-- admin_users: a signed-in user may only see whether they themselves are an admin
create policy "admin_users: read own row" on public.admin_users
  for select to authenticated using (user_id = auth.uid());

-- Public singletons + categories/skills: world-readable, admin-writable
do $$
declare t text;
begin
  foreach t in array array['site_settings','profiles','about_content','contact_details',
                           'assistant_settings','skill_categories','skills']
  loop
    execute format('create policy "%1$s: public read" on public.%1$I for select to anon, authenticated using (true)', t);
    execute format('create policy "%1$s: admin insert" on public.%1$I for insert to authenticated with check (public.is_admin())', t);
    execute format('create policy "%1$s: admin update" on public.%1$I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create policy "%1$s: admin delete" on public.%1$I for delete to authenticated using (public.is_admin())', t);
  end loop;
end $$;

-- Draftable collections: visitors only see published rows; admin sees everything
do $$
declare t text;
begin
  foreach t in array array['projects','experiences']
  loop
    execute format('create policy "%1$s: public read published" on public.%1$I for select to anon, authenticated using (published or public.is_admin())', t);
    execute format('create policy "%1$s: admin insert" on public.%1$I for insert to authenticated with check (public.is_admin())', t);
    execute format('create policy "%1$s: admin update" on public.%1$I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create policy "%1$s: admin delete" on public.%1$I for delete to authenticated using (public.is_admin())', t);
  end loop;
end $$;

-- Contact messages: anyone can submit (constraints validate shape), only admin can read/manage
create policy "contact_messages: public insert" on public.contact_messages
  for insert to anon, authenticated with check (is_read = false);
create policy "contact_messages: admin read" on public.contact_messages
  for select to authenticated using (public.is_admin());
create policy "contact_messages: admin update" on public.contact_messages
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "contact_messages: admin delete" on public.contact_messages
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- Storage: public-read image bucket, admin-only writes, 5 MB, images only
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portfolio-media', 'portfolio-media', true, 5242880,
        array['image/png','image/jpeg','image/webp','image/gif','image/avif','image/svg+xml'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "portfolio-media: public read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'portfolio-media');
create policy "portfolio-media: admin insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'portfolio-media' and public.is_admin());
create policy "portfolio-media: admin update" on storage.objects
  for update to authenticated using (bucket_id = 'portfolio-media' and public.is_admin());
create policy "portfolio-media: admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'portfolio-media' and public.is_admin());

-- ---------------------------------------------------------------------
-- Make sure singleton rows exist so the site always renders
-- ---------------------------------------------------------------------
insert into public.site_settings (id) values (1) on conflict do nothing;
insert into public.profiles (id, name) values (1, 'Your Name') on conflict do nothing;
insert into public.about_content (id) values (1) on conflict do nothing;
insert into public.contact_details (id) values (1) on conflict do nothing;
insert into public.assistant_settings (id) values (1) on conflict do nothing;
