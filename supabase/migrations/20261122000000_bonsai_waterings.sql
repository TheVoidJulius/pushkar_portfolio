-- "Water the tree": each watering grows one emoji blossom on the commit bonsai.
-- No free text and no identity: only which of the 8 fixed blossoms was picked.
create table if not exists public.bonsai_waterings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  blossom smallint not null check (blossom between 0 and 7)
);

create index if not exists bonsai_waterings_created_at_idx
  on public.bonsai_waterings (created_at desc);

alter table public.bonsai_waterings enable row level security;

drop policy if exists "bonsai_waterings public read" on public.bonsai_waterings;
create policy "bonsai_waterings public read"
  on public.bonsai_waterings for select
  using (true);

-- The app has no service-role key, so inserts go through /api/bonsai (which
-- rate-limits per IP) using the anon key. The check keeps rows well-formed.
-- There is deliberately no update or delete policy.
drop policy if exists "bonsai_waterings insert valid blossom" on public.bonsai_waterings;
create policy "bonsai_waterings insert valid blossom"
  on public.bonsai_waterings for insert
  with check (blossom between 0 and 7);

-- Live "blossom pops in" for other visitors (Realtime postgres_changes).
do $$
begin
  alter publication supabase_realtime add table public.bonsai_waterings;
exception when duplicate_object then null;
end $$;
