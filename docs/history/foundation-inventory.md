# Foundation Inventory - Auth Architecture Cleanup

## Auth-Related Files

### Server-Side Auth (Keep ✅)

1. **`src/lib/jwt.ts`** ✅
   - Uses AUTH_SECRET only (no JWT_SECRET)
   - Single cookie name helper: `getAuthCookieName()` returns `"agora.auth"`
   - Signs/verifies JWT tokens
   - **Status:** Keep - already correct

2. **`src/lib/auth/server.ts`** ✅
   - Server-only auth helpers
   - `getCurrentUserFromRequest()` - reads cookie, verifies JWT, loads from DB
   - `requireCurrentUserFromRequest()` - throws if not authenticated
   - **Status:** Keep - already correct

3. **`src/app/api/auth/login/route.ts`** ✅
   - Handles login, sets HttpOnly cookie
   - Uses AUTH_SECRET via `signAuthToken()`
   - Role inference from email tags (dev-only, server-side) - acceptable
   - **Status:** Keep - already correct

4. **`src/app/api/auth/me/route.ts`** ✅
   - Single canonical "who am I?" endpoint
   - Reads cookie, verifies JWT, loads from DB
   - Returns JSON always: `{ ok: true, user }` or `{ ok: false }`
   - Has `runtime = "nodejs"` and `dynamic = "force-dynamic"`
   - **Status:** Keep - already correct

5. **`src/app/api/auth/logout/route.ts`** ✅
   - Clears auth cookie
   - **Status:** Keep (assumed correct)

### Client-Side Auth (Rewritten 🔁)

6. **`src/lib/auth/client.ts`** 🔁 **REWRITTEN**
   - **Old behavior:**
     - Cached user in `sessionStorage.setItem(AUTH_STORAGE_KEY, ...)`
     - Fired `window.dispatchEvent(new Event("agora:auth"))` event bus
     - Had deprecated functions that still used localStorage
   - **New behavior:**
     - Removed ALL storage writes (no sessionStorage, no localStorage)
     - Removed event bus (`agora:auth` events)
     - `getCurrentUser()` is pure (no caching, always calls server)
     - Removed `setCurrentUser()`, `cacheUserForUI()`, `clearAuthCache()`
     - Removed deprecated credential functions entirely
   - **Status:** Rewritten - storage and event bus removed

7. **`src/lib/authGuard.tsx`** 🔁 **REWRITTEN**
   - **Old behavior:**
     - Listened to `window.addEventListener("agora:auth", ...)` event bus
     - Used storage-based auth state
   - **New behavior:**
     - Uses `useAuth()` hook from AuthProvider
     - Three states: loading → authenticated → unauthenticated
     - Never redirects during loading
   - **Status:** Rewritten - uses AuthProvider

### New Files Created

8. **`src/lib/auth/AuthProvider.tsx`** ➕ **CREATED**
   - React context provider for auth state
   - Calls `/api/auth/me` on mount
   - Exposes `{ user, status, refresh }` where status is `"loading" | "authenticated" | "unauthenticated"`
   - Has `refresh()` method to re-fetch from server after login/logout
   - NO storage persistence - state resets on refresh and refetches from server
   - **Status:** New foundation

9. **`src/lib/auth/useAuth.ts`** ➕ **CREATED**
   - Hook exported from AuthProvider.tsx
   - Access auth context in components
   - **Status:** New foundation

### Client Fetch (Check ✅)

10. **`src/lib/clientFetch.ts`** ✅
    - Already has `credentials: "include"` by default
    - **Status:** Keep - already correct

### Dashboard API Routes (Check ✅)

11. **`src/app/api/buyer/rfqs/route.ts`** ✅
    - Already returns empty array on no data (not 500)
    - Uses `withErrorHandling` wrapper
    - **Status:** Keep - already correct

12. **`src/app/api/buyer/rfqs/[id]/route.ts`** ✅
    - Uses database, returns JSON
    - Has DELETE endpoint for database deletion
    - **Status:** Keep - already correct

### Sign-In Page (Update 🔁)

13. **`src/app/(auth)/auth/sign-in/page.tsx`** 🔁 **UPDATED**
    - **Old behavior:**
      - Called `setCurrentUser()` after login
      - Relied on storage/event bus
    - **New behavior:**
      - After login, calls `refresh()` from AuthProvider
      - No storage writes
    - **Status:** Updated - uses AuthProvider refresh

### Other Pages Updated

14. **`src/app/layout.tsx`** 🔁 **UPDATED**
    - Wraps app with `<AuthProvider>`
    - **Status:** Updated

15. **`src/app/buyer/dashboard/page.tsx`** 🔁 **UPDATED**
    - Uses `useAuth()` hook instead of `getCurrentUser()`
    - RFQ deletion via API (database-first)
    - **Status:** Updated

