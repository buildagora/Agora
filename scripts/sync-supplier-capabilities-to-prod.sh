#!/usr/bin/env bash
#
# Sync local public."SupplierCapability" rows into production.
#
# Touches ONLY public."SupplierCapability". Does not modify Supplier, users,
# RFQs, messages, orders, AgentThread, or any other table.
#
# Prerequisites:
#   - .env.local with DATABASE_URL (local Postgres)
#   - .env.production.local with DATABASE_URL (production Postgres)
#   - postgresql@17 client tools (Homebrew path preferred)
#
# Usage (from repo root):
#   bash scripts/sync-supplier-capabilities-to-prod.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TABLE='public."SupplierCapability"'

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

log() {
  echo "==> $*"
}

# Read DATABASE_URL= from a dotenv file (first match, strips optional quotes).
read_database_url_from_file() {
  local file="$1"
  local line
  if [[ ! -f "$file" ]]; then
    fail "Missing env file: $file"
  fi
  line="$(grep -E '^[[:space:]]*DATABASE_URL=' "$file" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    fail "DATABASE_URL not found in $file"
  fi
  line="${line#DATABASE_URL=}"
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  if [[ "$line" == \"*\" ]]; then
    line="${line:1:${#line}-2}"
  elif [[ "$line" == \'*\' ]]; then
    line="${line:1:${#line}-2}"
  fi
  printf '%s' "$line"
}

# Prefer Homebrew PostgreSQL 17 clients for version parity with Neon/production.
PG17_BIN="/opt/homebrew/opt/postgresql@17/bin"
if [[ -x "${PG17_BIN}/pg_dump" && -x "${PG17_BIN}/pg_restore" && -x "${PG17_BIN}/psql" ]]; then
  PG_DUMP="${PG17_BIN}/pg_dump"
  PG_RESTORE="${PG17_BIN}/pg_restore"
  PSQL="${PG17_BIN}/psql"
else
  PG_DUMP="pg_dump"
  PG_RESTORE="pg_restore"
  PSQL="psql"
fi

for bin in "$PG_DUMP" "$PG_RESTORE" "$PSQL"; do
  command -v "$bin" >/dev/null 2>&1 || fail "Required command not found: $bin"
done

log "Loading LOCAL_DATABASE_URL from .env.local"
LOCAL_DATABASE_URL="$(read_database_url_from_file ".env.local")"

log "Loading PROD_DATABASE_URL from .env.production.local"
PROD_DATABASE_URL="$(read_database_url_from_file ".env.production.local")"

# Safety: never run if source and target are the same connection string.
if [[ "$LOCAL_DATABASE_URL" == "$PROD_DATABASE_URL" ]]; then
  fail "LOCAL and PROD DATABASE_URL are identical — aborting to avoid self-clobber."
fi

# Safety: local should be a dev mirror; production should not be localhost.
if [[ "$LOCAL_DATABASE_URL" != *localhost* && "$LOCAL_DATABASE_URL" != *127.0.0.1* ]]; then
  fail "LOCAL_DATABASE_URL does not look like localhost — point .env.local at local Postgres."
fi
if [[ "$PROD_DATABASE_URL" == *localhost* || "$PROD_DATABASE_URL" == *127.0.0.1* ]]; then
  fail "PROD_DATABASE_URL points at localhost — fix .env.production.local before syncing."
fi

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="${ROOT}/backups"
mkdir -p "$BACKUP_DIR"

PROD_BACKUP="${BACKUP_DIR}/prod_supplier_capability_${TIMESTAMP}.dump"
LOCAL_EXPORT="${BACKUP_DIR}/local_supplier_capability_${TIMESTAMP}.dump"

# Run a single SQL expression; prints one row (no headers).
psql_scalar() {
  local url="$1"
  local sql="$2"
  "$PSQL" "$url" -v ON_ERROR_STOP=1 -At -c "$sql"
}

# Verification metrics used before/after sync (local source vs production target).
capability_counts_sql() {
  cat <<SQL
SELECT
  (SELECT COUNT(*) FROM ${TABLE}) AS total,
  (SELECT COUNT(*) FROM ${TABLE} WHERE "categoryId" = 'plumbing') AS plumbing,
  (SELECT COUNT(*) FROM ${TABLE}
     WHERE subcategory ILIKE '%sink%'
        OR brand ILIKE '%sink%'
        OR COALESCE("productLine", '') ILIKE '%sink%'
        OR COALESCE(notes, '') ILIKE '%sink%') AS sinks;
SQL
}

read_counts() {
  local url="$1"
  local row
  row="$(psql_scalar "$url" "$(capability_counts_sql)")"
  IFS='|' read -r CAP_TOTAL CAP_PLUMBING CAP_SINK <<<"$row"
}

print_counts() {
  local label="$1"
  echo "  ${label} total capabilities: ${CAP_TOTAL}"
  echo "  ${label} plumbing capabilities: ${CAP_PLUMBING}"
  echo "  ${label} sink capabilities: ${CAP_SINK}"
}

on_err() {
  echo "" >&2
  echo "FAIL: sync aborted (see errors above)." >&2
  if [[ -n "${PROD_BACKUP:-}" && -f "${PROD_BACKUP:-}" ]]; then
    echo "Production rollback dump (if needed): ${PROD_BACKUP}" >&2
    echo "  ${PG_RESTORE} --clean --if-exists --no-owner --no-privileges --dbname=\"\$PROD_DATABASE_URL\" \"${PROD_BACKUP}\"" >&2
  fi
}
trap on_err ERR

log "Step 1/7 — Back up production ${TABLE} (custom format) before any writes"
"$PG_DUMP" "$PROD_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --table="$TABLE" \
  --file="$PROD_BACKUP"
log "Production backup written: ${PROD_BACKUP}"

log "Step 2/7 — Export local ${TABLE} data only (no schema, no other tables)"
"$PG_DUMP" "$LOCAL_DATABASE_URL" \
  --format=custom \
  --data-only \
  --no-owner \
  --no-privileges \
  --table="$TABLE" \
  --file="$LOCAL_EXPORT"
log "Local export written: ${LOCAL_EXPORT}"

log "Step 3/7 — Verify production table exists and record pre-sync row count"
PROD_PRE_TOTAL="$(psql_scalar "$PROD_DATABASE_URL" "SELECT COUNT(*) FROM ${TABLE};")"
log "Production pre-sync row count: ${PROD_PRE_TOTAL}"

log "Step 4/7 — Record local source counts (expected after restore)"
read_counts "$LOCAL_DATABASE_URL"
LOCAL_TOTAL="$CAP_TOTAL"
LOCAL_PLUMBING="$CAP_PLUMBING"
LOCAL_SINK="$CAP_SINK"
print_counts "Local source"

log "Step 5/7 — TRUNCATE production ${TABLE} only (no CASCADE — other tables untouched)"
"$PSQL" "$PROD_DATABASE_URL" -v ON_ERROR_STOP=1 -c "TRUNCATE TABLE ${TABLE};"

log "Step 6/7 — Restore local capability data into production (data-only, single table dump)"
"$PG_RESTORE" \
  --data-only \
  --no-owner \
  --no-privileges \
  --dbname="$PROD_DATABASE_URL" \
  "$LOCAL_EXPORT"

log "Step 7/7 — Verify production counts after restore"
read_counts "$PROD_DATABASE_URL"
print_counts "Production"

if [[ "$CAP_TOTAL" != "$LOCAL_TOTAL" || "$CAP_PLUMBING" != "$LOCAL_PLUMBING" || "$CAP_SINK" != "$LOCAL_SINK" ]]; then
  fail "Post-restore production counts do not match local source (total=${CAP_TOTAL} vs ${LOCAL_TOTAL}, plumbing=${CAP_PLUMBING} vs ${LOCAL_PLUMBING}, sinks=${CAP_SINK} vs ${LOCAL_SINK}). Roll back with: ${PG_RESTORE} --clean --if-exists --no-owner --no-privileges --dbname=\"\$PROD_DATABASE_URL\" \"${PROD_BACKUP}\""
fi

trap - ERR

echo ""
echo "SUCCESS: Synced ${TABLE} from local → production."
echo "  Production backup: ${PROD_BACKUP}"
echo "  Local export used: ${LOCAL_EXPORT}"
echo "  Pre-sync production rows: ${PROD_PRE_TOTAL}"
echo "  Post-sync production rows: ${CAP_TOTAL} (plumbing: ${CAP_PLUMBING}, sinks: ${CAP_SINK})"
