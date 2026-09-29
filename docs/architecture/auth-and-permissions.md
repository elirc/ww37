# Auth and Permissions

Auth is intentionally explicit and header-based in this learning build. `src/lib/auth/session.ts` reads `x-user-id`, `x-user-name`, and `x-user-role` from the incoming request and turns them into a `Session` object. If the headers are missing or the role is invalid, the request never reaches the business logic.

Permission enforcement is centralized in `src/lib/middleware/withAuth.ts` and `src/lib/middleware/withRole.ts`. The route wrappers call `withAuth()` first, which rejects unauthenticated requests with `401` and blocks forbidden roles with `403` before the handler body runs. The actual role rules live in `src/lib/auth/roles.ts` as helpers such as `canManageInventory()`, `canCreateHold()`, and `canViewAllReservations()`.

Concrete examples from the code:

- `src/app/api/items/route.ts` uses `withAuth(... { roles: ['owner', 'manager'] })` so only managers and owners can create items.
- `src/app/api/items/[itemId]/adjust-stock/route.ts` uses the same role gate because stock adjustments are inventory mutations, not UI-only actions.
- `src/services/reservationService.ts` checks `canViewAllReservationAction()` and the reservation owner before releasing a hold, so clerks can only release their own reservations.
- `src/services/reservationService.ts` also scopes `listReservations(session)` to `createdByUserId` for non-manager roles, which is the data-isolation rule this app uses instead of multi-tenancy.

Multi-tenancy is not included because the product requirement describes one small store, not multiple organizations or tenants. If we added tenants later, we would need to thread `tenantId` through `src/lib/auth/session.ts`, all route contexts, `src/repositories/inventoryRepository.ts`, and every repository method that currently reads or writes items, reservations, or alerts. The important thing would be making tenant scoping impossible to forget, not sprinkling `tenantId` checks in the UI.

The senior concern in this design is that the auth headers are only a learning substitute. In a real deployment, `src/lib/auth/session.ts` would become an adapter over a real session source, but `withAuth.ts` and the service-layer authorization checks should stay in place.
