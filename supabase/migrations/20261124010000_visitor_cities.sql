-- "Cats from N cities today": a per-day, city-level visit tally for the
-- dotted globe in the footer. Privacy: no IPs, no user agents, no per-visit
-- rows. Only (day, city, country, rounded lat/lon, count). Rows older than
-- ~30 days are swept away by the recording function itself.
create table if not exists public.visitor_cities (
  day date not null,
  city text not null check (char_length(city) between 1 and 80),
  country text not null check (country ~ '^[A-Z]{2}$'),
  lat numeric(4, 1) not null check (lat between -90 and 90),
  lon numeric(4, 1) not null check (lon between -180 and 180),
  visits integer not null default 1 check (visits >= 1),
  unique (day, city, country)
);

create index if not exists visitor_cities_day_idx
  on public.visitor_cities (day desc);

alter table public.visitor_cities enable row level security;

-- Public read only. There are deliberately no insert/update/delete policies:
-- writes go through record_city_visit() below.
do $$
begin
  create policy "visitor_cities public read"
    on public.visitor_cities for select
    using (true);
exception when duplicate_object then null;
end $$;

revoke insert, update, delete, truncate on public.visitor_cities from anon, authenticated;
grant select on public.visitor_cities to anon, authenticated;

-- The app only has the anon key, and anon cannot safely UPDATE a counter, so
-- the +1 upsert runs as the table owner. It validates every argument, rounds
-- the coordinates to 1 decimal (~11 km) and only ever touches today's row.
-- /api/visitors rate-limits callers per IP before calling it.
create or replace function public.record_city_visit(
  p_city text,
  p_country text,
  p_lat double precision,
  p_lon double precision
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city text := btrim(p_city);
  v_country text := upper(btrim(p_country));
  v_day date := (now() at time zone 'utc')::date;
begin
  if v_city is null or char_length(v_city) not between 1 and 80
     or v_city ~ '[[:cntrl:]<>]' then
    raise exception 'invalid city' using errcode = '22023';
  end if;
  if v_country is null or v_country !~ '^[A-Z]{2}$' then
    raise exception 'invalid country' using errcode = '22023';
  end if;
  if p_lat is null or p_lon is null
     or p_lat not between -90 and 90 or p_lon not between -180 and 180 then
    raise exception 'invalid coordinates' using errcode = '22023';
  end if;

  insert into public.visitor_cities as vc (day, city, country, lat, lon, visits)
  values (v_day, v_city, v_country, round(p_lat::numeric, 1), round(p_lon::numeric, 1), 1)
  on conflict (day, city, country)
  do update set visits = vc.visits + 1;

  -- Cheap retention: roughly 1 call in 50 clears rows older than 30 days
  -- (index-backed, and only ever a few hundred rows per day).
  if random() < 0.02 then
    delete from public.visitor_cities where day < v_day - 30;
  end if;
end;
$$;

revoke all on function public.record_city_visit(text, text, double precision, double precision) from public;
grant execute on function public.record_city_visit(text, text, double precision, double precision) to anon, authenticated;
