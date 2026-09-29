# Guided Reading Path

## Step 1 — `src/app/page.tsx`
**Why read this:** This is the entry shell for the app and shows how little page code should do in a backend-shaped frontend.
**What to look for:** The page only composes the workbench and the headline copy; it does not own business rules.
**What to trace:** It renders `src/components/dashboard/inventory-workbench.tsx`.
**What a junior would likely miss:** Putting fetch logic or permission checks here instead of in the route/service layers.

## Step 2 — `src/components/dashboard/inventory-workbench.tsx`
**Why read this:** It shows how the UI exercises the actual API routes instead of faking the data locally.
**What to look for:** The `fetchJson()` helper and the session header builder.
**What to trace:** It calls `src/app/api/items/route.ts`, `src/app/api/reservations/route.ts`, `src/app/api/alerts/route.ts`, and the mutation routes.
**What a junior would likely miss:** Assuming UI controls are enough to enforce permissions.

## Step 3 — `src/lib/auth/roles.ts`
**Why read this:** This file defines the role vocabulary the rest of the app uses.
**What to look for:** The permission helpers like `canManageInventory()` and `canViewAllReservations()`.
**What to trace:** It is consumed by `src/lib/middleware/withRole.ts`, `src/services/inventoryService.ts`, and `src/services/reservationService.ts`.
**What a junior would likely miss:** Re-encoding the same role rules in multiple routes.

## Step 4 — `src/lib/auth/session.ts`
**Why read this:** It shows how request identity is created from headers in this learning build.
**What to look for:** The `getSessionFromRequest()` header parsing and null rejection path.
**What to trace:** Called by `src/lib/middleware/withAuth.ts`.
**What a junior would likely miss:** Returning a half-valid session when the role header is malformed.

## Step 5 — `src/lib/middleware/withAuth.ts`
**Why read this:** This is the shared request gate for all protected routes.
**What to look for:** The 401 vs 403 split and the error-to-response conversion.
**What to trace:** It calls `src/lib/middleware/withRole.ts` and `src/lib/http/api.ts`.
**What a junior would likely miss:** Letting the service layer see unauthenticated requests.

## Step 6 — `src/lib/validation/itemSchemas.ts`
**Why read this:** This is the item mutation boundary and the first place bad input should die.
**What to look for:** The strict object shapes and the zero-delta / nonnegative checks.
**What to trace:** Used by `src/app/api/items/route.ts`, `src/app/api/items/[itemId]/route.ts`, and `src/app/api/items/[itemId]/adjust-stock/route.ts`.
**What a junior would likely miss:** Trusting the UI to never send invalid stock numbers.

## Step 7 — `src/lib/validation/reservationSchemas.ts`
**Why read this:** It protects reservation creation and release before any stock math runs.
**What to look for:** The UUID item id, positive quantity, and release-reason checks.
**What to trace:** Used by `src/app/api/reservations/route.ts` and `src/app/api/reservations/[reservationId]/release/route.ts`.
**What a junior would likely miss:** Letting hold creation proceed with an empty reason or zero quantity.

## Step 8 — `src/domain/inventory.ts`
**Why read this:** It defines the canonical state shape for items, reservations, and alerts.
**What to look for:** `getAvailableQuantity()` and `isItemLowStock()`.
**What to trace:** Called by `src/services/inventoryService.ts`, `src/services/reservationService.ts`, and `src/services/alertService.ts`.
**What a junior would likely miss:** Storing derived stock values in multiple places.

## Step 9 — `src/repositories/inventoryRepository.ts`
**Why read this:** It is the persistence contract every service depends on.
**What to look for:** The method surface area is intentionally narrow and async.
**What to trace:** Implemented by `src/repositories/inMemoryInventoryRepository.ts`.
**What a junior would likely miss:** Letting services reach into repository internals instead of using the interface.

## Step 10 — `src/repositories/inMemoryInventoryRepository.ts`
**Why read this:** It is the current storage engine and the easiest place to see what data the services really mutate.
**What to look for:** The clone-on-read pattern and the deterministic list ordering.
**What to trace:** Called by all service singletons.
**What a junior would likely miss:** Returning live references and accidentally mutating state from the caller.

## Step 11 — `src/services/alertService.ts`
**Why read this:** It shows how alerts stay synchronized without a background worker.
**What to look for:** The open-alert update path versus the clear path.
**What to trace:** Called by `src/services/inventoryService.ts` and `src/services/reservationService.ts`.
**What a junior would likely miss:** Creating a new alert every time instead of updating the existing one.

## Step 12 — `src/services/inventoryService.ts`
**Why read this:** This file owns item writes and the stock math rules.
**What to look for:** The negative-stock guard and the reserved-stock guard.
**What to trace:** Called by item API routes.
**What a junior would likely miss:** Moving stock validation into the UI or route layer only.

## Step 13 — `src/services/reservationService.ts`
**Why read this:** This file owns the most important business workflow in the app.
**What to look for:** The permission-aware list scope, the hold creation path, and the double-release rejection.
**What to trace:** Called by reservation API routes.
**What a junior would likely miss:** Forgetting that release is a state transition with audit data.
