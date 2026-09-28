-- Neeru database setup. Run once in the Supabase SQL editor of a fresh project
-- (or it is already applied if Claude set up your project).
-- Everything lives in its own "neeru" schema. The tables are not reachable through the API;
-- the app only calls the three public.neeru_* functions, from its own server.

create schema if not exists neeru;
revoke all on schema neeru from public, anon, authenticated;

create table neeru.spots (
  id uuid primary key default gen_random_uuid(),
  lat double precision not null,
  lng double precision not null,
  label text,
  depth text not null check (depth in ('ankle','knee','waist','closed')),
  first_at timestamptz not null default now(),
  last_flooded_at timestamptz not null default now(),
  last_clear_at timestamptz
);
create index spots_last_flooded_idx on neeru.spots (last_flooded_at desc);
create index spots_latlng_idx on neeru.spots (lat, lng);

create table neeru.reports (
  id bigint generated always as identity primary key,
  spot_id uuid not null references neeru.spots(id) on delete cascade,
  kind text not null check (kind in ('flooded','clear')),
  depth text check (depth in ('ankle','knee','waist','closed')),
  lat double precision,
  lng double precision,
  device text not null,
  ip_hash text,
  created_at timestamptz not null default now(),
  check (kind = 'clear' or depth is not null)
);
create index reports_spot_idx on neeru.reports (spot_id, created_at desc);
create index reports_device_idx on neeru.reports (device, created_at desc);
create index reports_ip_idx on neeru.reports (ip_hash, created_at desc);

alter table neeru.spots enable row level security;
alter table neeru.reports enable row level security;

create or replace function neeru.dist_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = '' as $$
  select 111320 * sqrt(power(lat2 - lat1, 2) + power((lng2 - lng1) * cos(radians((lat1 + lat2) / 2)), 2));
$$;

create or replace function neeru.depth_rank(d text) returns int language sql immutable set search_path = '' as $$
  select case d when 'ankle' then 1 when 'knee' then 2 when 'waist' then 3 when 'closed' then 4 else 0 end;
$$;

