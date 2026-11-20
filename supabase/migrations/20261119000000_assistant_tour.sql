-- Guided tour: Momo flies through the page and introduces each section.
alter table public.assistant_settings
  add column if not exists tour_enabled boolean not null default true;
