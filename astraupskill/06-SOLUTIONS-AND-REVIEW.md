# 06. Solutions and review

These seven solutions match chapter 05. Use the imports and synthetic sessions already declared in `tests/inventory.test.ts`. Each test below has its own repository; paste an example into that file and run `npm test`. Examples copied from existing tests are already present there, so edit the original case instead of registering duplicate names. Service calls use the real repository and alert factories. A passing service test establishes state behavior; only the existing route test establishes an HTTP status/response boundary.

## 1. Metadata PATCH

The actual regression compares retained fields, then explicitly checks zero. Undefined means omission here; zero is a supplied value.

```ts
test('updateItem preserves omitted metadata fields and accepts reorder point zero', async () => {
  const repository = new InMemoryInventoryRepository(createSeedData());
  const alertService = createAlertService(repository);
  const inventory = createInventoryService(repository, alertService);
  const before = (await repository.listItems()).find((candidate) => candidate.sku === 'MILK-1L');
  assert.ok(before);

  const result = await inventory.updateItem(
    before.id,
    { name: 'Whole Milk 1L - renamed' },
    managerSession
  );
  assert.equal(result.item.name, 'Whole Milk 1L - renamed');
  assert.equal(result.item.sku, before.sku);
  assert.equal(result.item.unit, before.unit);
  assert.equal(result.item.onHand, before.onHand);
  assert.equal(result.item.reorderPoint, before.reorderPoint);

  const zero = await inventory.updateItem(before.id, { reorderPoint: 0 }, managerSession);
  assert.equal(zero.item.reorderPoint, 0);
  assert.equal(zero.item.sku, before.sku);
});
```

## 2. One hold trace

This complete additional example uses the same imports and sessions. Milk starts with zero reserved in the seed. Comparing against the returned pre-write clone also works if that seed changes. Available quantity is derived, so there is no separate counter to update.

```ts
test('practice one hold is visible to its creator', async () => {
  const repository = new InMemoryInventoryRepository(createSeedData());
  const reservations = createReservationService(repository, createAlertService(repository));
  const item = (await repository.listItems()).find((x) => x.sku === 'MILK-1L');
  assert.ok(item);
  const result = await reservations.createHold(
    { itemId: item.id, quantity: 1, reason: 'Order pickup' }, clerkSession);
  assert.equal(result.reservation.status, 'active');
  assert.equal(result.item.reservedQuantity, item.reservedQuantity + 1);
  assert.equal(result.item.onHand - result.item.reservedQuantity,
    item.onHand - item.reservedQuantity - 1);
  const visible = await reservations.listReservations(clerkSession);
  assert.ok(visible.some((x) => x.id === result.reservation.id));
});
```

## 3. Concurrent capacity

Ten units and two seven-unit requests must produce exactly one winner. Both reasons satisfy validation, so the rejection tests capacity rather than malformed input. Two service instances share one repository queue. The separate sufficient-capacity regression in the test file uses twenty units and expects two winners totaling fourteen.

```ts
test('serialized holds allow only one of two concurrent over-availability requests', async () => {
  const seed = createSeedData();
  seed.items = seed.items.map((item) =>
    item.sku === 'MILK-1L' ? { ...item, onHand: 10, reservedQuantity: 0 } : item
  );
  const repository = new InMemoryInventoryRepository(seed);
  const alertService = createAlertService(repository);
  const first = createReservationService(repository, alertService);
  const second = createReservationService(repository, alertService);
  const item = (await repository.listItems()).find((candidate) => candidate.sku === 'MILK-1L');
  assert.ok(item);

  const outcomes = await Promise.allSettled([
    first.createHold({ itemId: item.id, quantity: 7, reason: 'Concurrent order A' }, clerkSession),
    second.createHold({ itemId: item.id, quantity: 7, reason: 'Concurrent order B' }, clerkSession),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'rejected').length, 1);
  const stored = await repository.getItemById(item.id);
  assert.equal(stored?.reservedQuantity, 7);
  assert.ok((stored?.onHand ?? 0) >= (stored?.reservedQuantity ?? 0));
});
```

