-- "Guestbook in the snow": each visit can leave one of 4 fixed marks in the
-- snow around Mikuro's igloo. No free text and no identity: only which mark
-- (paw print, footprints, tiny snowman, snow angel) and where (normalised x/z).
-- Additive only: no drop statements, safe to run more than once.
create table if not exists public.snow_marks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind smallint not null check (kind between 0 and 3),
  x real not null check (x >= 0 and x <= 1),
  z real not null check (z >= 0 and z <= 1)
);

create index if not exists snow_marks_created_at_idx
  on public.snow_marks (created_at desc);

alter table public.snow_marks enable row level security;

do $$
begin
  create policy "snow_marks public read"
    on public.snow_marks for select
    using (true);
exception when duplicate_object then null;
end $$;

-- The app has no service-role key, so inserts go through /api/snow (which
-- rate-limits per IP) using the anon key. The check keeps rows well-formed.
-- There is deliberately no update or delete policy.
do $$
begin
  create policy "snow_marks insert valid mark"
    on public.snow_marks for insert
    with check (kind between 0 and 3 and x >= 0 and x <= 1 and z >= 0 and z <= 1);
exception when duplicate_object then null;
end $$;

-- Live "mark pops in" for other visitors (Realtime postgres_changes).
do $$
begin
  alter publication supabase_realtime add table public.snow_marks;
exception when duplicate_object then null;
end $$;
