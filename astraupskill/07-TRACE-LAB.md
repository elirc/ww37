# 07. Trace lab: from request to state

Take `POST /api/reservations` as the primary trace. The dashboard component sends JSON with `itemId`, `quantity`, and `reason`, plus mock session headers. `src/app/api/reservations/route.ts` enters `withAuth`, so a missing session or forbidden role stops before business code. The route parses the body with `createHoldSchema`; malformed UUIDs, non-positive quantities, or blank reasons become a validation response. This boundary protects the service, but direct service tests still matter because a caller can bypass HTTP in a job or another route.

For an accepted clerk request, the handler invokes `reservationService.createHold(input, session)`. The service now enters `repository.runExclusive`. The repository waits for earlier mutations on that repository instance, snapshots items, reservations, and alerts, and then yields the callback. The callback reads a cloned item, derives available quantity, and rejects if the requested quantity exceeds it. Otherwise it writes the new reserved quantity, creates an active reservation carrying the item snapshot and actor fields, then calls `syncLowStockAlertForItem`.

The alert service reads the updated item. If available quantity is at or below reorder point, it creates or updates one open alert; otherwise it clears an open alert. Its result is returned with the reservation and item. The route serializes that result as a 201 response. If any callback operation throws, repository catch restores all three Maps and rethrows; the route converts the error. The client sees failure and no phantom hold exists.

A `PATCH /api/items/:itemId` trace differs at the mutation input. The route validates an optional metadata body and the service constructs a presence-aware patch. `name` only changes name; `reorderPoint: 0` changes threshold to zero. `onHand` is not accepted by that patch path. Stock adjustment has its own route and service operation, which checks resulting on-hand against zero and reserved quantity inside the same boundary before syncing alerts.

Release follows the reservation id. The service reads an active reservation, checks ownership or manager role, reads its item, verifies reserved quantity is sufficient, decrements reserved stock, marks the reservation released, and syncs the alert under one boundary. A second release sees status `released` and returns a conflict without writes. This trace gives reviewers a concrete place to ask whether a new write belongs inside the same boundary.

Use the trace as a debugging worksheet. At the HTTP edge record actor headers and raw JSON; after schema parsing record the typed input; at the service boundary record item id and actor role; inside the repository callback record the pre-mutation item and set of writes; after alert synchronization record derived availability and alert status. Never log a password or rely on a browser screenshot as evidence of a write. The finite tests use synthetic sessions and direct factory calls so the worksheet can be replayed without a running server.

One practical extension is a database adapter. Keep the route and service sequence, but implement `runExclusive` using a transaction that locks or conditionally updates the item row, inserts the reservation, and updates the alert in the same commit. Map a uniqueness or check constraint failure to the service conflict error. If the alert is eventually consistent, document that it is no longer part of the same atomic result and change the response/test contract deliberately. The current in-memory implementation demonstrates the state machine and rollback shape, not that future adapter for free.

## The accepted-hold path, in one function

This is the body the primary trace walks through, `src/services/reservationService.ts:78`. Read it as a single boundary: permission, validation, availability check, stock bump, reservation insert, and alert sync all run inside `repository.runExclusive`.

```ts
    async createHold(input: CreateHoldInput, session: Session): Promise<ReservationMutationResult> {
      return repository.runExclusive(async () => {
        if (!canCreateHoldAction(session.role)) {
          throw forbiddenError('View-only users cannot create stock holds.');
        }
        validateCreateHoldInput(input);

        const item = await repository.getItemById(input.itemId);
        if (!item) {
          throw notFoundError('Item not found.');
        }

        const availableQuantity = getAvailableQuantity(item);
        if (input.quantity > availableQuantity) {
          throw conflictError('Not enough available stock for this hold.', {
            availableQuantity,
            requestedQuantity: input.quantity,
          });
        }

        const updatedItem = await repository.updateItem(item.id, {
          reservedQuantity: item.reservedQuantity + input.quantity,
        });

        if (!updatedItem) {
          throw notFoundError('Item not found.');
        }

        // The repository-owned boundary keeps the stock bump and reservation insert together.
        const reservation = await repository.createReservation({
          itemId: item.id,
          itemSku: item.sku,
          itemName: item.name,
          quantity: input.quantity,
          reason: input.reason,
          status: 'active',
          createdByUserId: session.userId,
          createdByUserName: session.displayName,
        });

        const alert = await alertSync.syncLowStockAlertForItem(updatedItem);
        return { reservation, item: updatedItem, alert };
      });
```