-- Abuse guard: 1 report per 20 s and 30 per hour per browser; 120 per hour per IP.
create or replace function neeru.guard(p_device text, p_ip text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_ip_hash text := case when coalesce(p_ip, '') = '' then null else encode(extensions.digest(p_ip || ':neeru', 'sha256'), 'hex') end;
begin
  if p_device is null or p_device !~ '^[A-Za-z0-9-]{16,64}$' then
    raise exception 'bad_device' using errcode = '22023';
  end if;
  if exists (select 1 from neeru.reports where device = p_device and created_at > now() - interval '20 seconds') then
    raise exception 'too_fast' using errcode = 'P0001';
  end if;
  if (select count(*) from neeru.reports where device = p_device and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'too_many' using errcode = 'P0001';
  end if;
  if v_ip_hash is not null and (select count(*) from neeru.reports where ip_hash = v_ip_hash and created_at > now() - interval '1 hour') >= 120 then
    raise exception 'too_many' using errcode = 'P0001';
  end if;
  return v_ip_hash;
end $$;

-- Spot depth = most-reported depth in the last 45 minutes (ties go deeper), else the latest report.
create or replace function neeru.refresh_depth(p_spot uuid) returns void
language sql security definer set search_path = '' as $$
  update neeru.spots s set depth = coalesce(
    (select r.depth from neeru.reports r
      where r.spot_id = p_spot and r.kind = 'flooded' and r.created_at > now() - interval '45 minutes'
      group by r.depth order by count(*) desc, neeru.depth_rank(r.depth) desc limit 1),
    (select r.depth from neeru.reports r where r.spot_id = p_spot and r.kind = 'flooded' order by r.created_at desc limit 1),
    s.depth)
  where s.id = p_spot;
$$;

-- Report water at a point. Joins the nearest active spot within 150 m, otherwise starts a new one.
create or replace function public.neeru_submit_report(p_lat double precision, p_lng double precision, p_depth text, p_device text, p_label text default null, p_ip text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_ip_hash text;
  v_spot uuid;
  v_merged boolean := false;
begin
  if p_depth is null or p_depth not in ('ankle','knee','waist','closed') then raise exception 'bad_depth' using errcode = '22023'; end if;
  if p_lat is null or p_lng is null or p_lat not between 12.70 and 13.30 or p_lng not between 77.30 and 77.95 then
    raise exception 'outside_bengaluru' using errcode = '22023';
  end if;
  v_ip_hash := neeru.guard(p_device, p_ip);

  select s.id into v_spot from neeru.spots s
   where s.last_flooded_at > now() - interval '3 hours'
     and s.lat between p_lat - 0.0015 and p_lat + 0.0015
     and s.lng between p_lng - 0.0016 and p_lng + 0.0016
     and neeru.dist_m(s.lat, s.lng, p_lat, p_lng) <= 150
   order by neeru.dist_m(s.lat, s.lng, p_lat, p_lng) limit 1;

  if v_spot is null then
    insert into neeru.spots (lat, lng, label, depth)
    values (p_lat, p_lng, nullif(left(regexp_replace(coalesce(p_label, ''), '[<>]', '', 'g'), 80), ''), p_depth)
    returning id into v_spot;
  else
    v_merged := true;
    if exists (select 1 from neeru.reports where spot_id = v_spot and device = p_device and created_at > now() - interval '10 minutes') then
      raise exception 'already_reported' using errcode = 'P0001';
    end if;
    update neeru.spots set last_flooded_at = now() where id = v_spot;
  end if;

  insert into neeru.reports (spot_id, kind, depth, lat, lng, device, ip_hash)
  values (v_spot, 'flooded', p_depth, p_lat, p_lng, p_device, v_ip_hash);
  perform neeru.refresh_depth(v_spot);
  return json_build_object('spot_id', v_spot, 'merged', v_merged);
end $$;

-- Confirm an existing spot: still flooded (optionally with a new depth) or water gone.
create or replace function public.neeru_vote(p_spot uuid, p_kind text, p_device text, p_depth text default null, p_ip text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_ip_hash text;
  v_depth text;
begin
  if p_kind is null or p_kind not in ('flooded','clear') then raise exception 'bad_kind' using errcode = '22023'; end if;
  if p_depth is not null and p_depth not in ('ankle','knee','waist','closed') then raise exception 'bad_depth' using errcode = '22023'; end if;
  select depth into v_depth from neeru.spots where id = p_spot;
  if not found then raise exception 'no_spot' using errcode = '22023'; end if;
  v_ip_hash := neeru.guard(p_device, p_ip);
  if exists (select 1 from neeru.reports where spot_id = p_spot and device = p_device and created_at > now() - interval '10 minutes') then
    raise exception 'already_reported' using errcode = 'P0001';
  end if;
  insert into neeru.reports (spot_id, kind, depth, device, ip_hash)
  values (p_spot, p_kind, case when p_kind = 'flooded' then coalesce(p_depth, v_depth) end, p_device, v_ip_hash);
  if p_kind = 'flooded' then
    update neeru.spots set last_flooded_at = now() where id = p_spot;
    perform neeru.refresh_depth(p_spot);
  else
    update neeru.spots set last_clear_at = now() where id = p_spot;
  end if;
  return json_build_object('ok', true);
end $$;

-- Live floods. A spot drops off after 3 hours without a "flooded" report, or once people say the water's gone:
-- 2+ "gone" reports since the last "flooded" one, or 1 if the last "flooded" report is over an hour old.
create or replace function public.neeru_active_floods()
returns table (id uuid, lat double precision, lng double precision, label text, depth text,
               reports int, still int, gone int, first_at timestamptz, last_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with s as (
    select sp.*,
      (select count(*) from neeru.reports r where r.spot_id = sp.id and r.kind = 'flooded')::int as reports,
      (select count(*) from neeru.reports r where r.spot_id = sp.id and r.kind = 'flooded' and r.created_at > now() - interval '90 minutes')::int as still,
      (select count(*) from neeru.reports r where r.spot_id = sp.id and r.kind = 'clear' and r.created_at > sp.last_flooded_at)::int as gone
    from neeru.spots sp
    where sp.last_flooded_at > now() - interval '3 hours'
  )
  select s.id, s.lat, s.lng, s.label, s.depth, s.reports, s.still, s.gone, s.first_at, s.last_flooded_at
  from s
  where not (s.gone >= 2 or (s.gone >= 1 and s.last_flooded_at < now() - interval '1 hour'))
  order by neeru.depth_rank(s.depth) desc, s.still desc;
$$;

revoke all on all functions in schema neeru from public, anon, authenticated;
revoke all on function public.neeru_submit_report(double precision, double precision, text, text, text, text) from public;
revoke all on function public.neeru_vote(uuid, text, text, text, text) from public;
revoke all on function public.neeru_active_floods() from public;
grant execute on function public.neeru_submit_report(double precision, double precision, text, text, text, text) to anon, authenticated;
grant execute on function public.neeru_vote(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.neeru_active_floods() to anon, authenticated;


-- Demo data flag (seeded storm) and helper to replay it
alter table neeru.spots add column if not exists seed boolean not null default false;
alter table neeru.reports add column if not exists seed boolean not null default false;

create or replace function neeru.replay_seed() returns interval
language plpgsql set search_path = '' as $$
declare v_shift interval;
begin
  select now() - max(created_at) into v_shift from neeru.reports where seed;
  if v_shift is null then return null; end if;
  update neeru.reports set created_at = created_at + v_shift where seed;
  update neeru.spots set first_at = first_at + v_shift,
                         last_flooded_at = last_flooded_at + v_shift,
                         last_clear_at = last_clear_at + v_shift
   where seed;
  return v_shift;
end $$;
revoke all on function neeru.replay_seed() from public, anon, authenticated;
