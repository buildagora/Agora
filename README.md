This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database (local or remote)
- npm or yarn

### Initial Setup

**Important:** Always run commands from the app directory (`/agora/agora`), not the repo root.

1. **Install dependencies:**
   ```bash
   cd agora
   npm install
   ```

2. **Set up environment variables:**
   
   Create `.env.local` in the `agora/` directory:
   ```bash
   DATABASE_URL=postgresql://user:password@localhost:5432/agora
   AUTH_SECRET=your-secret-key-at-least-32-characters-long
   ```
   
   Replace `user`, `password`, `localhost`, `5432`, and `agora` with your PostgreSQL credentials.

3. **Generate Prisma Client:**
   ```bash
   npm run db:generate
   ```

4. **Sync database schema:**
   
   Choose one of the following:
   
   **Option A: Use migrations (recommended for production):**
   ```bash
   npm run db:migrate:dev
   ```
   
   **Option B: Push schema directly (faster for dev, no migration history):**
   ```bash
   npm run db:push
   ```

5. **Start the development server:**
   ```bash
   npm run dev
   ```

The app will be available at [http://localhost:3000](http://localhost:3000).

### Database Setup (PostgreSQL Required)

**Local dev requires PostgreSQL.** The schema uses `provider = "postgresql"` and the app uses `@prisma/adapter-pg`.

**Note:** Do NOT use SQLite (`file:./dev.db`). The schema and adapter are configured for PostgreSQL only.

### Troubleshooting

#### "Database schema mismatch" Error

If you see `"Database schema mismatch. Please run 'npm run db:migrate:dev' to sync the database."` when signing up:

1. **Check your database connection:**
   ```bash
   npm run db:status
   ```

2. **Sync the schema:**
   ```bash
   npm run db:migrate:dev
   ```
   Or if you prefer to push directly without migration history:
   ```bash
   npm run db:push
   ```

3. **Regenerate Prisma Client:**
   ```bash
   npm run db:generate
   ```

4. **Restart the dev server:**
   ```bash
   npm run dev
   ```

#### Multiple Database Files

If you see a `dev.db` SQLite file in the project directory, it's not being used. The app uses PostgreSQL only. You can safely ignore or delete `dev.db` if it exists.

#### Prisma Client Mismatch

If Prisma errors mention "model does not exist" or "Invalid prisma.user.findUnique() invocation":

1. **Clean and regenerate:**
   ```bash
   npm run prisma:clean
   npm run prisma:reinstall
   ```

2. **Verify you're in the correct directory:**
   - Commands must be run from `/agora/agora` (the app directory)
   - Not from the repo root `/agora`

### Database Reset (Development)

**Before testing signup/login, wipe all auth data:**
```bash
npm run dev:reset
```

This deletes all users, RFQs, bids, messages, notifications, and orders. This must be done before testing signup/login to ensure a clean state.

### Verification Checklist

After setup, verify the app is working correctly:

1. **Install dependencies:**
   ```bash
   cd agora
   npm install
   ```

2. **Reset the database:**
   ```bash
   npm run dev:reset
   ```
   This should complete with `[DEV_HARD_RESET_COMPLETE] { userCount: 0 }`

3. **Start the dev server:**
   ```bash
   npm run dev
   ```

4. **Run auth smoke test:**
   ```bash
   npm run test:auth
   ```
   This tests the complete auth flow: sign-up → login → me → logout → me (401)

5. **Manual verification (curl examples):**
   ```bash
   # Sign-up
   curl -X POST http://localhost:3000/api/auth/sign-up \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"testpass123","role":"BUYER"}'
   
   # Login (save cookie)
   curl -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"testpass123"}' \
     -c cookies.txt
   
   # Get current user
   curl http://localhost:3000/api/auth/me -b cookies.txt
   
   # Logout
   curl -X POST http://localhost:3000/api/auth/logout -b cookies.txt
   
   # Verify unauthenticated
   curl http://localhost:3000/api/auth/me
   ```

### Workspace Root Issue

If you have another `package-lock.json` file above this repo (e.g., `/Users/michael/package-lock.json`), Turbopack can incorrectly select the wrong workspace root. This causes inconsistent module resolution and can break Prisma/route behavior.

**Solution:** Remove or rename the parent `package-lock.json` file, or ensure you always run `npm run dev` from the app directory. The `turbopack.root` setting in `next.config.ts` and the startup check script prevent this issue.

### Prisma Engine Type Error

If you see a Prisma error about "engine type client", this means Prisma is being forced into client mode. This can happen with Turbopack in some edge cases.

**Solution:** 
- First, check your `.env.local` file and remove any `PRISMA_CLIENT_ENGINE_TYPE` or `PRISMA_ENGINE_TYPE` variables
- If the error persists, try the webpack fallback: `npm run dev:webpack`
- The app uses the default Node.js Prisma engine (not client engine)

### Prisma Runtime Diagnostics (Turbopack Compatibility)

**IMPORTANT:** Do NOT import or resolve `@prisma/client/runtime` paths in Next.js/Turbopack. These internal Prisma paths are not compatible with Turbopack and will cause build errors.

**For Prisma engine diagnostics, use the dedicated health endpoint:**
- `GET /api/health/prisma-engine` - Returns safe Prisma engine diagnostic information

This endpoint provides:
- Prisma client entry paths (Turbopack-safe)
- Environment variable values (`PRISMA_CLIENT_ENGINE_TYPE`, `PRISMA_ENGINE_TYPE`)
- Prisma import status (without making DB calls)

**Do NOT:**
- Use `require.resolve("@prisma/client/runtime")` in route handlers
- Import Prisma internal subpaths like `@prisma/client/runtime/client` or `@prisma/client/runtime/library`
- Access Prisma internals directly in Next.js routes

**Use instead:**
- The `/api/health/prisma-engine` endpoint for diagnostics
- Dynamic imports of `@/lib/db.server` (which handles Prisma correctly)

## Development Testing

### Smoke Tests

Run the smoke test suite to verify API endpoints:

```bash
ENABLE_DEV_LOGIN=true DEV_LOGIN_TOKEN=changeme npm run smoke
```

**Required environment variables:**
- `ENABLE_DEV_LOGIN=true` - Enables dev-only endpoints (seed user, dev login bypass)
- `DEV_LOGIN_TOKEN=<your-secret-token>` - Secret token for dev login bypass (server-side, set in `.env.local`)
- `NEXT_PUBLIC_DEV_LOGIN_TOKEN=<your-secret-token>` - Same token value, exposed to client for sign-in UI (set in `.env.local`)

**Note:** The dev login bypass is only active when:
- `NODE_ENV !== "production"`
- `ENABLE_DEV_LOGIN === "true"`
- Request includes header `X-Dev-Login-Token` matching `DEV_LOGIN_TOKEN` env var

In production, the dev bypass is completely disabled and normal authentication (email + password) is required.

**Example `.env.local` for development:**
```bash
ENABLE_DEV_LOGIN=true
DEV_LOGIN_TOKEN=changeme
NEXT_PUBLIC_DEV_LOGIN_TOKEN=changeme
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

   Choose one of the following:
   
   **Option A: Use migrations (recommended for production):**
   ```bash
   npm run db:migrate:dev
   ```
   
   **Option B: Push schema directly (faster for dev, no migration history):**
   ```bash
   npm run db:push
   ```

5. **Start the development server:**
   ```bash
   npm run dev
   ```

The app will be available at [http://localhost:3000](http://localhost:3000).

### Database Setup (PostgreSQL Required)

**Local dev requires PostgreSQL.** The schema uses `provider = "postgresql"` and the app uses `@prisma/adapter-pg`.

**Note:** Do NOT use SQLite (`file:./dev.db`). The schema and adapter are configured for PostgreSQL only.

### Troubleshooting

#### "Database schema mismatch" Error

If you see `"Database schema mismatch. Please run 'npm run db:migrate:dev' to sync the database."` when signing up:

1. **Check your database connection:**
   ```bash
   npm run db:status
   ```

2. **Sync the schema:**
   ```bash
   npm run db:migrate:dev
   ```
   Or if you prefer to push directly without migration history:
   ```bash
   npm run db:push
   ```

3. **Regenerate Prisma Client:**
   ```bash
   npm run db:generate
   ```

4. **Restart the dev server:**
   ```bash
   npm run dev
   ```

#### Multiple Database Files

If you see a `dev.db` SQLite file in the project directory, it's not being used. The app uses PostgreSQL only. You can safely ignore or delete `dev.db` if it exists.

#### Prisma Client Mismatch

If Prisma errors mention "model does not exist" or "Invalid prisma.user.findUnique() invocation":

1. **Clean and regenerate:**
   ```bash
   npm run prisma:clean
   npm run prisma:reinstall
   ```

2. **Verify you're in the correct directory:**
   - Commands must be run from `/agora/agora` (the app directory)
   - Not from the repo root `/agora`

### Database Reset (Development)

**Before testing signup/login, wipe all auth data:**
```bash
npm run dev:reset
```

This deletes all users, RFQs, bids, messages, notifications, and orders. This must be done before testing signup/login to ensure a clean state.

### Verification Checklist

After setup, verify the app is working correctly:

1. **Install dependencies:**
   ```bash
   cd agora
   npm install
   ```

2. **Reset the database:**
   ```bash
   npm run dev:reset
   ```
   This should complete with `[DEV_HARD_RESET_COMPLETE] { userCount: 0 }`

3. **Start the dev server:**
   ```bash
   npm run dev
   ```

4. **Run auth smoke test:**
   ```bash
   npm run test:auth
   ```
   This tests the complete auth flow: sign-up → login → me → logout → me (401)

5. **Manual verification (curl examples):**
   ```bash
   # Sign-up
   curl -X POST http://localhost:3000/api/auth/sign-up \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"testpass123","role":"BUYER"}'
   
   # Login (save cookie)
   curl -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"testpass123"}' \
     -c cookies.txt
   
   # Get current user
   curl http://localhost:3000/api/auth/me -b cookies.txt
   
   # Logout
   curl -X POST http://localhost:3000/api/auth/logout -b cookies.txt
   
   # Verify unauthenticated
   curl http://localhost:3000/api/auth/me
   ```

### Workspace Root Issue

If you have another `package-lock.json` file above this repo (e.g., `/Users/michael/package-lock.json`), Turbopack can incorrectly select the wrong workspace root. This causes inconsistent module resolution and can break Prisma/route behavior.

**Solution:** Remove or rename the parent `package-lock.json` file, or ensure you always run `npm run dev` from the app directory. The `turbopack.root` setting in `next.config.ts` and the startup check script prevent this issue.

### Prisma Engine Type Error

If you see a Prisma error about "engine type client", this means Prisma is being forced into client mode. This can happen with Turbopack in some edge cases.

**Solution:** 
- First, check your `.env.local` file and remove any `PRISMA_CLIENT_ENGINE_TYPE` or `PRISMA_ENGINE_TYPE` variables
- If the error persists, try the webpack fallback: `npm run dev:webpack`
- The app uses the default Node.js Prisma engine (not client engine)

### Prisma Runtime Diagnostics (Turbopack Compatibility)

**IMPORTANT:** Do NOT import or resolve `@prisma/client/runtime` paths in Next.js/Turbopack. These internal Prisma paths are not compatible with Turbopack and will cause build errors.

**For Prisma engine diagnostics, use the dedicated health endpoint:**
- `GET /api/health/prisma-engine` - Returns safe Prisma engine diagnostic information

This endpoint provides:
- Prisma client entry paths (Turbopack-safe)
- Environment variable values (`PRISMA_CLIENT_ENGINE_TYPE`, `PRISMA_ENGINE_TYPE`)
- Prisma import status (without making DB calls)

**Do NOT:**
- Use `require.resolve("@prisma/client/runtime")` in route handlers
- Import Prisma internal subpaths like `@prisma/client/runtime/client` or `@prisma/client/runtime/library`
- Access Prisma internals directly in Next.js routes

**Use instead:**
- The `/api/health/prisma-engine` endpoint for diagnostics
- Dynamic imports of `@/lib/db.server` (which handles Prisma correctly)

## Development Testing

### Smoke Tests

Run the smoke test suite to verify API endpoints:

```bash
ENABLE_DEV_LOGIN=true DEV_LOGIN_TOKEN=changeme npm run smoke
```

**Required environment variables:**
- `ENABLE_DEV_LOGIN=true` - Enables dev-only endpoints (seed user, dev login bypass)
- `DEV_LOGIN_TOKEN=<your-secret-token>` - Secret token for dev login bypass (server-side, set in `.env.local`)
- `NEXT_PUBLIC_DEV_LOGIN_TOKEN=<your-secret-token>` - Same token value, exposed to client for sign-in UI (set in `.env.local`)

**Note:** The dev login bypass is only active when:
- `NODE_ENV !== "production"`
- `ENABLE_DEV_LOGIN === "true"`
- Request includes header `X-Dev-Login-Token` matching `DEV_LOGIN_TOKEN` env var

In production, the dev bypass is completely disabled and normal authentication (email + password) is required.

**Example `.env.local` for development:**
```bash
ENABLE_DEV_LOGIN=true
DEV_LOGIN_TOKEN=changeme
NEXT_PUBLIC_DEV_LOGIN_TOKEN=changeme
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