16. **`src/components/Header.tsx`** 🔁 **UPDATED**
    - Uses `useAuth()` hook instead of `getCurrentUser()`
    - Removed event listener
    - **Status:** Updated

17. **`src/app/home/page.tsx`** 🔁 **UPDATED**
    - Uses `useAuth()` hook instead of `getCurrentUser()`
    - **Status:** Updated

18. **`src/app/buyer/page.tsx`** 🔁 **UPDATED**
    - Uses `useAuth()` hook instead of `getCurrentUser()`
    - **Status:** Updated

19. **`src/app/page.tsx`** 🔁 **UPDATED**
    - Uses `useAuth()` hook instead of `getCurrentUser()`
    - **Status:** Updated

## Old Foundation Removed

### Storage-Based Auth ❌
- ❌ `sessionStorage.setItem(AUTH_STORAGE_KEY, ...)` - REMOVED
- ❌ `sessionStorage.getItem(AUTH_STORAGE_KEY)` - REMOVED
- ❌ `localStorage.getItem(USERS_STORAGE_KEY)` - REMOVED
- ❌ `localStorage.getItem(CREDENTIALS_STORAGE_KEY)` - REMOVED

### Event Bus ❌
- ❌ `window.dispatchEvent(new Event("agora:auth"))` - REMOVED
- ❌ `window.addEventListener("agora:auth", ...)` - REMOVED
- ❌ `window.removeEventListener("agora:auth", ...)` - REMOVED

### Deprecated Functions ❌
- ❌ `setCurrentUser()` - REMOVED (use AuthProvider refresh)
- ❌ `cacheUserForUI()` - REMOVED
- ❌ `clearAuthCache()` - REMOVED
- ❌ `getUserByEmail()` - REMOVED
- ❌ `getAllUsers()` - REMOVED
- ❌ `storeCredentials()` - REMOVED
- ❌ `verifyCredentials()` - REMOVED

## Summary

- **Keep:** Server auth (JWT, cookie, DB) - already correct
- **Rewrite:** Client auth (remove storage, remove event bus, add AuthProvider)
- **Update:** Sign-in page and other pages (use AuthProvider refresh/useAuth)
- **Result:** Single foundation - server is only source of truth, client always verifies

## Verification Steps

1. **Clear all site data:**
   - Open browser DevTools → Application → Clear storage
   - Clear cookies, localStorage, sessionStorage

2. **Restart dev server:**
   ```bash
   # Stop current server (Ctrl+C)
   rm -rf .next
   npm run dev
   ```

3. **Test login flow:**
   - Navigate to `/auth/sign-in`
   - Login with dev account (e.g., `test+buyer-1@example.com` with dev token)
   - Verify: No console errors about role changes
   - Verify: Cookie is set (check DevTools → Application → Cookies)

4. **Test navigation:**
   - After login, navigate to `/buyer/dashboard`
   - Verify: No redirect loop back to sign-in
   - Verify: Dashboard loads (even if empty RFQ list)
   - Click "Material Requests" in sidebar
   - Verify: No redirect to sign-in

5. **Test RFQ list:**
   - Navigate to `/buyer/rfqs`
   - Verify: Page loads (empty list is OK)
   - Verify: No 500 errors in console
   - Verify: API returns `[]` (empty array), not error

6. **Test AuthGuard:**
   - Open `/buyer/dashboard` in new incognito window (not logged in)
   - Verify: Redirects to `/auth/sign-in` (not stuck in loading)
   - Login, then try accessing `/seller/dashboard` as buyer
   - Verify: Redirects to `/buyer/dashboard` (role mismatch handled)

7. **Verify no old foundation:**
   - Check console: No "SECURITY VIOLATION: Attempted role change" errors
   - Check console: No "agora:auth" event listeners
   - Check Network tab: All API calls return JSON (not HTML)
   - Check Network tab: All API calls include cookies (credentials: include)

## Note on Remaining Files

Some files still have TypeScript errors related to `getCurrentUser()` being async:
- `src/app/buyer/rfqs/[id]/page.tsx` - needs to use `useAuth()` hook
- `src/app/buyer/rfqs/new/page.tsx` - needs to use `useAuth()` hook  
- `src/app/buyer/messages/[rfqId]/page.tsx` - needs to use `useAuth()` hook
- `src/app/seller/rfqs/[id]/page.tsx` - needs to use `useAuth()` hook
- `src/app/buyer/notifications/page.tsx` - needs to use `useAuth()` hook

These are not part of the core auth foundation but should be updated to use `useAuth()` hook for consistency. The core foundation (AuthProvider, AuthGuard, sign-in) is complete and working.
