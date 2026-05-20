#!/usr/bin/env bash
#
# Load the committed supplier reference seed into the local Postgres so a
# collaborator gets an identical supplier catalog + Gemini-enriched
# capability data.
#
# Prereqs: `docker compose up -d` (DB running) and `npm run db:push` (schema
# created) must have run first.
#
# Safe by default: if the Supplier table already has rows, it refuses to run
# unless you pass --force. With --force it truncates the four reference tables
# (CASCADE — this also clears any dependent material-request / conversation
# rows) and reloads. On a fresh DB there's nothing to clear.
#
# Usage:
#   npm run db:seed              # bootstrap a fresh DB
#   npm run db:seed -- --force   # wipe reference tables + reload
#
set -euo pipefail

CONTAINER="${AGORA_PG_CONTAINER:-agora-pg}"
DB="${POSTGRES_DB:-agora_local}"
PGUSER_="${POSTGRES_USER:-peyton}"
SEED="prisma/seed/agora-suppliers.sql"

FORCE=0
for a in "$@"; do
  [ "$a" = "--force" ] && FORCE=1
done

if [ ! -f "$SEED" ]; then
  echo "Seed file $SEED not found. Has it been committed? (run db:seed:export to create it)" >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "Postgres container '${CONTAINER}' is not running. Run: docker compose up -d" >&2
  exit 1
fi

EXISTING=$(docker exec "$CONTAINER" psql -U "$PGUSER_" -d "$DB" -t -A \
  -c 'SELECT count(*) FROM "Supplier";' 2>/dev/null || echo "ERR")

if [ "$EXISTING" = "ERR" ]; then
  echo "Could not query the Supplier table. Did you run 'npm run db:push' to create the schema?" >&2
  exit 1
fi

if [ "$EXISTING" != "0" ] && [ "$FORCE" -ne 1 ]; then
  echo "Supplier table already has $EXISTING rows."
  echo "Re-run with --force to truncate the reference tables and reload"
  echo "(also clears dependent material-request rows), or 'docker compose down -v' for a clean DB." >&2
  exit 1
fi

if [ "$EXISTING" != "0" ]; then
  echo "Truncating reference tables (CASCADE)…"
  docker exec -i "$CONTAINER" psql -U "$PGUSER_" -d "$DB" -v ON_ERROR_STOP=1 -c \
    'TRUNCATE "Supplier","SupplierCapability","SupplierCategoryLink","SupplierContact" RESTART IDENTITY CASCADE;'
fi

echo "Loading seed…"
docker exec -i "$CONTAINER" psql -U "$PGUSER_" -d "$DB" -v ON_ERROR_STOP=1 < "$SEED" >/dev/null

COUNT=$(docker exec "$CONTAINER" psql -U "$PGUSER_" -d "$DB" -t -A -c 'SELECT count(*) FROM "Supplier";')
CAPS=$(docker exec "$CONTAINER" psql -U "$PGUSER_" -d "$DB" -t -A -c 'SELECT count(*) FROM "SupplierCapability";')
echo "Done. $COUNT suppliers, $CAPS capability rows loaded."
