#!/usr/bin/env bash
# Spin up the local Postgres dev mirror via Docker Compose.
#
# Why: Neon branches we test against are ephemeral. Local Postgres is free,
# fast, and survives Neon resets.
#
# Usage:  bash scripts/setup-local-db.sh
#
# Idempotent — re-running just verifies the container is up.

set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not installed. https://docs.docker.com/engine/install/" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

echo "Starting agora-pg via docker compose..."
docker compose up -d postgres

echo
echo "Waiting for Postgres to accept connections..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U peyton -d agora_local >/dev/null 2>&1; then
    echo "Ready."
    break
  fi
  sleep 1
done

cat <<EOF

Local Postgres ready.

Connection string:
  postgresql://peyton:agora_dev@localhost:5433/agora_local

Next steps:
  1. In .env.local, set:
       DATABASE_URL="postgresql://peyton:agora_dev@localhost:5433/agora_local"
       # keep your Neon URL around as a fallback:
       NEON_DATABASE_URL="<your current DATABASE_URL value>"
  2. Push the Prisma schema to local:
       npm run db:push
  3. (Optional) Clone current Neon branch's data into local:
       npx tsx -r dotenv/config scripts/clone-neon-to-local.ts dotenv_config_path=.env.local

Stop:   docker compose stop
Wipe:   docker compose down -v
EOF
