import assert from 'node:assert/strict';
import test from 'node:test';

import { POST as createItemRoute } from '@/app/api/items/route';
import { AppError } from '@/lib/errors';
import { createSeedData } from '@/data/seed';
import { createAlertService } from '@/services/alertService';
import { createInventoryService } from '@/services/inventoryService';
import { createReservationService } from '@/services/reservationService';
import { InMemoryInventoryRepository } from '@/repositories/inMemoryInventoryRepository';
import { createHoldSchema } from '@/lib/validation/reservationSchemas';

const managerSession = {
  userId: 'manager-01',
  displayName: 'Store Manager',
  role: 'manager' as const,
};

const clerkSession = {
  userId: 'clerk-01',
  displayName: 'Maya Clerk',
  role: 'clerk' as const,
};

function createRequest(body: unknown, session = clerkSession): Request {
  return new Request('http://localhost/api/items', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-user-id': session.userId,
      'x-user-name': session.displayName,
      'x-user-role': session.role,
    },
    body: JSON.stringify(body),
  });
}

test('POST /api/items rejects clerk writes with 403', async () => {
  // This catches the bug where the UI hides a button but the API still allows a forbidden write.
  const response = await createItemRoute(
    createRequest({
      sku: 'NUT-BTR',
      name: 'Peanut Butter',
      unit: 'jar',
      initialOnHand: 12,
      reorderPoint: 4,
    })
  );

  assert.equal(response.status, 403);
  const payload = (await response.json()) as { error: { code: string } };
  assert.equal(payload.error.code, 'FORBIDDEN');
});

test('createHoldSchema rejects invalid hold payloads', () => {
  // This catches malformed reservation requests before they can reach the stock math.
  const result = createHoldSchema.safeParse({
    itemId: 'not-a-uuid',
    quantity: 0,
    reason: '  ',
  });

  assert.equal(result.success, false);
});

test('releaseHold rejects a second release of the same reservation', async () => {
  // This catches a state-transition bug where a released hold could be released again and inflate inventory.
  const repository = new InMemoryInventoryRepository(createSeedData());
  const alertService = createAlertService(repository);
  const reservationService = createReservationService(repository, alertService);
  const item = (await repository.listItems()).find((candidate) => candidate.sku === 'MILK-1L');

  assert.ok(item);

  const hold = await reservationService.createHold(
    {
      itemId: item!.id,
      quantity: 1,
      reason: 'Customer pickup later today',
    },
    clerkSession
  );

  await reservationService.releaseHold(
    hold.reservation.id,
    {
      releaseReason: 'Picked up by customer',
    },
    clerkSession
  );

  await assert.rejects(
    reservationService.releaseHold(
      hold.reservation.id,
      {
        releaseReason: 'Trying to release twice',
      },
      clerkSession
    ),
    (error) => error instanceof AppError && error.statusCode === 409
  );
});

test("listReservations scopes clerk visibility to the clerk's own holds", async () => {
  // This catches a data-leak bug where one clerk could accidentally see another clerk's reservations.
  const repository = new InMemoryInventoryRepository(createSeedData());
  const alertService = createAlertService(repository);
  const reservationService = createReservationService(repository, alertService);
  const item = (await repository.listItems()).find((candidate) => candidate.sku === 'MILK-1L');

  assert.ok(item);

  await reservationService.createHold(
    {
      itemId: item!.id,
      quantity: 1,
      reason: 'Manager review hold',
    },
    managerSession
  );

  const clerkReservations = await reservationService.listReservations(clerkSession);

  assert.ok(clerkReservations.length > 0);
  assert.ok(clerkReservations.every((reservation) => reservation.createdByUserId === clerkSession.userId));
  assert.equal(
    clerkReservations.some((reservation) => reservation.createdByUserId === managerSession.userId),
    false
  );
});

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

