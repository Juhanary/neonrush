-- Neonrush: accounts, progress, shared tracks, ratings and boards.
--
-- Trust model for now: the client reports its own runs. The server never takes a star count from the client for an
-- official level: it works stars out from the gems reported and the level's gem total, and caps everything. Replaying
-- a run's inputs on the server (the core is a fixed-step simulation) comes later.
--
-- Clients only ever write through the functions at the end of this file and through the few columns granted below.
-- Everything a player could inflate (stars, crowns, coins, ratings, track status) is written by security definer code.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Tunable numbers, one row. Readable by everyone so the game can show the rules it plays by.
create table public.rules (
  id boolean primary key default true check (id),
  board_min_stars integer not null default 9,       -- stars needed to appear on the global board
  promote_min_ratings integer not null default 10,  -- ratings before a track goes to the developer's queue
  promote_min_score numeric(3, 2) not null default 3.50, -- average rating (1..5) needed for the queue
  top_min_ratings integer not null default 3,       -- ratings before a track is listed among the top rated
  submit_per_day integer not null default 3,        -- tracks one player may submit in 24 hours
  submit_open_max integer not null default 10,      -- tracks one player may have waiting at once
  rate_per_day integer not null default 40,         -- ratings one player may give in 24 hours
  coins_per_star integer not null default 10,
  promo_coins integer not null default 500          -- coins a maker gets when a track of theirs becomes official
);
insert into public.rules default values;

-- ---------------------------------------------------------------------------------------------------------------
-- One profile per login. Created by a trigger on auth.users; the player picks the nickname afterwards.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text check (nickname ~ '^[A-Za-z0-9_]{3,16}$'),
  stars integer not null default 0,       -- sum over official levels, kept by record_run
  attempts bigint not null default 0,     -- every run on every level, kept by record_run
  crowns integer not null default 0,      -- tracks of theirs promoted to official
  coins_bonus integer not null default 0, -- coins from promotions (and later daily quests)
  coins_spent integer not null default 0,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index profiles_nickname_key on public.profiles (lower(nickname));
create index profiles_board_idx on public.profiles (stars desc, crowns desc);

-- Official levels: the built-in ones and promoted tracks. gem_total lets the server work out stars itself.
create table public.official_levels (
  id text primary key,
  gem_total smallint not null check (gem_total >= 0),
  track_id bigint, -- set for a promoted track
  added_at timestamptz not null default now()
);
insert into public.official_levels (id, gem_total) values
  ('cyan-drift', 20), ('solar-flare', 21), ('toxic-pulse', 16), ('frost-line', 12), ('gravity-well', 10),
  ('ember-rush', 16), ('volt-storm', 9), ('zero-point', 12), ('neon-horizon', 19);

-- Tracks players built. A private track belongs to its maker; a submitted one is frozen and can be rated.
create table public.tracks (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  client_id text not null check (length(client_id) between 1 and 32), -- the id the editor gave it on the device
  name text not null check (length(name) between 1 and 24),
  data jsonb not null check (pg_column_size(data) < 65536), -- rows, flips, tempo; the music file stays on the device
  gem_total smallint not null default 0 check (gem_total between 0 and 2000),
  status text not null default 'private' check (status in ('private', 'submitted', 'review', 'official')),
  owner_finished boolean not null default false,
  submitted_at timestamptz,
  rating_count integer not null default 0,
  rating_sum integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (owner_id, client_id)
);
create index tracks_status_idx on public.tracks (status, submitted_at);
alter table public.official_levels add foreign key (track_id) references public.tracks (id) on delete set null;
create index official_levels_track_idx on public.official_levels (track_id);

-- Progress per player and level. level_id: an official id, 'track:<id>' for a shared track, 'custom:<client id>'
-- for a private one of the player's own (counts towards attempts only).
create table public.progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  level_id text not null check (length(level_id) between 1 and 48),
  best smallint not null default 0 check (best between 0 and 100),
  gems smallint not null default 0 check (gems >= 0),
  stars smallint not null default 0 check (stars between 0 and 3),
  done boolean not null default false,
  attempts integer not null default 0 check (attempts >= 0),
  -- attempts it took to reach the current gems; orders the level boards
  attempts_at_best integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, level_id)
);
create index progress_board_idx on public.progress (level_id, gems desc, attempts_at_best, updated_at) where done;

