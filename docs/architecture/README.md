# Architecture Overview

This app is a small-store inventory reservation system built around three core workflows: create a hold, release a hold, and keep low-stock alerts in sync when inventory changes. The backend shape is intentionally production-style even though persistence is mocked in-memory for a no-install learning build.

Top-level folders map to the system like this:

- `src/app` contains the request entrypoints and the page shell. `src/app/api/reservations/route.ts` and `src/app/api/items/route.ts` are the server boundaries, while `src/app/page.tsx` renders the dashboard shell.
- `src/components` contains the client workbench. `src/components/dashboard/inventory-workbench.tsx` is the only interactive UI and it exercises the actual API routes with mock session headers.
- `src/lib` contains shared infrastructure: `src/lib/auth/session.ts` reads the fake session, `src/lib/middleware/withAuth.ts` enforces auth and roles, `src/lib/validation/*.ts` defines the Zod boundary, and `src/lib/http/api.ts` turns errors into JSON responses.
- `src/services` contains business logic. `src/services/reservationService.ts` owns hold/release rules, `src/services/inventoryService.ts` owns item changes and stock math, and `src/services/alertService.ts` keeps low-stock alerts aligned with item state.
- `src/repositories` contains the persistence boundary. `src/repositories/inventoryRepository.ts` defines the contract and `src/repositories/inMemoryInventoryRepository.ts` provides the current in-memory implementation.
- `src/domain` contains pure entities and helpers. `src/domain/inventory.ts` defines the item, reservation, and alert shapes plus derived stock helpers.
- `src/data` contains seed data for learning and demo use. `src/data/seed.ts` keeps the starting inventory consistent with the alert state.
- `tests` contains focused behavior tests. `tests/inventory.test.ts` pins the auth rejection, validation, state transition, and data-scoping rules.

The important architectural choice is that all request handlers call into services instead of touching the repository directly. That is why the route files stay small and the stateful rules live in `src/services/*.ts`.