test('shared repository preserves sufficient concurrent hold totals', async () => {
  const seed = createSeedData();
  seed.items = seed.items.map((candidate) =>
    candidate.sku === 'MILK-1L' ? { ...candidate, onHand: 20, reservedQuantity: 0 } : candidate
  );
  const repository = new InMemoryInventoryRepository(seed);
  const alerts = createAlertService(repository);
  const first = createReservationService(repository, alerts);
  const second = createReservationService(repository, alerts);
  const item = (await repository.listItems()).find((candidate) => candidate.sku === 'MILK-1L');
  assert.ok(item);

  const outcomes = await Promise.allSettled([
    first.createHold({ itemId: item.id, quantity: 7, reason: 'Concurrent A' }, clerkSession),
    second.createHold({ itemId: item.id, quantity: 7, reason: 'Concurrent B' }, clerkSession),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 2);
  assert.equal((await repository.getItemById(item.id))?.reservedQuantity, 14);
  assert.equal((await repository.listReservations({ itemId: item.id, status: 'active' })).length, 2);
});

test('hold and stock decrement cannot violate reserved quantity', async () => {
  const seed = createSeedData();
  seed.items = seed.items.map((candidate) =>
    candidate.sku === 'MILK-1L' ? { ...candidate, onHand: 10, reservedQuantity: 0 } : candidate
  );
  const repository = new InMemoryInventoryRepository(seed);
  const alerts = createAlertService(repository);
  const reservations = createReservationService(repository, alerts);
  const inventory = createInventoryService(repository, alerts);
  const item = (await repository.listItems()).find((candidate) => candidate.sku === 'MILK-1L');
  assert.ok(item);

  const outcomes = await Promise.allSettled([
    reservations.createHold({ itemId: item.id, quantity: 7, reason: 'Concurrent hold' }, clerkSession),
    inventory.adjustStock(item.id, { delta: -5, reason: 'Concurrent delivery' }, managerSession),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  const stored = await repository.getItemById(item.id);
  assert.ok(stored);
  assert.ok(stored.onHand >= stored.reservedQuantity);
});

test('concurrent releases allow one state transition and reject the duplicate', async () => {
  const repository = new InMemoryInventoryRepository(createSeedData());
  const alerts = createAlertService(repository);
  const reservations = createReservationService(repository, alerts);
  const item = (await repository.listItems()).find((candidate) => candidate.sku === 'MILK-1L');
  assert.ok(item);
  const hold = await reservations.createHold({ itemId: item.id, quantity: 2, reason: 'Double release test' }, clerkSession);

  const outcomes = await Promise.allSettled([
    reservations.releaseHold(hold.reservation.id, { releaseReason: 'Release A' }, clerkSession),
    reservations.releaseHold(hold.reservation.id, { releaseReason: 'Release B' }, clerkSession),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'rejected').length, 1);
  assert.equal((await repository.getItemById(item.id))?.reservedQuantity, 0);
});

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

test('the service rejects an input the schema rejects even when the route is bypassed', async () => {
  // Route validation is one boundary; the service is another. A script or a future route that calls
  // the service directly must get the same 400, from the same schema.
  const repository = new InMemoryInventoryRepository(createSeedData());
  const inventory = createInventoryService(repository, createAlertService(repository));
  await assert.rejects(
    inventory.createItem({ sku: 'ab', name: 'Too short', unit: 'ea', initialOnHand: 1, reorderPoint: 0 }, managerSession),
    (error: unknown) => error instanceof AppError && error.statusCode === 400
  );
  await assert.rejects(
    inventory.updateItem('missing', {}, managerSession),
    (error: unknown) => error instanceof AppError && error.statusCode === 400
  );
});

test('repository clones are shallow: primitives are isolated, nested objects would not be', async () => {
  const repository = new InMemoryInventoryRepository(createSeedData());
  const first = (await repository.listItems())[0];
  first.name = 'mutated by caller';
  const again = (await repository.listItems())[0];
  assert.notEqual(again.name, 'mutated by caller');
  // Document the limit of the guarantee rather than pretend it is deep.
  assert.equal(Object.values(again).every((value) => typeof value !== 'object' || value === null), true,
    'InventoryItem must stay flat, or cloneItem must become a deep copy');
});
