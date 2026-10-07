# 04. Testing and debugging

The finite test command is:

```text
npm test
```

The loader resolves imports such as `@/services/reservationService` to `src/services/reservationService.ts`. Node 22 strips TypeScript syntax for this test harness. The test file uses `node:test` and `node:assert/strict`, so each test exits without a watcher or server. The project runner records the command, working directory, exit code, elapsed time, and unedited output in this course's `evidence/` folder.

The baseline tests protect behavior around the API role gate, Zod hold validation, double release, and clerk reservation scoping. The new rename test first reads the seeded milk item, submits only `name`, and checks SKU, unit, on-hand quantity, and reorder point remain identical. It then submits `reorderPoint: 0` and checks zero survives. This pair distinguishes omission from falsiness.

The concurrency test creates one repository and two reservation service instances. It changes milk to ten on-hand units, starts two seven-unit holds with `Promise.allSettled`, and asserts one fulfillment and one rejection. It then reads the repository and checks reserved quantity is seven and not greater than on-hand. A service-local lock would fail this test because each service instance would have its own lock.

The rollback test injects an alert object whose `syncLowStockAlertForItem` throws. The hold has already attempted the item and reservation writes when alert synchronization fails. The repository boundary must restore reserved quantity to zero and leave no reservation. Because the queue releases in `finally`, a later operation can proceed; add a follow-up hold when debugging a stuck queue.

When a test fails, inspect state after each awaited repository call rather than adding sleeps. If both concurrent holds succeed, verify both services received the same repository object and that every service mutation is wrapped. If metadata becomes undefined, log the patch passed to `updateItem`; an allowlist should show only supplied keys. If rollback leaves a reservation, include the reservations Map in the snapshot. If a subsequent test hangs, look for a callback that throws before the release path or for an accidental nested `runExclusive`.

The checks do not establish multi-process durability or SQL isolation. Those are follow-up integration tests for a real adapter.

## Debugging the running app, not just the tests

These are symptoms you can hit through the HTTP API, with the line that explains each:

| Symptom | Cause |
|---|---|
| `401 UNAUTHORIZED` although headers look right | `x-user-role` is not exactly one of `owner`, `manager`, `clerk`, `viewer` (`src/lib/auth/roles.ts:8`, `src/lib/auth/session.ts:21`). Roles are case-sensitive. |
| `500 INTERNAL_SERVER_ERROR` on a POST | the body is not valid JSON; `request.json()` throws a `SyntaxError` that `toErrorResponse` does not recognise (`src/lib/http/api.ts:29-41`). |
| `409` "Stock cannot drop below the quantity already reserved." | `onHand + delta < reservedQuantity` (`src/services/inventoryService.ts:161-167`); release holds first. |
| `409` "The item record no longer matches the reservation quantity." | the stored `reservedQuantity` counter is smaller than the hold being released (`src/services/reservationService.ts:144-149`), only reachable if something wrote the counter outside the hold/release paths. |
| A new bread alert appears after an unrelated metadata edit | bread is seeded at available 6 with reorder point 6, which is low stock under `<=` (`src/domain/inventory.ts:58-60`), but the seed ships no bread alert (`src/data/seed.ts`). The first sync creates it. |
| Data vanished | the dev server restarted; the repository is a module singleton (`src/repositories/inMemoryInventoryRepository.ts:245`). |

## Exercises

**Goal:** write a failing-first test for duplicate SKUs.
**Check:** your test creates two items with the same SKU through `createInventoryService` and asserts the second rejects with `409`; today creation succeeds, so the test fails until a uniqueness check is added inside `createItem`'s `runExclusive` callback.

**Goal:** prove the rollback restores alerts as well as items.
**Check:** your test injects an alert service whose `syncLowStockAlertForItem` first calls the real one and then throws; afterwards `repository.listAlerts()` matches the pre-call list exactly, because the alerts Map is part of the snapshot (`inMemoryInventoryRepository.ts:70`, `:76`).