## 4. Failure rollback

The actual failure test verifies both item and reservation state. No timing delay is needed: the injected failure occurs after the writes but before the callback completes.

```ts
test('failed alert synchronization rolls back the whole hold mutation', async () => {
  const repository = new InMemoryInventoryRepository(createSeedData());
  const failingAlerts = {
    async syncLowStockAlertForItem(): Promise<null> {
      throw new Error('alert sync failed');
    },
    async listAlerts() {
      return [];
    },
  };
  const service = createReservationService(repository, failingAlerts);
  const item = (await repository.listItems()).find((candidate) => candidate.sku === 'MILK-1L');
  assert.ok(item);

  await assert.rejects(
    service.createHold({ itemId: item.id, quantity: 1, reason: 'Rollback proof' }, clerkSession),
    /alert sync failed/
  );
  assert.equal((await repository.getItemById(item.id))?.reservedQuantity, 0);
  assert.equal((await repository.listReservations({ itemId: item.id })).length, 0);
});
```

## 4 continued: queue recovery

This separate fresh fixture proves that a failed callback releases the queue, and the next valid hold produces only one open alert. Together these two tests cover rollback and progress after rejection.

```ts
test('queue recovers after a rejected callback and alerts remain singular', async () => {
  const repository = new InMemoryInventoryRepository(createSeedData());
  const item = (await repository.listItems()).find((candidate) => candidate.sku === 'SOAP-BAR');
  assert.ok(item);
  const failing = createReservationService(repository, {
    async syncLowStockAlertForItem(): Promise<null> {
      throw new Error('expected alert failure');
    },
    async listAlerts() {
      return [];
    },
  });
  await assert.rejects(failing.createHold({ itemId: item.id, quantity: 1, reason: 'Fail once' }, clerkSession));

  const alerts = createAlertService(repository);
  const working = createReservationService(repository, alerts);
  await working.createHold({ itemId: item.id, quantity: 1, reason: 'Retry after rollback' }, clerkSession);
  const openAlerts = await alerts.listAlerts({ itemId: item.id, status: 'open' });
  assert.equal(openAlerts.length, 1);
  assert.equal((await repository.getItemById(item.id))?.reservedQuantity, 1);
});
```

## 5. Release and stock invariant

Use a fresh fixture and valid reasons on every command. After releasing once, a duplicate must reject without changing state. Create a new hold before testing a stock decrement; otherwise zero remaining reservations would not exercise the below-reserved rule.

```ts
test('practice release and below-reserved adjustment', async () => {
  const repository = new InMemoryInventoryRepository(createSeedData());
  const alerts = createAlertService(repository);
  const reservations = createReservationService(repository, alerts);
  const inventory = createInventoryService(repository, alerts);
  const item = (await repository.listItems()).find((x) => x.sku === 'MILK-1L');
  assert.ok(item);
  const hold = await reservations.createHold(
    { itemId: item.id, quantity: 2, reason: 'Order pickup' }, clerkSession);
  const released = await reservations.releaseHold(hold.reservation.id,
    { releaseReason: 'Collected' }, clerkSession);
  assert.equal(released.reservation.status, 'released');
  assert.equal(released.item.reservedQuantity, item.reservedQuantity);
  await assert.rejects(reservations.releaseHold(hold.reservation.id,
    { releaseReason: 'Duplicate pickup' }, clerkSession),
    (error) => error instanceof AppError && error.statusCode === 409);
  await reservations.createHold(
    { itemId: item.id, quantity: 2, reason: 'Another order' }, clerkSession);
  const before = await repository.getItemById(item.id);
  await assert.rejects(inventory.adjustStock(item.id,
    { delta: -item.onHand, reason: 'Remove available stock' }, managerSession),
    (error) => error instanceof AppError && error.statusCode === 409);
  assert.deepEqual(await repository.getItemById(item.id), before);
});
```

## 6. Safe integers

