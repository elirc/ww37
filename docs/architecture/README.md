# Architecture Overview

This app is a small-store inventory reservation system built around three core workflows: create a hold, release a hold, and keep low-stock alerts in sync when inventory changes. The backend shape is production-style even though persistence is an in-memory repository for a no-install learning build. There is no Prisma schema and no database; `package.json` depends only on `next`, `react`, `react-dom` and `zod`.

## Top-level folders

- `src/app` contains the request entrypoints and the page shell. Six route files live under `src/app/api` (items, item by id, adjust-stock, reservations, release, alerts); `src/app/page.tsx` renders the dashboard shell.
- `src/components` contains the client workbench. `src/components/dashboard/inventory-workbench.tsx` is the only interactive UI and it exercises the real API routes with mock session headers.
- `src/lib` contains shared infrastructure: `src/lib/auth/session.ts` reads the header-based session, `src/lib/middleware/withAuth.ts` enforces authentication and route-level roles, `src/lib/validation/*.ts` defines the Zod boundary, `src/lib/errors.ts` defines `AppError`, and `src/lib/http/api.ts` turns results and errors into JSON responses.
- `src/services` contains business logic. `src/services/reservationService.ts` owns hold/release rules, `src/services/inventoryService.ts` owns item changes and stock math, and `src/services/alertService.ts` keeps low-stock alerts aligned with item state.
- `src/repositories` contains the persistence boundary. `src/repositories/inventoryRepository.ts` defines the contract (`:72-89`) including `runExclusive`, and `src/repositories/inMemoryInventoryRepository.ts` implements it with three `Map`s and a promise-chain mutation queue.
- `src/domain` contains pure entities and helpers. `src/domain/inventory.ts` defines the item, reservation and alert shapes plus `getAvailableQuantity` (`:54-56`) and `isItemLowStock` (`:58-60`).
- `src/data/seed.ts` builds three items, one active reservation and one open alert.
- `tests/inventory.test.ts` holds 15 `node:test` cases; `tests/register-alias.mjs` resolves `@/` imports for Node's strip-types mode.

## Layering and who owns what

```
route.ts ──► withAuth (session + optional role list)          src/lib/middleware/withAuth.ts:19-39
         ──► Zod .parse on body/query                          src/lib/validation/*.ts
         ──► service (role check again + validation again)     src/services/*.ts
               └─► repository.runExclusive(callback)           inMemoryInventoryRepository.ts:60-81
                     ├─ item / reservation writes
                     └─ alertService.syncLowStockAlertForItem   alertService.ts:23-65
errors ──► toErrorResponse                                      src/lib/http/api.ts:29-41
```

The important architectural choice is that all request handlers call into services instead of touching the repository directly, and that **every mutating service method wraps its whole sequence in `repository.runExclusive`** (`src/services/inventoryService.ts:100`, `:118`, `:144`; `src/services/reservationService.ts:79`, `:124`). That one call is what turns "update item, insert reservation, sync alert" into a serialized, all-or-nothing step for this process.

Authorization and validation are deliberately duplicated: routes pass a role list to `withAuth` and parse with Zod; services repeat both (`assertInventoryManager` at `inventoryService.ts:32-36`, `validateCreateInput` re-running `createItemSchema` at `:58-65`, hand-written checks in `reservationService.ts:40-64`). The comment at `inventoryService.ts:59-60` gives the reason: scripts, tests and future routes may call the service directly.

## What this architecture does not give you

- **Durability and multi-process safety.** One repository singleton per Node process (`inMemoryInventoryRepository.ts:245`). Restarting the server resets to the seed; two server instances would each have their own data and their own queue.
- **Read isolation.** Reads do not enter the queue; a read can observe a half-finished mutation. The test at `tests/inventory.test.ts:335-352` pins this deliberately.
- **Real identity.** The session is whatever the caller puts in three headers (see `auth-and-permissions.md`).

## Exercises

**Goal:** confirm that every mutation is serialized.
**Check:** you list exactly five `runExclusive` call sites in `src/services/` and can say why `listItems`, `getItem` and `listReservations` are not wrapped.

**Goal:** find the one place where a route reads data without a service.
**Check:** there is none — `GET /api/items/[itemId]` calls `inventoryService.getItem` (`src/app/api/items/[itemId]/route.ts:20`) and throws `notFoundError` in the route when it returns null.
