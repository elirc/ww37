# Auth and Permissions

## Where the session comes from

Auth is explicit and header-based in this learning build. `getSessionFromRequest()` (`src/lib/auth/session.ts:16-30`) reads `x-user-id`, `x-user-name` and `x-user-role`. It returns `null` — and `withAuth` answers `401 UNAUTHORIZED` (`src/lib/middleware/withAuth.ts:24-28`) — when the user id is missing or the role is not one of `owner | manager | clerk | viewer` (`src/lib/auth/roles.ts:8`, `:14-16`). A missing name silently becomes `"Unnamed User"` (`session.ts:18`).

**Every field of the session is caller-asserted, including the role.** Sending `x-user-role: owner` makes the caller an owner. Nothing checks the user id against a user store (there is none), and `x-user-name` is copied into `reservation.createdByUserName` (`src/services/reservationService.ts:115`), so audit-looking fields are spoofable too. This is acceptable only because the app is a local learning build; it is the first thing a real deployment must replace.

## Two layers of role checks

**Route layer.** Each route passes an optional `roles` list to `withAuth`; `assertRoleAllowed` (`src/lib/middleware/withRole.ts:12-16`) throws `403 FORBIDDEN` with a message naming the allowed roles. The error is converted by `toErrorResponse` (`src/lib/http/api.ts:29-41`) because the handler runs inside `withAuth`'s `try` (`withAuth.ts:30-38`).

| Route | Roles passed to `withAuth` |
|---|---|
| `GET /api/items`, `GET /api/items/[itemId]`, `GET /api/reservations` | none — any valid session, including `viewer` |
| `POST /api/items`, `PATCH /api/items/[itemId]`, `POST .../adjust-stock` | `owner`, `manager` |
| `POST /api/reservations`, `POST .../release` | `owner`, `manager`, `clerk` |
| `GET /api/alerts` | `owner`, `manager`, `clerk` (`src/app/api/alerts/route.ts:14`) |

**Service layer.** Services re-check with the boolean helpers from `roles.ts` (wrapped one-to-one in `withRole.ts:18-36`):

- `inventoryService` calls `assertInventoryManager` (`src/services/inventoryService.ts:32-36`) at the top of `createItem`, `updateItem` and `adjustStock`.
- `reservationService.createHold` refuses `viewer` (`src/services/reservationService.ts:80-82`).
- `reservationService.releaseHold` allows the release when the caller can view the reservation **and** is either an owner/manager (`canReleaseAnyReservation`) or the reservation's creator (`:135-137`). For non-managers both halves reduce to "you created it", so a clerk can release only their own holds.
- `reservationService.listReservations` returns everything for owner/manager and filters by `createdByUserId` otherwise (`:68-76`). That is the only data-isolation rule in the app.

The duplication is intentional: tests and scripts call services directly, and `tests/inventory.test.ts:38` (route) plus the service-level cases exercise both layers.

## Ordering details a reviewer should notice

- In `releaseHold` the existence (`404`) and status (`409`) checks run before the ownership check (`reservationService.ts:126-137`). A clerk who guesses another clerk's reservation id learns whether it exists and whether it is still active before being refused. With UUID ids this is low risk, but it is the opposite of the usual "authorize, then reveal" order.
- `GET /api/items/[itemId]` is open to `viewer`, while `GET /api/alerts` is not. A viewer can still infer low stock by comparing `onHand - reservedQuantity` with `reorderPoint` on each item.
- Route schemas use `z.coerce.number()` (`src/lib/validation/itemSchemas.ts:15-16`, `:25`, `:34`; `reservationSchemas.ts:13`). Coercion turns `""` and `null` into `0` and `true` into `1`, so `{"initialOnHand": ""}` is accepted as zero stock.

## Multi-tenancy

Not included: the product is one small store. Adding tenants would mean threading `tenantId` through `Session`, every repository method in `src/repositories/inventoryRepository.ts:72-89`, the Maps (or tables) and the seed. The important property would be making tenant scoping impossible to forget at the repository boundary rather than adding checks in routes or UI.

## Exercises

**Goal:** become an owner without credentials.
**Check:** you send `x-user-id: anyone`, `x-user-role: owner` to `POST /api/items` and explain why `session.ts:21` accepts it.

**Goal:** show the release rule for a manager.
**Check:** you point out that `canViewReservation` (`reservationService.ts:30-32`) is always true for managers and `canReleaseReservationAction` is true too, so the `||` branch at `:135` never fires for them.

**Goal:** predict the response to `POST /api/items` with `{"sku":"ABC","name":"Xy","unit":"ea","initialOnHand":"","reorderPoint":null}` as a manager.
**Check:** `201`, with `onHand: 0` and `reorderPoint: 0`, and an open low-stock alert because available `0 <= 0`.
