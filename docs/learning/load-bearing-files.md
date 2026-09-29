# Load-Bearing Files

## `src/lib/middleware/withAuth.ts`
- What it does: Verifies the mock session headers, applies optional role gates, and turns thrown errors into JSON responses.
- What calls it: Every protected API route in `src/app/api/items/*`, `src/app/api/reservations/*`, and `src/app/api/alerts/*`.
- What it calls: `src/lib/auth/session.ts`, `src/lib/middleware/withRole.ts`, and `src/lib/http/api.ts`.
- What would break or become insecure if it were wrong: The entire auth boundary would weaken; a missing or malformed session could reach business logic.
- What a junior engineer would likely miswrite here: Returning 403 for missing auth, or forgetting to catch and normalize errors.

## `src/services/reservationService.ts`
- What it does: Owns hold creation, hold release, reservation scoping, and audit metadata.
- What calls it: `src/app/api/reservations/route.ts` and `src/app/api/reservations/[reservationId]/release/route.ts`.
- What it calls: `src/repositories/inMemoryInventoryRepository.ts`, `src/services/alertService.ts`, and `src/lib/middleware/withRole.ts`.
- What would break or become insecure if it were wrong: Clerks could see or release other users' holds, or reserved stock could drift from item counts.
- What a junior engineer would likely miswrite here: Doing the permission check only in the route and not inside the service.

## `src/services/inventoryService.ts`
- What it does: Owns item creation, metadata updates, and stock adjustments.
- What calls it: `src/app/api/items/route.ts`, `src/app/api/items/[itemId]/route.ts`, and `src/app/api/items/[itemId]/adjust-stock/route.ts`.
- What it calls: `src/repositories/inMemoryInventoryRepository.ts`, `src/services/alertService.ts`, and `src/lib/middleware/withRole.ts`.
- What would break or become insecure if it were wrong: Stock could go negative, low-stock alerts could lie, or unauthorized users could write inventory.
- What a junior engineer would likely miswrite here: Trusting the UI to keep stock counts valid.

## `src/services/alertService.ts`
- What it does: Opens, updates, or clears low-stock alerts based on item state.
- What calls it: `src/services/inventoryService.ts` and `src/services/reservationService.ts`.
- What it calls: `src/repositories/inMemoryInventoryRepository.ts`.
- What would break or become insecure if it were wrong: Operators would see duplicate alerts or stale alerts that never clear.
- What a junior engineer would likely miswrite here: Creating new alert rows on every stock change.

## `src/repositories/inMemoryInventoryRepository.ts`
- What it does: Stores and retrieves items, reservations, and alerts from seeded Maps.
- What calls it: The service singletons in `src/services/*.ts`.
- What it calls: `src/data/seed.ts` and `crypto.randomUUID`.
- What would break or become insecure if it were wrong: Every service would read or write inconsistent state; tests would become flaky.
- What a junior engineer would likely miswrite here: Returning live references instead of clones.

## `src/lib/validation/reservationSchemas.ts`
- What it does: Validates hold creation and release payloads before any service logic runs.
- What calls it: `src/app/api/reservations/route.ts` and `src/app/api/reservations/[reservationId]/release/route.ts`.
- What it calls: `zod`.
- What would break or become insecure if it were wrong: Invalid request shapes could reach inventory math, causing bad reservations or release errors.
- What a junior engineer would likely miswrite here: Letting quantity zero or an invalid item id through.

## `src/lib/validation/itemSchemas.ts`
- What it does: Validates item creation, metadata updates, and stock deltas.
- What calls it: `src/app/api/items/route.ts`, `src/app/api/items/[itemId]/route.ts`, and `src/app/api/items/[itemId]/adjust-stock/route.ts`.
- What it calls: `zod`.
- What would break or become insecure if it were wrong: A malformed write payload could make stock math or reorder thresholds unreliable.
- What a junior engineer would likely miswrite here: Accepting a zero stock adjustment or an empty update object.

## `src/components/dashboard/inventory-workbench.tsx`
- What it does: Lets a user exercise the actual API routes from a browser session with editable mock headers.
- What calls it: `src/app/page.tsx`.
- What it calls: The API routes under `src/app/api/*`.
- What would break or become insecure if it were wrong: The app would look functional while bypassing the code paths the backend is supposed to enforce.
- What a junior engineer would likely miswrite here: Hardcoding demo data instead of hitting the API.

## `src/app/api/reservations/[reservationId]/release/route.ts`
- What it does: Receives the release request and hands it to the reservation service after validation and auth.
- What calls it: The dashboard release form and any API client.
- What it calls: `src/lib/middleware/withAuth.ts`, `src/lib/validation/reservationSchemas.ts`, and `src/services/reservationService.ts`.
- What would break or become insecure if it were wrong: Double releases, missing audit trails, or unauthorized reservation edits.
- What a junior engineer would likely miswrite here: Treating a state transition like a simple update.
