# Build Journal

## Stage Log

1. Defined the app as a single-store inventory reservation system with mock header auth and no multi-tenancy.
2. Chose an in-memory repository boundary instead of Prisma/Postgres for this learning build, while keeping the repository interface shaped so a Prisma adapter could be added later without rewriting services.
3. Built the domain, validation, auth, and repository layers first so the service layer could enforce real business rules instead of acting like glue.
4. Added the item, reservation, and alert services next so stock holds, releases, and low-stock alert sync all live in one reviewable place.
5. Added the API routes and dashboard workbench after the backend rules existed so the UI could exercise the real request path.
6. Added focused tests for auth rejection, schema rejection, invalid state transition, and data-scoped reads.

## PR Slices

### Slice 1 - Core domain, auth, validation, and repository boundary
Purpose: Establish the data model and the reusable request guardrails before any route logic exists.
Files with novel logic: `src/domain/inventory.ts`, `src/lib/auth/roles.ts`, `src/lib/auth/session.ts`, `src/lib/errors.ts`, `src/lib/http/api.ts`, `src/lib/middleware/withAuth.ts`, `src/lib/middleware/withRole.ts`, `src/lib/validation/itemSchemas.ts`, `src/lib/validation/reservationSchemas.ts`, `src/lib/validation/alertSchemas.ts`, `src/repositories/inventoryRepository.ts`, `src/repositories/inMemoryInventoryRepository.ts`, `src/data/seed.ts`.
Reviewer focus:
- `src/lib/middleware/withAuth.ts` near the `if (!session)` branch and the role-gate call. Verify 401 vs 403 behavior.
- `src/repositories/inMemoryInventoryRepository.ts` near the list/update methods. Verify clone-on-read and deterministic ordering.
- `src/lib/validation/itemSchemas.ts` and `src/lib/validation/reservationSchemas.ts` near the schema definitions. Verify the nonnegative, positive, and strict-object constraints.
Junior reviewer miss: approving the repository because it "works" without noticing that returning live references would leak mutable state.

### Slice 2 - Business services
Purpose: Put the stock math, hold/release workflow, and alert sync behind service functions.
Files with novel logic: `src/services/alertService.ts`, `src/services/inventoryService.ts`, `src/services/reservationService.ts`.
Reviewer focus:
- `src/services/reservationService.ts` near `createHold()` and `releaseHold()`. Verify the permission checks, availability check, and double-release rejection.
- `src/services/inventoryService.ts` near `adjustStock()`. Verify negative stock and reserved-stock guards.
- `src/services/alertService.ts` near `syncLowStockAlertForItem()`. Verify it updates an existing open alert instead of creating duplicates.
Junior reviewer miss: approving the service layer without checking that the alert sync is called after every stock-changing mutation.

### Slice 3 - API routes
Purpose: Expose the service layer through thin, reviewable HTTP handlers.
Files with novel logic: `src/app/api/items/route.ts`, `src/app/api/items/[itemId]/route.ts`, `src/app/api/items/[itemId]/adjust-stock/route.ts`, `src/app/api/reservations/route.ts`, `src/app/api/reservations/[reservationId]/release/route.ts`, `src/app/api/alerts/route.ts`.
Reviewer focus:
- `src/app/api/reservations/[reservationId]/release/route.ts` near the `withAuth()` wrapper and schema parse. Verify the handler cannot release without auth and body validation.
- `src/app/api/items/route.ts` near the POST handler. Verify only owners and managers can create items.
- `src/app/api/alerts/route.ts` near the query parse. Verify the alert state query is validated before the service is called.
Junior reviewer miss: approving the routes because they are "thin" without noticing that the role lists are the real security boundary.

### Slice 4 - Dashboard UI
Purpose: Give the app a realistic surface for exercising the API paths and mock auth headers.
Files with novel logic: `src/app/layout.tsx`, `src/app/page.tsx`, `src/components/dashboard/inventory-workbench.tsx`, `src/app/globals.css`.
Reviewer focus:
- `src/components/dashboard/inventory-workbench.tsx` near `loadData()` and the form submit handlers. Verify it hits the API routes and passes the mock session headers.
- `src/app/page.tsx` near the `InventoryWorkbench` render. Verify the page is just composition and not business logic.
- `src/app/globals.css` near the background and color variables. Verify the page has a deliberate visual direction rather than boilerplate styling.
Junior reviewer miss: approving the UI because it "looks good" while not checking whether it actually exercises the backend rules.

### Slice 5 - Tests and documentation
Purpose: Lock the most load-bearing behaviors and teach the architecture through code-anchored docs.
Files with novel logic: `tests/inventory.test.ts`, `docs/architecture/*.md`, `docs/learning/*.md`.
Reviewer focus:
- `tests/inventory.test.ts` near each test body. Verify the tests cover auth rejection, validation rejection, invalid transition, and scoped reads.
- `docs/architecture/request-lifecycle.md` and `docs/learning/flow-traces.md`. Verify every request trace names the real files and functions in the actual order.
- `docs/learning/build-journal.md` near the PR slices section. Verify the slices match the implementation boundaries.
Junior reviewer miss: skipping the docs because they are "just docs" even though they are the learning artifact for this project.
