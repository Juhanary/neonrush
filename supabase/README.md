# Server (Supabase)

Project `dlskmbopbiwkqtdrjfsh` (eu-west-3). Public URL and key: `src/net/config.ts`.

- `migrations/` — the schema, applied in name order. Applied to the project as `accounts_boards` and `stars_for_search_path`.
  Add a change as a new file; never edit one that has been applied.
- `tests/rules.sql` — plays several players against the rules. Run locally with `scripts/db-test.sh` (plain Postgres plus
  `tests/shim.sql`, a stand-in for Supabase's roles and `auth.uid()`). On the real project the same script runs inside a
  transaction that ends by raising `ALL RULES OK (rolled back)`, so no test data stays.
- Tunable numbers (board threshold, ratings needed, limits, coins) live in the one-row table `public.rules`.
- Make a player the developer: `update public.profiles set is_admin = true where nickname = '...'` (SQL editor).
