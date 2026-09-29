# 02. Concepts: omission, atomicity, and derived state

An update request has two different meanings for a field: omitted means “leave the stored value alone,” while a supplied value means “replace it.” A common bug turns an input object into `{ sku: input.sku, name: input.name, unit: input.unit, reorderPoint: input.reorderPoint }`. In JavaScript, an omitted property becomes `undefined`; the repository spread then writes `undefined` over real metadata. The repaired `updateItem` builds an allowlist one key at a time. It checks `!== undefined`, so a numeric `0` is retained and does not disappear through a truthiness check. It intentionally excludes `onHand` and `reservedQuantity` from metadata updates; stock has its own command.

A reservation is a sequence, not one write. The service reads an item, calculates availability, writes a new reserved quantity, inserts a reservation, and updates an alert. Two service instances can interleave their reads. With ten units available, both can read ten and each approve a hold for seven. A local boolean or a lock inside one service instance would not protect calls made through another service instance. The repository is therefore the shared owner of serialization.

`runExclusive` uses a promise tail. Call A saves the current tail, installs its own release promise, and waits for the previous operation. Call B sees A's release promise and waits. The callback may await freely; the next operation does not start until its `finally` calls release. The in-memory implementation snapshots all three Maps before the callback. If alert synchronization fails after item and reservation writes, the catch restores item, reservation, and alert maps, then rethrows. That gives the caller an error and leaves a consistent state.

This is atomicity for one repository object. It is not a database transaction, a process-wide lock, or a distributed lease. A second Node process has a separate Map and separate queue. The in-memory data also disappears on restart. A SQL adapter should implement the same contract with a transaction, row locks or an atomic conditional update, and durable alert handling.

Derived state supplies useful invariants: `reservedQuantity` cannot exceed `onHand`, available quantity cannot be negative, and an active reservation has a matching quantity. Release is a state transition, so the second release must reject before changing stock. Tests should assert state after both successful and rejected operations, including recovery of the queue after a thrown callback.

There is a subtle distinction between a repository patch and a command. `UpdateItemRecord` still permits stock keys because the generic repository is useful to adjustment code, but `InventoryService.updateItem` deliberately does not pass them. That keeps the public metadata command narrow without making the repository silently discard an explicit `undefined` in other workflows. Alert clearing is one reason a global “remove every undefined key” rule would be unsafe: `clearedAt: undefined` can represent a deliberate state transition in an alert update. The owner of each command should decide which keys are meaningful.

The promise queue also has failure semantics worth naming. Suppose callback A writes the item, then alert synchronization fails. A's catch restores A's snapshots before releasing the queue. Callback B then sees the pre-A state and can run normally. If a caller later mutates a returned object, repository reads remain protected because reads and writes clone records. The returned mutation result is a snapshot of committed state, not a live Map entry.

The queue does not currently block ordinary reads. A controlled test suspends a `runExclusive` callback after it updates an item and calls `getItemById` from outside; that read observes the intermediate value until the callback resumes. This is an explicit in-memory isolation limit, not a hidden claim of snapshot isolation. The service mutation sequence remains serialized, and reads return clones, but a dashboard read during a long callback could see a transient state. A future adapter can provide transaction isolation, or the repository can add a separate read barrier after measuring the UI need. Adding a read lock inside callbacks would deadlock, so that change needs a distinct design.

## Why validate twice

The route parses the body with `createItemSchema` and answers 400 on failure; the service then parses the same input with the same schema. This is not duplication of *rules* (there is one schema) but of *enforcement*: the service is called from tests, from seed scripts and from any future route, and none of those pass through the route parser. The new test in `tests/inventory.test.ts` calls the service directly with a two-character SKU and expects the same 400.

## Reservation timeline

```
t0  clerk POST /api/reservations  ->  hold created  (available = onHand - held)
t1  manager PATCH /api/items/:id   ->  metadata only; onHand unchanged; available unchanged
t2  clerk POST .../release         ->  hold released; available restored
t3  clerk POST .../release again   ->  409: releasing a released hold is not idempotent by design
```

`getAvailableQuantity` is the one function that turns `onHand` and open holds into the number the UI shows; every mutation above re-derives it rather than storing it.
