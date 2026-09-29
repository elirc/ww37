# Request Lifecycle

Request: Clerk creates a stock hold
1. `src/app/api/reservations/route.ts` — `POST()` receives the request, wraps it in `withAuth()`, and parses the hold body with `createHoldSchema`.
2. `src/lib/middleware/withAuth.ts` — verifies the mock session headers and rejects missing or forbidden roles before the handler runs.
3. `src/lib/validation/reservationSchemas.ts` — `createHoldSchema.parse()` enforces a UUID item id, a positive quantity, and a reason string.
4. `src/services/reservationService.ts` — `createHold()` checks available stock, bumps the reserved quantity, creates the reservation record, and syncs alerts.
5. `src/repositories/inMemoryInventoryRepository.ts` — `updateItem()` and `createReservation()` persist the new state in memory.
6. Returns `201` with `{ reservation, item, alert }`.

Request: Manager adjusts stock on an item
1. `src/app/api/items/[itemId]/adjust-stock/route.ts` — `POST()` wraps the request in `withAuth()` and validates the adjustment payload.
2. `src/lib/middleware/withAuth.ts` — allows only owners and managers through the role gate.
3. `src/lib/validation/itemSchemas.ts` — `adjustStockSchema.parse()` rejects zero-delta or malformed stock changes.
4. `src/services/inventoryService.ts` — `adjustStock()` prevents negative stock and stock levels below current reservations, then syncs alerts.
5. `src/repositories/inMemoryInventoryRepository.ts` — `updateItem()` commits the new on-hand quantity.
6. Returns `200` with `{ item, alert }`.

Request: Viewer tries to create a new item
1. `src/app/api/items/route.ts` — `POST()` enters the route wrapper for item creation.
2. `src/lib/middleware/withAuth.ts` — rejects the request with `403` because `viewer` is not in `['owner', 'manager']`.
3. Returns `403` with `{ error: { code: 'FORBIDDEN', ... } }` before `src/lib/validation/itemSchemas.ts` or `src/services/inventoryService.ts` run.

Request: Clerk releases the same hold twice
1. `src/app/api/reservations/[reservationId]/release/route.ts` — `POST()` parses the release body and calls the service.
2. `src/lib/middleware/withAuth.ts` — confirms the session and role.
3. `src/lib/validation/reservationSchemas.ts` — `releaseReservationSchema.parse()` validates the request body.
4. `src/services/reservationService.ts` — `releaseHold()` sees the reservation status is already `released` on the second call and throws a conflict error.
5. Returns `409` with `{ error: { code: 'CONFLICT', ... } }`.
