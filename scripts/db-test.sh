#!/bin/sh
# Applies supabase/migrations to a fresh local database (plain Postgres plus supabase/tests/shim.sql) and runs the rule tests.
# Usage: scripts/db-test.sh [psql connection options]   default: -h /tmp/pgsock -p 5499 -U postgres
set -e
CONN=${*:-"-h /tmp/pgsock -p 5499 -U postgres"}
P="psql $CONN -v ON_ERROR_STOP=1 -q -X"
$P -c "drop database if exists neonrush_test" -c "create database neonrush_test"
$P -d neonrush_test -f supabase/tests/shim.sql
for f in supabase/migrations/*.sql; do $P -d neonrush_test -f "$f"; done
$P -d neonrush_test -t -f supabase/tests/rules.sql
