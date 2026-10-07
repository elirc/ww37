# Testing Rationale

All tests live in `tests/inventory.test.ts` and run with `npm test`, which is `node --experimental-strip-types --experimental-loader ./tests/register-alias.mjs --test ./tests/inventory.test.ts` (`package.json` scripts). There is no Vitest or Jest. The file currently contains 15 `test(...)` cases: the four original cases described first below, then the repair-era cases that pin serialization, rollback and validation behaviour.

## POST /api/items rejects clerk writes with 403 in tests/inventory.test.ts
This test is worth keeping because authorization bugs usually show up as "the button was hidden" while the API still accepts the write. A clerk should not be able to create item records, and the route-level `withAuth()` guard in `src/app/api/items/route.ts` is the thing that actually enforces that.

A more thorough production suite would add an integration test for each privileged route, plus a regression test that proves a manager can still create items while a clerk gets the same 403 response body shape.

## createHoldSchema rejects invalid hold payloads in tests/inventory.test.ts
This test is worth keeping because the reservation workflow depends on the request boundary rejecting bad quantities and malformed item ids before any stock math runs. If this regressed, the service layer would be forced to guess what the client meant.

A more thorough production suite would verify the exact validation messages and exercise both the hold creation route and the schema so we catch mismatches between the HTTP payload and the Zod contract.

## releaseHold rejects a second release of the same reservation in tests/inventory.test.ts
This test is worth keeping because release is a state transition, not a simple update. Without this guard, a stale client could release the same hold twice and inflate available stock.

A more thorough production suite would add a route-level integration test for `src/app/api/reservations/[reservationId]/release/route.ts` and a concurrency regression test that simulates two release attempts racing each other.

## listReservations scopes clerk visibility to the clerk's own holds in tests/inventory.test.ts
This test is worth keeping because data leakage is easy to miss when the UI filters records locally. The service layer is responsible for scoping reservation reads by `createdByUserId` for non-manager roles, so this test protects that backend rule.

A more thorough production suite would verify the same behavior through the route handler in `src/app/api/reservations/route.ts` and add a manager-case test proving elevated roles still see all reservations.

## The repair-era cases (lines 132-378)

| Test (line) | What it pins | Production bug class |
|---|---|---|
| `updateItem preserves omitted metadata fields and accepts reorder point zero` (132) | `updateItem` builds its patch only from defined keys (`src/services/inventoryService.ts:127-131`) and keeps `reorderPoint: 0` | a falsy check (`if (input.reorderPoint)`) silently dropping zero, or a spread writing `undefined` over stored fields |
| `serialized holds allow only one of two concurrent over-availability requests` (155) | two service instances sharing one repository cannot both reserve 7 of 10 units | check-then-act overselling across `await` points |
| `failed alert synchronization rolls back the whole hold mutation` (178) | `runExclusive` restores the Maps when the callback throws (`src/repositories/inMemoryInventoryRepository.ts:73-77`) | half-applied holds: counter bumped, reservation missing or vice versa |
| `service validation rejects unsafe direct inputs before writes` (200) | the hand-written validators in both services reject non-integers, unknown keys and short reasons even without the route | scripts or future routes bypassing Zod |
| `shared repository preserves sufficient concurrent hold totals` (253) | concurrent holds that *fit* all succeed and the counter equals their sum | over-serialization or lost updates |
| `hold and stock decrement cannot violate reserved quantity` (274) | an `adjustStock` racing a hold cannot leave `onHand < reservedQuantity` | cross-service races on the same item |
| `concurrent releases allow one state transition and reject the duplicate` (296) | the `active` check and the release write happen in one queued step | double release inflating available stock |
| `queue recovers after a rejected callback and alerts remain singular` (313) | `finally { release() }` keeps the queue moving after a failure, and only one open alert exists | a stuck promise chain after the first error |
| `unlocked reads can observe a suspended mutation callback` (335) | documents, rather than hides, that reads are not isolated | assuming the queue gives snapshot reads |
| `the service rejects an input the schema rejects even when the route is bypassed` (354) | `validateCreateInput`/`validateUpdateInput` reuse the Zod schemas (`inventoryService.ts:58-76`) | route and service validation drifting apart |
| `repository clones are shallow...` (369) | `InventoryItem` stays flat so `{ ...item }` is a sufficient copy | a nested field later added and mutated through a returned object |

## Blind spots

- No route-level test exists except the clerk `403` on `POST /api/items`. The `500` returned for a malformed JSON body (`src/lib/http/api.ts:40`) is untested.
- Nothing tests SKU uniqueness, because it is not enforced (see `docs/architecture/domain-model.md`).
- Nothing exercises `GET /api/alerts` or the `viewer` restriction on it.
- Header spoofing is out of scope by design: every test constructs sessions directly, and the header session accepts any role string the caller sends.
- The recorded evidence run (`astraupskill/evidence/test-script-01.json`, 2026-09-12) predates the last two cases in the file; the VERIFICATION page's "thirteen tests" refers to that run.
