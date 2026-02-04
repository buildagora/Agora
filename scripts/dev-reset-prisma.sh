#!/bin/bash
# Reset Prisma caches and regenerate client
# Usage: ./scripts/dev-reset-prisma.sh
# 
# This script cleans Next.js, Turbopack, and Prisma caches to fix:
# - Prisma client generation failures
# - Turbopack bundling issues
# - ".prisma/client/default" module not found errors
# - Prisma engine type configuration issues

set -e

echo "🧹 Cleaning Prisma and build caches..."

rm -rf .next
rm -rf .turbo
rm -rf node_modules/.prisma
rm -rf node_modules/@prisma/client

echo "📦 Reinstalling dependencies..."
npm install

echo "🔧 Regenerating Prisma Client..."
npx prisma generate

echo "✅ Done. Restart: npm run dev"

