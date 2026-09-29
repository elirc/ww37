# Testing Rationale

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
