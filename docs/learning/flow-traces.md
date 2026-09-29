# Flow Traces

## Flow: Manager creates an item
1. `src/components/dashboard/inventory-workbench.tsx` - the Create item form `onSubmit` handler calls `submitJson('/api/items', ...)`.
2. `src/app/api/items/route.ts` - `POST()` wraps the request in `withAuth()` and parses the body with `createItemSchema`.
3. `src/lib/middleware/withAuth.ts` - `withAuth()` checks the mock session headers and applies the owner/manager role gate.
4. `src/lib/validation/itemSchemas.ts` - `createItemSchema.parse()` rejects malformed fields before the service runs.
5. `src/services/inventoryService.ts` - `createItem()` writes the new item and asks the alert service to sync state.
6. `src/repositories/inMemoryInventoryRepository.ts` - `createItem()` inserts the item into the in-memory store.
7. `src/services/alertService.ts` - `syncLowStockAlertForItem()` opens or clears the alert based on derived availability.
8. Returns `201` with `{ item, alert }`.

## Flow: Clerk creates a stock hold
1. `src/components/dashboard/inventory-workbench.tsx` - the Create hold form `onSubmit` handler calls `submitJson('/api/reservations', ...)`.
2. `src/app/api/reservations/route.ts` - `POST()` runs through `withAuth()` and validates the hold body.
3. `src/lib/middleware/withAuth.ts` - `withAuth()` confirms the clerk session is present and that the role is allowed to create holds.
4. `src/lib/validation/reservationSchemas.ts` - `createHoldSchema.parse()` enforces a UUID item id, positive quantity, and a reason.
5. `src/services/reservationService.ts` - `createHold()` checks availability, bumps the reserved quantity, creates the reservation, and syncs alerts.
6. `src/repositories/inMemoryInventoryRepository.ts` - `updateItem()` and `createReservation()` persist the new state.
7. Returns `201` with `{ reservation, item, alert }`.

## Flow: Manager adjusts stock and clears a low-stock alert
1. `src/components/dashboard/inventory-workbench.tsx` - the Adjust stock form `onSubmit` handler calls `submitJson('/api/items/:itemId/adjust-stock', ...)`.
2. `src/app/api/items/[itemId]/adjust-stock/route.ts` - `POST()` wraps the request in `withAuth()` and parses the stock delta.
3. `src/lib/middleware/withAuth.ts` - `withAuth()` allows only owners and managers through.
4. `src/lib/validation/itemSchemas.ts` - `adjustStockSchema.parse()` rejects zero-delta and malformed requests.
5. `src/services/inventoryService.ts` - `adjustStock()` prevents negative on-hand stock and stock below reserved quantity.
6. `src/repositories/inMemoryInventoryRepository.ts` - `updateItem()` stores the new on-hand value.
7. `src/services/alertService.ts` - `syncLowStockAlertForItem()` clears the alert when the item is no longer low stock.
8. Returns `200` with `{ item, alert }`.

## Flow: Clerk tries to create an item and is rejected
1. `src/components/dashboard/inventory-workbench.tsx` - the Create item form submits to `/api/items` with the clerk session headers.
2. `src/app/api/items/route.ts` - `POST()` enters the auth wrapper for item creation.
3. `src/lib/middleware/withAuth.ts` - `withAuth()` rejects the request before validation because `clerk` is not in `['owner', 'manager']`.
4. Returns `403` with `{ error: { code: 'FORBIDDEN', ... } }`.

## Flow: Clerk lists reservations and only sees their own holds
1. `src/components/dashboard/inventory-workbench.tsx` - `loadData()` calls `fetchJson('/api/reservations', ...)` with the clerk session headers.
2. `src/app/api/reservations/route.ts` - `GET()` wraps the request in `withAuth()` and delegates to the reservation service.
3. `src/lib/middleware/withAuth.ts` - `withAuth()` accepts the authenticated clerk session.
4. `src/services/reservationService.ts` - `listReservations()` scopes the repository query to `createdByUserId` for non-managers.
5. `src/repositories/inMemoryInventoryRepository.ts` - `listReservations()` filters and returns only the clerk-owned rows.
6. Returns `200` with `{ reservations }`.

## Flow: Clerk releases the same hold twice
1. `src/components/dashboard/inventory-workbench.tsx` - the Release hold form `onSubmit` handler calls `submitJson('/api/reservations/:reservationId/release', ...)`.
2. `src/app/api/reservations/[reservationId]/release/route.ts` - `POST()` wraps the request in `withAuth()` and validates the body.
3. `src/lib/middleware/withAuth.ts` - `withAuth()` accepts the authenticated clerk session.
4. `src/lib/validation/reservationSchemas.ts` - `releaseReservationSchema.parse()` validates the release reason.
5. `src/services/reservationService.ts` - `releaseHold()` checks the reservation status and throws a conflict on the second call because the hold is already released.
6. Returns `409` with `{ error: { code: 'CONFLICT', ... } }`.
