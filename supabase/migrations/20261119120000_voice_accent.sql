-- Browser-voice accent + more mature default delivery.
alter table public.assistant_settings
  add column if not exists browser_accent text not null default 'japanese'
  check (browser_accent in ('japanese', 'english'));

alter table public.assistant_settings alter column browser_pitch set default 1.08;
alter table public.assistant_settings alter column browser_rate set default 0.96;

-- Move installs still on the old "squeaky" defaults to the mature ones
update public.assistant_settings
   set browser_pitch = 1.08, browser_rate = 0.96
 where browser_pitch = 1.45 and browser_rate = 1.02;
