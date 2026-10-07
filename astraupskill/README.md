# Inventory reservation repair course

This course follows one bounded change in the `ww37` Next application. The application stores inventory items, holds, and low stock alerts in an in-memory repository. The repair preserves the existing HTTP routes and role rules while making item updates omission-safe and making multi-step reservation changes serial and recoverable. Read the chapters in order, then run the finite test command shown in [VERIFICATION.md](VERIFICATION.md).

The source map starts with [01-CODEBASE-MAP.md](01-CODEBASE-MAP.md), then [02-CONCEPTS.md](02-CONCEPTS.md) explains patch semantics and mutation ownership. [03-WORKED-CHANGE.md](03-WORKED-CHANGE.md) traces the actual service code. [04-TESTING-AND-DEBUGGING.md](04-TESTING-AND-DEBUGGING.md) explains the deterministic regressions. Try the exercises in [05-PRACTICE.md](05-PRACTICE.md) and compare with the complete examples in [06-SOLUTIONS-AND-REVIEW.md](06-SOLUTIONS-AND-REVIEW.md). [07-TRACE-LAB.md](07-TRACE-LAB.md) traces HTTP through validation, service, repository, and alert state.

The implementation snapshots in [snapshots](snapshots) are exact copies of the eight changed pre-repair files. The runnable regression is `tests/inventory.test.ts`; its alias loader is `tests/register-alias.mjs`. The loader is a test harness convenience for Node 22 and does not change application behavior. The four original Node tests remain in the file alongside the new partial-update, concurrent-hold, and rollback cases; the file now holds 15 cases in total, two more than the recorded evidence run (see [VERIFICATION.md](VERIFICATION.md)).

The persistence claim is deliberately narrow. `InMemoryInventoryRepository.runExclusive` serializes operations sharing one repository instance and restores cloned maps when a callback throws. It does not coordinate separate processes, server replicas, or a future SQL database. A production adapter would need a database transaction or an equivalent atomic command. The course calls this a repository-owned mutation boundary, because the service owns the business sequence but the repository owns serialization and rollback.

Completed records and logs are preserved in [evidence](evidence/). A passing test demonstrates the selected invariants in this in-memory implementation; it does not prove distributed locking, durability after restart, or performance under production load.

## Prerequisites, glossary and pacing

**Prerequisites:** one Next.js App Router project with route handlers, and Zod basics (`safeParse`, `issues`).

**Glossary.** *Route handler*: the `GET/POST/PATCH` export in `src/app/api/.../route.ts`. *Hold*: a reservation that reduces available quantity without changing `onHand`. *Available quantity*: `onHand` minus the item's stored `reservedQuantity` counter, derived on read by `getAvailableQuantity` (`src/domain/inventory.ts:54-56`); the counter is maintained by the hold and release paths rather than recomputed from open holds. *Shallow clone*: `{ ...item }` copies top-level fields only. *Alias hook*: the loader that resolves `@/` in tests.

**Pacing:** map 45 min, concepts 60 min, worked change 90 min, testing 60 min, practice 3-4 h, solutions 45 min, trace lab 45 min.

