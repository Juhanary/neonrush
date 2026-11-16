-- Rules of the accounts schema, run as real players. Run with scripts/db-test.sh.
-- Every check raises on failure, so the script stops at the first one (ON_ERROR_STOP).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- three players, and the developer
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-0000000000dd');
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-0000000000dd';
-- ten raters for the promotion test
insert into auth.users (id) select ('00000000-0000-0000-0000-1000000000' || lpad(i::text, 2, '0'))::uuid from generate_series(1, 10) i;

create function pg_temp.as_player(who text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', case who when 'a' then '00000000-0000-0000-0000-00000000000a'
    when 'b' then '00000000-0000-0000-0000-00000000000b' when 'c' then '00000000-0000-0000-0000-00000000000c'
    when 'dev' then '00000000-0000-0000-0000-0000000000dd' when 'none' then ''
    else '00000000-0000-0000-0000-1000000000' || lpad(who, 2, '0') end, false)
$$;
create function pg_temp.expect(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if; end $$;
-- runs a statement that must fail, and checks the message
create function pg_temp.refused(stmt text, part text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAILED: not refused: %', stmt;
exception when others then
  if sqlerrm like 'FAILED:%' then raise; end if;
  if position(part in sqlerrm) = 0 then raise exception 'FAILED: % gave "%" instead of "%"', stmt, sqlerrm, part; end if;
end $$;
grant execute on all functions in schema pg_temp to authenticated, anon;

set role authenticated;

-- ---- a profile appears at login; nicknames
select pg_temp.as_player('a');
select pg_temp.expect((select nickname from public.my_profile()) is null, 'new profile has no nickname');
select pg_temp.refused($$select public.set_nickname('a b')$$, 'nickname');
select public.set_nickname('NeonAce');
select pg_temp.as_player('b');
select pg_temp.refused($$select public.set_nickname('neonace')$$, 'profiles_nickname_key');
select public.set_nickname('Bolt');
select pg_temp.as_player('c'); select public.set_nickname('Cee');

-- ---- direct writes are closed
select pg_temp.as_player('a');
select pg_temp.refused($$update public.profiles set stars = 999$$, 'permission denied');
select pg_temp.refused($$update public.profiles set coins_bonus = 999$$, 'permission denied');
select pg_temp.refused($$insert into public.progress (user_id, level_id) values (auth.uid(), 'cyan-drift')$$, 'permission denied');
select pg_temp.refused($$update public.tracks set status = 'official'$$, 'permission denied');
select pg_temp.refused($$select is_admin from public.profiles$$, 'permission denied');
select pg_temp.refused($$select coins_spent from public.profiles$$, 'permission denied');

-- ---- runs and stars: the server counts stars from gems, never from the client
select public.record_run('cyan-drift', 5, 40, 0, false);
select pg_temp.expect((select stars from public.my_profile()) = 0, 'no stars before finishing');
select public.record_run('cyan-drift', 2, 100, 10, true, 3); -- claims 3 stars with half the gems
select pg_temp.expect((select stars from public.progress where level_id = 'cyan-drift' and user_id = auth.uid()) = 2, 'half the gems = 2 stars, claim ignored');
select public.record_run('cyan-drift', 1, 100, 999, true); -- more gems than the level has
select pg_temp.expect((select gems from public.progress where level_id = 'cyan-drift' and user_id = auth.uid()) = 20, 'gems capped at the level total');
select pg_temp.expect((select stars from public.my_profile()) = 3, 'all gems = 3 stars');
select pg_temp.expect((select attempts from public.my_profile()) = 8, 'attempts add up: 5 + 2 + 1');
select pg_temp.expect((select attempts_at_best from public.progress where level_id = 'cyan-drift' and user_id = auth.uid()) = 8, 'attempts to the record');
select public.record_run('cyan-drift', 4, 100, 5, true); -- a worse run later
select pg_temp.expect((select gems from public.progress where level_id = 'cyan-drift' and user_id = auth.uid()) = 20, 'results only improve');
select pg_temp.expect((select attempts_at_best from public.progress where level_id = 'cyan-drift' and user_id = auth.uid()) = 8, 'a worse run does not move attempts to the record');
select public.record_run('custom:abc123', 6, 100, 3, true, 3);
select pg_temp.expect((select stars from public.my_profile()) = 3, 'own private tracks give no stars');
select pg_temp.expect((select attempts from public.my_profile()) = 18, 'own private tracks count attempts');
select pg_temp.expect((select coins from public.my_profile()) = 30, 'coins = stars x 10');
select pg_temp.refused($$select public.record_run('nope-level', 1, 1, 0, false)$$, 'no such level');
select pg_temp.refused($$select public.record_run('track:999', 1, 1, 0, false)$$, 'no such track');
select pg_temp.refused($$select public.record_run('x''; drop table x;--', 1, 1, 0, false)$$, 'bad level id');

-- ---- global board: only above the threshold, only with a nickname
select pg_temp.expect(not exists (select 1 from public.global_board), 'nobody is on the board below 9 stars');
select public.record_run(l, 1, 100, 99, true) from (values ('solar-flare'), ('toxic-pulse')) v(l);
select pg_temp.expect((select stars from public.my_profile()) = 9 and (select on_board from public.my_profile()), '9 stars, on the board');
select pg_temp.expect((select nickname from public.global_board where rank = 1) = 'NeonAce', 'board shows the nickname');

-- ---- level boards: gems, then fewest attempts
select pg_temp.as_player('b');
select public.record_run('cyan-drift', 3, 100, 20, true);
select pg_temp.expect((select nickname from public.level_board where level_id = 'cyan-drift' and rank = 1) = 'Bolt', 'same gems in fewer attempts ranks first');
select pg_temp.expect((select count(*) from public.level_board where level_id = 'cyan-drift') = 2, 'both on the level board');

-- ---- tracks: save, edit while private, others cannot see it
select pg_temp.as_player('a');
select public.save_track('abc123', 'MY RIDE', '{"rows": []}', 12, false);
select public.save_track('abc123', 'MY RIDE 2', '{"rows": []}', 12, false);
select pg_temp.expect((select count(*) from public.tracks) = 1 and (select name from public.tracks) = 'MY RIDE 2', 'one track, updated in place');
select pg_temp.refused($$select public.submit_track('abc123')$$, 'finish your track');
select public.save_track('abc123', 'MY RIDE', '{"rows": []}', 12, true);
select pg_temp.as_player('b');
select pg_temp.expect((select count(*) from public.tracks) = 0, 'a private track is hidden from others');
select pg_temp.as_player('none');
select pg_temp.refused($$select public.save_track('x', 'X', '{}', 0, true)$$, 'not signed in');

-- ---- submit: frozen afterwards, limits per day
select pg_temp.as_player('a');
select public.submit_track('abc123');
select pg_temp.refused($$select public.save_track('abc123', 'SWAP', '{"rows": [1]}', 12, true)$$, 'cannot be changed');
select public.save_track('t' || i, 'T' || i, '{}', 1, true) from generate_series(2, 4) i;
select public.submit_track('t2'); select public.submit_track('t3');
select pg_temp.refused($$select public.submit_track('t4')$$, 'daily submit limit');
reset role;
update public.tracks set submitted_at = now() - interval '2 days' where client_id in ('t2', 't3'); -- a day later
set role authenticated;

-- ---- rating: not own, only after finishing, once each
select pg_temp.as_player('a');
select pg_temp.refused($$select public.rate_track((select id from public.tracks where client_id = 'abc123'), 5)$$, 'own track');
select pg_temp.as_player('b');
select pg_temp.expect((select count(*) from public.tracks) = 3, 'submitted tracks are visible');
select pg_temp.refused($$select public.rate_track((select id from public.tracks where client_id = 'abc123'), 5)$$, 'finish the track');
select public.record_run('track:' || (select id from public.tracks where client_id = 'abc123'), 2, 100, 12, true, 3);
select pg_temp.expect((select stars from public.my_profile()) = 3, 'a shared track that is not official gives no stars');
select public.rate_track((select id from public.tracks where client_id = 'abc123'), 2);
select public.rate_track((select id from public.tracks where client_id = 'abc123'), 4); -- changes the rating, not a second one
select pg_temp.expect((select rating_count = 1 and rating_sum = 4 from public.tracks where client_id = 'abc123'), 'one rating per player, changeable');
select pg_temp.refused($$select public.rate_track((select id from public.tracks where client_id = 'abc123'), 9)$$, 'score 1-5');

-- ---- ten good ratings put it in the developer's queue and on the top rated list
select pg_temp.expect(not exists (select 1 from public.top_tracks), 'not listed with one rating');
select pg_temp.as_player(i::text), public.record_run('track:' || (select id from public.tracks where client_id = 'abc123'), 1, 100, 12, true),
  public.rate_track((select id from public.tracks where client_id = 'abc123'), 4)
from generate_series(1, 9) i;
select pg_temp.expect((select status from public.tracks where client_id = 'abc123') = 'review', 'ten ratings averaging 4 → queue');
select pg_temp.expect((select maker from public.top_tracks limit 1) = 'NeonAce', 'top rated list names the maker');

-- ---- promotion: developer only; crown, 500 coins, stars for runs already made
select pg_temp.as_player('b');
select pg_temp.refused($$select public.promote_track((select id from public.tracks where client_id = 'abc123'))$$, 'not allowed');
select pg_temp.as_player('dev');
select public.promote_track((select id from public.tracks where client_id = 'abc123'));
select pg_temp.as_player('a');
select pg_temp.expect((select crowns from public.my_profile()) = 1, 'maker gets a crown');
select pg_temp.expect((select coins from public.my_profile()) = 9 * 10 + 500, 'maker gets 500 coins');
select pg_temp.expect(not exists (select 1 from public.top_tracks where maker = 'NeonAce' and name = 'MY RIDE'), 'official tracks leave the top rated list');
select pg_temp.as_player('b');
select pg_temp.expect((select stars from public.my_profile()) = 6, 'runs on a newly official track now give stars');
select pg_temp.as_player('anything');

reset role;
select 'ALL RULES OK' as result;
