# Request Lifecycle

Every route in this app has the same skeleton: `withAuth(request, { roles?, action }, handler)` (`src/lib/middleware/withAuth.ts:19-39`). The session check returns `401` directly; everything after it — role check, Zod parse, service call — runs inside a `try` whose `catch` hands the error to `toErrorResponse` (`src/lib/http/api.ts:29-41`): `AppError` → its status and code, `ZodError` → `400 VALIDATION_ERROR` with `issues`, anything else (including a `SyntaxError` from a malformed JSON body) → `500 INTERNAL_SERVER_ERROR`.

## Request: Clerk creates a stock hold

1. `src/app/api/reservations/route.ts:20-30` — `POST()` wraps the request in `withAuth()` with roles `owner, manager, clerk`.
2. `withAuth` resolves the header session (`src/lib/auth/session.ts:16-30`) and checks the role list (`src/lib/middleware/withRole.ts:12-16`).
3. `createHoldSchema.parse()` (`src/lib/validation/reservationSchemas.ts:10-16`) enforces a UUID item id, a positive integer quantity (coerced) and a reason of at least 3 trimmed characters, and rejects unknown keys (`.strict()`).
4. `reservationService.createHold()` (`src/services/reservationService.ts:78-121`) enters `repository.runExclusive` (`:79`) and, inside it:
   - refuses `viewer` (`:80-82`) and re-validates the input by hand (`:83`, rules at `:40-54`);
   - loads the item (`:85-88`) and compares the request with `onHand - reservedQuantity` (`:90-96`, `409` with `availableQuantity` and `requestedQuantity` in `details`);
   - increments `reservedQuantity` (`:98-100`), inserts the reservation as `active` with the caller's id and display name (`:107-116`);
   - syncs the low-stock alert for the updated item (`:118`).
5. `InMemoryInventoryRepository.runExclusive` (`src/repositories/inMemoryInventoryRepository.ts:60-81`) waits for the previous mutation, snapshots all three Maps (`:68-70`), runs the callback, and on any throw restores the snapshots (`:73-77`) before rethrowing; `finally` releases the queue (`:78-80`).
6. Returns `201` with `{ reservation, item, alert }` (`route.ts:27`).

## Request: Manager adjusts stock on an item

1. `src/app/api/items/[itemId]/adjust-stock/route.ts:13-27` — roles `owner, manager`; `adjustStockSchema.parse()` (`src/lib/validation/itemSchemas.ts:32-39`) rejects a zero delta and a reason shorter than 3 characters.
2. `inventoryService.adjustStock()` (`src/services/inventoryService.ts:143-180`) inside `runExclusive`:
   - `assertInventoryManager` (`:145`) and `validateAdjustmentInput` (`:146`, rules at `:78-87`);
   - `resolveNextStock` rejects results that are not safe integers (`:38-44`);
   - `409` if the result is negative (`:154-159`) or below `reservedQuantity` (`:161-167`);
   - write `onHand` (`:169-171`) and sync the alert (`:177`).
3. Returns `200` with `{ item, alert }`.

## Request: Viewer tries to create a new item

1. `src/app/api/items/route.ts:20-30` enters `withAuth` with roles `owner, manager`.
2. `assertRoleAllowed` throws `forbiddenError("You must be one of owner, manager to create inventory items.")`.
3. Returns `403 { error: { code: "FORBIDDEN", message } }` before the body is read, so neither `createItemSchema` nor `inventoryService` runs.

## Request: Clerk releases the same hold twice

1. `src/app/api/reservations/[reservationId]/release/route.ts:13-27` — roles `owner, manager, clerk`; `releaseReservationSchema` allows an optional `releaseReason` of at least 3 characters (`reservationSchemas.ts:18-22`).
2. `reservationService.releaseHold()` (`src/services/reservationService.ts:123-173`) inside `runExclusive`: validate (`:125`), load (`:126-129`), `409` unless `active` (`:131-133`), ownership check (`:135-137`), counter guard (`:144-149`), decrement `reservedQuantity` (`:151-153`), mark `released` with timestamp, releaser and reason defaulting to `"Released manually"` (`:159-164`), sync alert (`:170`).
3. The second call fails at `:131-133` and returns `409 { error: { code: "CONFLICT" } }`. Because both calls go through the same queue, two *concurrent* releases also produce exactly one success (`tests/inventory.test.ts:296-311`).

## Request: Alerts listing

`GET /api/alerts?state=open|cleared` (`src/app/api/alerts/route.ts:13-23`) parses the query with a strict schema; any value other than `open`/`cleared` is a `400`. No mutation, no queue.

## Failure modes worth tracing

- **Malformed JSON body** on any POST/PATCH: `await request.json()` throws `SyntaxError`, which is neither `AppError` nor `ZodError`, so the client receives `500` rather than `400` (`api.ts:40`).
- **Alert sync throws mid-hold**: the snapshot restore undoes the counter bump and the reservation insert; the test at `tests/inventory.test.ts:178-198` proves it with an injected failing alert service.
- **Rollback scope**: the restore swaps in the snapshot Maps wholesale (`inMemoryInventoryRepository.ts:74-76`). That is safe only because the queue guarantees no other mutation ran in between; a write that bypasses `runExclusive` during that window would be silently discarded.

## Exercises

**Goal:** predict the response for `POST /api/reservations` with body `not json` as a clerk.
**Check:** `500 INTERNAL_SERVER_ERROR`, citing `api.ts:40`.

**Goal:** explain why the over-availability race needs `runExclusive` even though Node is single-threaded.
**Check:** your answer names the `await` points between the availability read (`reservationService.ts:85-90`) and the counter write (`:98`), where the other request's callback could otherwise run.
