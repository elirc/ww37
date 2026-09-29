# 05. Practice

Run the finite loader command in chapter 04 before beginning. Use a fresh `InMemoryInventoryRepository(createSeedData())` for each exercise, and use the manager and clerk sessions already declared at the top of `tests/inventory.test.ts`. Keep assertions on returned values and repository state; do not inspect private Maps.

1. **Metadata PATCH.** Read the seeded `MILK-1L` item. Call `inventory.updateItem(item.id, { name: 'Whole Milk 1L - renamed' }, managerSession)`. Assert the name changed and the original SKU, unit, on-hand quantity, and reorder point are unchanged. Then call it with `{ reorderPoint: 0 }` and assert the returned reorder point is exactly zero. Explain why an `if (input.reorderPoint)` implementation fails.

2. **One hold trace.** Create a hold for quantity one through `reservationService.createHold`. Assert the returned reservation is active, the returned item has reserved quantity increased by one, and `getAvailableQuantity` equals on-hand minus reserved. List reservations for the clerk and assert the new reservation is visible to its creator.

3. **Concurrent capacity.** Change milk to ten on-hand and zero reserved. Create two services using the same repository and start two seven-unit holds without awaiting either first. Await `Promise.allSettled`; assert one is fulfilled and one rejected, then assert the stored reserved quantity is seven. Explain why two services matter.

4. **Failure rollback.** Supply an alert service whose sync method throws `new Error('alert sync failed')`. Attempt a one-unit hold and assert rejection with that message. Read the item and reservations afterward: reserved quantity must be zero and the item must have no reservation. Add a second normal alert service and prove the queue still accepts a valid one-unit hold.

5. **Release and stock invariant.** Create a two-unit hold, release it once, and assert status `released` and reserved quantity restored. Attempt a second release and assert an `AppError` with status 409. Also attempt an adjustment that would make on-hand below reserved and assert rejection while the item remains unchanged. Record which claims are directly covered by these tests and which would need an HTTP integration test.

6. **Safe integer boundary.** Call `createHold` directly with `quantity: Number.MAX_SAFE_INTEGER + 1`, and call `adjustStock` directly with the same unsafe delta. Assert both return the application validation error before any write. Capture all item, reservation, and alert lists before and after and compare the complete serialized snapshots.

7. **Read isolation limit.** Start a repository `runExclusive` callback that updates an item to 99, signals an `entered` promise, and waits on a `resume` promise. After `entered` resolves, call `getItemById` outside the callback and record whether it sees 99. Resume the callback and await it. Explain why this proves unlocked reads may observe an intermediate write and why adding the same lock around `getItemById` inside callbacks would deadlock.