The full regression includes both unsafe quantities and deltas, NaN, fractional quantities, blank metadata, unknown fields and empty PATCH input. Comparing all three collections detects partial side effects rather than merely checking an error message.

```ts
test('service validation rejects unsafe direct inputs before writes', async () => {
  const repository = new InMemoryInventoryRepository(createSeedData());
  const alerts = createAlertService(repository);
  const inventory = createInventoryService(repository, alerts);
  const reservations = createReservationService(repository, alerts);
  const item = (await repository.listItems()).find((candidate) => candidate.sku === 'MILK-1L');
  assert.ok(item);

  const before = JSON.stringify({
    items: await repository.listItems(),
    reservations: await repository.listReservations(),
    alerts: await repository.listAlerts(),
  });
  await assert.rejects(
    reservations.createHold({ itemId: item.id, quantity: Number.NaN, reason: 'bad quantity' } as never, clerkSession),
    (error) => error instanceof AppError && error.statusCode === 400
  );
  await assert.rejects(
    reservations.createHold({ itemId: item.id, quantity: 1.5, reason: 'bad quantity' } as never, clerkSession),
    (error) => error instanceof AppError && error.statusCode === 400
  );
  await assert.rejects(
    reservations.createHold({ itemId: item.id, quantity: Number.MAX_SAFE_INTEGER + 1, reason: 'bad quantity' } as never, clerkSession),
    (error) => error instanceof AppError && error.statusCode === 400
  );
  await assert.rejects(
    inventory.updateItem(item.id, { name: '' } as never, managerSession),
    (error) => error instanceof AppError && error.statusCode === 400
  );
  await assert.rejects(
    inventory.adjustStock(item.id, { delta: Number.NaN, reason: 'bad delta' } as never, managerSession),
    (error) => error instanceof AppError && error.statusCode === 400
  );
  await assert.rejects(
    inventory.adjustStock(item.id, { delta: Number.MAX_SAFE_INTEGER + 1, reason: 'bad delta' } as never, managerSession),
    (error) => error instanceof AppError && error.statusCode === 400
  );
  await assert.rejects(
    inventory.updateItem(item.id, { name: 'ok', unknownField: 'reject' } as never, managerSession),
    (error) => error instanceof AppError && error.statusCode === 400
  );
  await assert.rejects(
    inventory.updateItem(item.id, {} as never, managerSession),
    (error) => error instanceof AppError && error.statusCode === 400
  );
  const after = JSON.stringify({
    items: await repository.listItems(),
    reservations: await repository.listReservations(),
    alerts: await repository.listAlerts(),
  });
  assert.equal(after, before);
});
```

## 7. Read isolation limit

This actual test controls suspension with promises. The external read sees 99 before the callback finishes. Returned objects are clones, but cloning does not imply transaction isolation. Acquiring the same non-reentrant queue inside a callback would wait for itself and deadlock. A durable adapter needs an explicit isolation design.

```ts
test('unlocked reads can observe a suspended mutation callback', async () => {
  const repository = new InMemoryInventoryRepository(createSeedData());
  const item = (await repository.listItems()).find((candidate) => candidate.sku === 'MILK-1L');
  assert.ok(item);
  let entered!: () => void;
  let resume!: () => void;
  const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
  const resumePromise = new Promise<void>((resolve) => { resume = resolve; });
  const mutation = repository.runExclusive(async () => {
    await repository.updateItem(item.id, { onHand: 99 });
    entered();
    await resumePromise;
  });
  await enteredPromise;
  assert.equal((await repository.getItemById(item.id))?.onHand, 99);
  resume();
  await mutation;
});
```

## Review decision

The implemented contract is omission-safe metadata updates plus serialized, recoverable mutations sharing one in-memory repository. The queue protects cooperating service callbacks; ordinary reads and direct low-level writes are not automatically queued. No database, replica, browser or live identity provider was tested. A production adapter must define transactions, constraints, concurrent reads and durable alert behavior explicitly. The illustrative additional practice cases above are learning extensions; the recorded delivered suite contains thirteen tests, not a claim that these extra examples were separately executed.
