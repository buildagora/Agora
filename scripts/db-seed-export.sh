#!/usr/bin/env bash
#
# Export the supplier reference data — the catalog plus the Gemini-enriched
# SupplierCapability rows — to a committed seed file. This is the data
# collaborators need to get an identical supplier/search experience.
#
# Deliberately EXCLUDES every user/transactional table (User, MaterialRequest,
# conversations, analytics, etc.) — those hold real PII and test noise and must
# never be committed to git.
#
# Re-run this whenever the supplier catalog or capability data changes
# (e.g. after another enrichment crawl), then commit prisma/seed/agora-suppliers.sql.
#
# Usage: npm run db:seed:export
#
set -euo pipefail

CONTAINER="${AGORA_PG_CONTAINER:-agora-pg}"
DB="${POSTGRES_DB:-agora_local}"
PGUSER_="${POSTGRES_USER:-peyton}"
OUT="prisma/seed/agora-suppliers.sql"

mkdir -p "$(dirname "$OUT")"

docker exec "$CONTAINER" pg_dump -U "$PGUSER_" -d "$DB" \
  --data-only --no-owner --no-privileges \
  -t '"Supplier"' \
  -t '"SupplierCapability"' \
  -t '"SupplierCategoryLink"' \
  -t '"SupplierContact"' \
  > "$OUT"

LINES=$(wc -l < "$OUT")
SIZE=$(du -h "$OUT" | cut -f1)
echo "Wrote $OUT ($SIZE, $LINES lines). Commit it to share with collaborators."
