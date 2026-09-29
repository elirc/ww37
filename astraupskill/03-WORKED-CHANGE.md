# 03. Worked change: safe item PATCH and serialized holds

The first repair is in `createInventoryService.updateItem`. After manager authorization and an existence check, it creates an empty repository patch. It copies `sku`, `name`, `unit`, and `reorderPoint` only when each input is present. A rename request therefore reaches the repository as `{ name: 'Whole Milk 1L - renamed' }`; the repository spread changes only that property. A request with `{ reorderPoint: 0 }` reaches the repository with zero because zero is a defined number. Stock fields do not pass through this metadata method, so callers use `adjustStock` for on-hand changes and reservation services for reserved quantity.

The second repair wraps `createHold`, `releaseHold`, `createItem`, `updateItem`, and `adjustStock` in the repository boundary. The critical hold sequence is now: await the queue, snapshot Maps, read the current item, calculate availability, update reserved quantity, create the reservation, synchronize the alert, return; on any error restore the snapshot and release the queue. Two `createReservationService(repository, alertService)` instances still share the same queue because the queue belongs to the repository, not a service closure. One seven-unit hold can commit against ten units; the second reads the committed reserved quantity and gets a conflict.

The alert service remains inside the boundary. That matters because an alert is part of the observable result: after a successful mutation it corresponds to the final available quantity, and after an alert failure it must not describe a mutation that was rolled back. The rollback snapshot includes alerts as well as items and reservations. The implementation uses shallow clones because the domain records are flat objects. A future nested domain object would need a deeper clone or immutable records.

The existing route contract is unchanged. `POST /api/reservations` still validates a UUID, positive quantity, and reason before calling the service. `PATCH /api/items/:itemId` still uses its existing manager route and response shape. The change lives at the service and repository boundary so direct service calls receive the same state protections as HTTP calls. The test suite also keeps the original authorization, schema, double-release, and reservation-visibility checks.

A useful review question is whether every write in a sequence is covered. The inventory and reservation mutations call `runExclusive`; list methods do not need it. Alert synchronization is invoked from inside the callback and does not acquire the lock again, avoiding nested-lock deadlock. The comment in `reservationService.ts` names the boundary without claiming database guarantees.

Consider the interleaving that motivated the change. Before repair, hold A reads `(onHand=10,reserved=0)` and awaits; hold B reads the same clone and awaits. A writes seven, B writes seven based on its stale clone, and both create reservations. Depending on write order, the item may say seven while fourteen units of reservations exist, or the second write may make both reservations appear valid despite only three units being available. After repair, A's callback completes before B reads. B observes `(10,7)`, computes availability three, and raises the existing conflict error. The promise queue does not need a sleep or a timing assumption; the test starts both promises together and asserts the invariant.

The rollback path covers a different failure class. Item update and reservation insert can succeed while alert synchronization fails because an alert adapter throws or a future validation is added. Returning an error alone does not undo those writes. The snapshot restores all maps, including an alert that was created or cleared during the callback. This keeps the response contract honest: an unsuccessful request has no committed hold.

## The async `params` change in Next 15

`src/app/api/items/[itemId]/route.ts` declares its second argument as `{ params: Promise<{ itemId: string }> }` and awaits it. Before Next 15, `params` was a plain object; the Next 15 migration made it a Promise so the framework can start rendering before route segments are resolved. The sync version still works for one release but prints:

```
Route "/api/items/[itemId]" used `params.itemId`. `params` should be awaited before using its properties.
```

Before / after:

```typescript
// before (Next 14): sync
export async function PATCH(request: Request, { params }: { params: { itemId: string } }) {
  return handle(params.itemId, request);
}
// after (Next 15+): the params object is a Promise
export async function PATCH(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  return handle(itemId, request);
}
```

Forgetting the `await` compiles under the sync type, reads `undefined` for `itemId`, and turns every request into a 404: the type change is what makes the mistake visible.