-- One rating per player per track, 1..5.
create table public.ratings (
  track_id bigint not null references public.tracks (id) on delete cascade,
  rater_id uuid not null references public.profiles (id) on delete cascade,
  score smallint not null check (score between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (track_id, rater_id)
);
create index ratings_rater_idx on public.ratings (rater_id, created_at);

-- ---------------------------------------------------------------------------------------------------------------
-- Access. Scores, nicknames and shared tracks are public; writes go through functions or the granted columns.
alter table public.rules enable row level security;
alter table public.profiles enable row level security;
alter table public.official_levels enable row level security;
alter table public.tracks enable row level security;
alter table public.progress enable row level security;
alter table public.ratings enable row level security;

revoke all on public.rules, public.profiles, public.official_levels, public.tracks, public.progress, public.ratings from anon, authenticated;
grant select on public.rules, public.official_levels, public.progress to anon, authenticated;
grant select (id, nickname, stars, attempts, crowns, created_at) on public.profiles to anon, authenticated;
grant select (id, owner_id, client_id, name, data, gem_total, status, owner_finished, submitted_at, rating_count, rating_sum, updated_at)
  on public.tracks to anon, authenticated;
grant select on public.ratings to authenticated;
-- the player's own coin columns are readable through my_profile(), not through the table

create policy rules_read on public.rules for select using (true);
create policy levels_read on public.official_levels for select using (true);
create policy progress_read on public.progress for select using (true);
create policy profiles_read on public.profiles for select using (true);
create policy tracks_read on public.tracks for select
  using (status <> 'private' or owner_id = (select auth.uid()));
create policy ratings_read_own on public.ratings for select to authenticated
  using (rater_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------------------------
-- New login → empty profile.
create function private.new_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.new_profile();

create function private.uid() returns uuid language plpgsql stable set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'not signed in' using errcode = '28000'; end if;
  return u;
end $$;

-- Stars of an official level, from gems the way the game counts them: finish 1, half the gems 2, all 3.
create function private.stars_for(done boolean, gems integer, total integer) returns smallint language sql immutable as $$
  select case when not done then 0
    else 1 + (case when gems * 2 >= total then 1 else 0 end) + (case when gems >= total then 1 else 0 end) end::smallint
$$;

create function private.recount(u uuid) returns void language sql security definer set search_path = '' as $$
  update public.profiles p set
    stars = coalesce((select sum(g.stars) from public.progress g join public.official_levels o on o.id = g.level_id where g.user_id = u), 0),
    attempts = coalesce((select sum(g.attempts) from public.progress g where g.user_id = u), 0)
  where p.id = u
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Client functions.

-- Pick or change the nickname. Fails with unique_violation when someone has it.
create function public.set_nickname(nick text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if nick !~ '^[A-Za-z0-9_]{3,16}$' then raise exception 'nickname: 3-16 letters, digits or _' using errcode = '22023'; end if;
  update public.profiles set nickname = nick where id = private.uid();
end $$;

-- The signed-in player's own profile, coins included.
create function public.my_profile() returns table (
  id uuid, nickname text, stars integer, attempts bigint, crowns integer, coins integer, on_board boolean
) language sql stable security definer set search_path = '' as $$
  select p.id, p.nickname, p.stars, p.attempts, p.crowns,
    greatest(0, p.stars * r.coins_per_star + p.coins_bonus - p.coins_spent), p.stars >= r.board_min_stars
  from public.profiles p, public.rules r where p.id = private.uid()
$$;

-- Report runs on a level: attempts_delta new attempts since the last report, and the best result of this device.
-- Results only ever improve. For an official level the server works out the stars; reported_stars is used only for
-- tracks that are not official (shown to the player, never counted). Also how a device's save is merged on login.
create function public.record_run(
  level text, attempts_delta integer, best integer, gems integer, done boolean, reported_stars integer default 0
) returns public.progress language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.uid();
  total integer;
  g integer;
  s integer;
  res public.progress;
begin
  if level !~ '^([a-z0-9-]{1,32}|track:[0-9]{1,18}|custom:[A-Za-z0-9_-]{1,32})$' then
    raise exception 'bad level id' using errcode = '22023';
  end if;
  select o.gem_total into total from public.official_levels o where o.id = level;
  if level like 'track:%' and total is null
    and not exists (select 1 from public.tracks t where t.id = substr(level, 7)::bigint and t.status <> 'private') then
    raise exception 'no such track' using errcode = '22023';
  end if;
  if total is null and level !~ '^(track|custom):' then raise exception 'no such level' using errcode = '22023'; end if;
  if total is null and level like 'track:%' then
    select t.gem_total into total from public.tracks t where t.id = substr(level, 7)::bigint;
  end if;

  g := greatest(0, least(gems, coalesce(total, 2000)));
  s := case when exists (select 1 from public.official_levels o where o.id = level) then private.stars_for(done, g, total)
            else greatest(0, least(3, coalesce(reported_stars, 0))) end;

  insert into public.progress as p (user_id, level_id, best, gems, stars, done, attempts, attempts_at_best)
  values (u, level, greatest(0, least(100, case when done then 100 else best end)), case when done then g else 0 end, s, done,
          greatest(0, least(10000, attempts_delta)), greatest(0, least(10000, attempts_delta)))
  on conflict (user_id, level_id) do update set
    attempts = p.attempts + excluded.attempts,
    best = greatest(p.best, excluded.best),
    done = p.done or excluded.done,
    -- the attempts count is frozen at the run that set the current gems record
    attempts_at_best = case when excluded.done and (not p.done or excluded.gems > p.gems)
                            then p.attempts + excluded.attempts else p.attempts_at_best end,
    gems = greatest(p.gems, excluded.gems),
    stars = greatest(p.stars, excluded.stars),
    updated_at = case when excluded.done and (not p.done or excluded.gems > p.gems) then now() else p.updated_at end
  returning * into res;

  perform private.recount(u);
  return res;
end $$;

-- Save one of the player's tracks (create or update while private). Returns the server id.
create function public.save_track(client_id text, name text, data jsonb, gem_total integer, owner_finished boolean)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.uid();
  tid bigint;
  st text;
begin
  select t.id, t.status into tid, st from public.tracks t where t.owner_id = u and t.client_id = save_track.client_id;
  if tid is null then
    insert into public.tracks (owner_id, client_id, name, data, gem_total, owner_finished)
    values (u, save_track.client_id, save_track.name, save_track.data, save_track.gem_total, save_track.owner_finished)
    returning id into tid;
  elsif st = 'private' then
    update public.tracks t set name = save_track.name, data = save_track.data, gem_total = save_track.gem_total,
      owner_finished = save_track.owner_finished, updated_at = now() where t.id = tid;
  else
    raise exception 'a submitted track cannot be changed' using errcode = '42501';
  end if;
  return tid;
end $$;

create function public.delete_track(client_id text) returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.tracks t where t.owner_id = private.uid() and t.client_id = delete_track.client_id and t.status = 'private';
end $$;

-- Send a track to be rated. Only a track its maker finished, a nickname is needed, and there are limits per day.
create function public.submit_track(client_id text) returns void language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.uid();
  r public.rules;
  t public.tracks;
begin
  select * into r from public.rules;
  select * into t from public.tracks x where x.owner_id = u and x.client_id = submit_track.client_id for update;
  if t.id is null then raise exception 'no such track' using errcode = '22023'; end if;
  if t.status <> 'private' then raise exception 'already submitted' using errcode = '22023'; end if;
  if not t.owner_finished then raise exception 'finish your track before submitting it' using errcode = '22023'; end if;
  if (select nickname from public.profiles where id = u) is null then raise exception 'pick a nickname first' using errcode = '22023'; end if;
  if (select count(*) from public.tracks x where x.owner_id = u and x.submitted_at > now() - interval '24 hours') >= r.submit_per_day then
    raise exception 'daily submit limit reached' using errcode = '54000';
  end if;
  if (select count(*) from public.tracks x where x.owner_id = u and x.status in ('submitted', 'review')) >= r.submit_open_max then
    raise exception 'too many tracks waiting' using errcode = '54000';
  end if;
  update public.tracks x set status = 'submitted', submitted_at = now() where x.id = t.id;
end $$;

-- Rate another player's track, 1..5. Only after finishing it, never one's own, a daily limit. Changing a rating is allowed.
create function public.rate_track(track bigint, score integer) returns void language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.uid();
  r public.rules;
  t public.tracks;
  old smallint;
begin
  if score not between 1 and 5 then raise exception 'score 1-5' using errcode = '22023'; end if;
  select * into r from public.rules;
  select * into t from public.tracks x where x.id = track for update;
  if t.id is null or t.status = 'private' then raise exception 'no such track' using errcode = '22023'; end if;
  if t.owner_id = u then raise exception 'you cannot rate your own track' using errcode = '42501'; end if;
  if not exists (select 1 from public.progress g where g.user_id = u and g.level_id = 'track:' || t.id and g.done) then
    raise exception 'finish the track before rating it' using errcode = '42501';
  end if;
  select x.score into old from public.ratings x where x.track_id = t.id and x.rater_id = u;
  if old is null then
    if (select count(*) from public.ratings x where x.rater_id = u and x.created_at > now() - interval '24 hours') >= r.rate_per_day then
      raise exception 'daily rating limit reached' using errcode = '54000';
    end if;
    insert into public.ratings (track_id, rater_id, score) values (t.id, u, score);
    update public.tracks x set rating_count = x.rating_count + 1, rating_sum = x.rating_sum + score where x.id = t.id;
  else
    update public.ratings x set score = rate_track.score where x.track_id = t.id and x.rater_id = u;
    update public.tracks x set rating_sum = x.rating_sum - old + score where x.id = t.id;
  end if;
  -- enough good ratings: into the developer's queue
  update public.tracks x set status = 'review'
  where x.id = t.id and x.status = 'submitted' and x.rating_count >= r.promote_min_ratings
    and x.rating_sum::numeric / x.rating_count >= r.promote_min_score;
end $$;

-- Developer only: make a queued track official. Its maker gets a crown and the promotion coins.
create function public.promote_track(track bigint) returns text language plpgsql security definer set search_path = '' as $$
declare
  t public.tracks;
  lid text;
begin
  if not coalesce((select is_admin from public.profiles where id = private.uid()), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into t from public.tracks x where x.id = track for update;
  if t.id is null or t.status not in ('submitted', 'review') then raise exception 'not in the queue' using errcode = '22023'; end if;
  lid := 'track:' || t.id;
  update public.tracks x set status = 'official' where x.id = t.id;
  insert into public.official_levels (id, gem_total, track_id) values (lid, t.gem_total, t.id);
  update public.profiles p set crowns = p.crowns + 1, coins_bonus = p.coins_bonus + (select promo_coins from public.rules)
  where p.id = t.owner_id;
  -- runs already made on it now count for stars
  update public.progress g set stars = private.stars_for(g.done, least(g.gems, t.gem_total), t.gem_total) where g.level_id = lid;
  perform private.recount(g.user_id) from (select distinct user_id from public.progress where level_id = lid) g;
  return lid;
end $$;

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function public.set_nickname, public.my_profile, public.record_run, public.save_track, public.delete_track,
  public.submit_track, public.rate_track, public.promote_track to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Boards. Views run with the caller's rights, so they only show what the tables already allow.

-- Global board: players above the star threshold, by stars, then crowns.
create view public.global_board with (security_invoker = true) as
  select rank() over (order by p.stars desc, p.crowns desc) as rank, p.id, p.nickname, p.stars, p.crowns
  from public.profiles p, public.rules r
  where p.nickname is not null and p.stars >= r.board_min_stars;

-- One board per level: most gems, then fewest attempts to get them, then who got there first.
create view public.level_board with (security_invoker = true) as
  select g.level_id, rank() over (partition by g.level_id order by g.gems desc, g.attempts_at_best, g.updated_at) as rank,
    p.nickname, g.gems, g.stars, g.attempts_at_best as attempts, g.updated_at as at
  from public.progress g join public.profiles p on p.id = g.user_id
  where g.done and p.nickname is not null;

-- Top rated tracks that are not official yet.
create view public.top_tracks with (security_invoker = true) as
  select t.id, t.name, p.nickname as maker, t.status, t.rating_count, round(t.rating_sum::numeric / t.rating_count, 2) as score, t.submitted_at
  from public.tracks t join public.profiles p on p.id = t.owner_id, public.rules r
  where t.status in ('submitted', 'review') and t.rating_count >= r.top_min_ratings
  order by score desc, t.rating_count desc;

grant select on public.global_board, public.level_board, public.top_tracks to anon, authenticated;
