-- Security advisor: give the star helper a fixed search path like every other function.
alter function private.stars_for(boolean, integer, integer) set search_path = '';
