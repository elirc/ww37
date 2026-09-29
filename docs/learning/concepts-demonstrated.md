# Concepts Demonstrated

## Service Layer
Where to look: `src/services/reservationService.ts` - `createHold()` and `releaseHold()` own the reservation workflow and stock math.
Also see: `src/services/inventoryService.ts` - `adjustStock()` owns inventory receiving and stock-shrinkage rules.
Risk if wrong: route files would start duplicating business rules and the permission surface would spread across the app.

## Repository Pattern
Where to look: `src/repositories/inventoryRepository.ts` - the interface defines the persistence contract.
Also see: `src/repositories/inMemoryInventoryRepository.ts` - the in-memory implementation stores and clones records.
Risk if wrong: services would couple to Maps or database-specific APIs and be hard to swap later.

## Zod Validation Boundary
Where to look: `src/lib/validation/itemSchemas.ts` - `createItemSchema`, `updateItemSchema`, and `adjustStockSchema` reject invalid shapes before business logic runs.
Also see: `src/lib/validation/reservationSchemas.ts` - `createHoldSchema` and `releaseReservationSchema` protect reservation writes.
Risk if wrong: malformed payloads would reach the stock math and produce hidden production bugs.

## Auth / Session Flow
Where to look: `src/lib/auth/session.ts` - `getSessionFromRequest()` builds the mock session from request headers.
Also see: `src/lib/middleware/withAuth.ts` - `withAuth()` blocks requests before handlers execute.
Risk if wrong: missing or fake session data would flow into the service layer.

## Role-Based Access Control
Where to look: `src/lib/auth/roles.ts` - `canManageInventory()`, `canCreateHold()`, and `canViewAllReservations()` define the role model.
Also see: `src/lib/middleware/withRole.ts` - `assertRoleAllowed()` and the boolean helpers turn role intent into reusable checks.
Risk if wrong: permission rules would drift between routes and services, which is how unauthorized writes happen.

## State Transitions
Where to look: `src/services/reservationService.ts` - `releaseHold()` changes a reservation from `active` to `released` and rejects a second release.
Also see: `src/services/inventoryService.ts` - `adjustStock()` prevents invalid inventory transitions like negative stock.
Risk if wrong: repeated releases or bad adjustments would silently corrupt counts.

## Audit Logging / Audit Fields
Where to look: `src/domain/inventory.ts` - `InventoryReservation` includes `createdByUserId`, `createdByUserName`, `releasedByUserId`, and `releaseReason`.
Also see: `src/services/reservationService.ts` - `createHold()` and `releaseHold()` populate those fields.
Risk if wrong: operators would not be able to tell who created or released a hold after the fact.

## Background Job Design
Where to look: `src/services/alertService.ts` - `syncLowStockAlertForItem()` runs inline after writes instead of in a worker.
Also see: `src/services/inventoryService.ts` and `src/services/reservationService.ts` - both call the sync method synchronously after mutations.
Risk if wrong: moving alert sync to a background job without idempotency would cause duplicate or stale alerts.

## Multi-Tenancy
Where to look: `src/lib/auth/session.ts` and `src/repositories/inventoryRepository.ts` - there is no `tenantId` in the current shape because this app models one store.
Also see: `src/services/reservationService.ts` - data isolation is user-based for reservations, not tenant-based.
Risk if wrong: adding tenants later without threading `tenantId` through every repository method would leak records across organizations.
