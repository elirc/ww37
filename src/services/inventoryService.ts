/*
What this file does: Owns item CRUD and stock-adjustment rules, including the low-stock alert handoff after each mutation.
What calls it: the item API routes and the dashboard UI.
What it calls: the repository, the alert service, and role-based permission helpers.
Junior mistake: assuming the UI will prevent negative stock or unauthorized writes instead of enforcing those rules here.
*/

import type { Session } from '@/lib/auth/session';
import { getAvailableQuantity, type InventoryItem } from '@/domain/inventory';
import { conflictError, forbiddenError, notFoundError, validationError } from '@/lib/errors';
import { canManageInventoryAction } from '@/lib/middleware/withRole';
import type { AdjustStockInput, CreateItemInput, UpdateItemInput } from '@/lib/validation/itemSchemas';
import { createItemSchema, updateItemSchema } from '@/lib/validation/itemSchemas';
import type { AlertService } from '@/services/alertService';
import { alertService } from '@/services/alertService';
import { inventoryRepository } from '@/repositories/inMemoryInventoryRepository';
import type { InventoryRepository } from '@/repositories/inventoryRepository';

export interface ItemMutationResult {
  item: InventoryItem;
  alert: Awaited<ReturnType<AlertService['syncLowStockAlertForItem']>>;
}

export interface InventoryService {
  listItems(): Promise<InventoryItem[]>;
  getItem(itemId: string): Promise<InventoryItem | null>;
  createItem(input: CreateItemInput, session: Session): Promise<ItemMutationResult>;
  updateItem(itemId: string, input: UpdateItemInput, session: Session): Promise<ItemMutationResult>;
  adjustStock(itemId: string, input: AdjustStockInput, session: Session): Promise<ItemMutationResult>;
}

function assertInventoryManager(session: Session): void {
  if (!canManageInventoryAction(session.role)) {
    throw forbiddenError('Only owners and managers can change item records.');
  }
}

function resolveNextStock(item: InventoryItem, delta: number): number {
  const nextOnHand = item.onHand + delta;
  if (!Number.isSafeInteger(nextOnHand)) {
    throw validationError('The resulting stock quantity must be a safe integer.');
  }
  return nextOnHand;
}

function assertRecord(input: unknown): asserts input is Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('Inventory input must be an object.');
  }
}

function assertText(value: unknown, field: string, minimum: number): asserts value is string {
  if (typeof value !== 'string' || value.trim().length < minimum) {
    throw validationError(`${field} must contain at least ${minimum} characters.`);
  }
}

function validateCreateInput(input: CreateItemInput): void {
  // The route already parsed this shape; the service parses it again because the service is also
  // called from tests, scripts and future routes that may not. One schema, two call sites.
  const parsed = createItemSchema.safeParse(input);
  if (!parsed.success) {
    throw validationError(parsed.error.issues[0]?.message ?? 'Invalid item.');
  }
}

function validateUpdateInput(input: UpdateItemInput): void {
  const parsed = updateItemSchema.safeParse(input);
  if (!parsed.success) {
    throw validationError(parsed.error.issues[0]?.message ?? 'Invalid item update.');
  }
  const values = input as Record<string, unknown>;
  if (Object.keys(values).every((key) => values[key] === undefined)) {
    throw validationError('At least one valid item field must be provided.');
  }
}

function validateAdjustmentInput(input: AdjustStockInput): void {
  assertRecord(input);
  if (Object.keys(input).some((key) => !['delta', 'reason'].includes(key))) {
    throw validationError('Unknown stock adjustment field.');
  }
  if (typeof input.delta !== 'number' || !Number.isSafeInteger(input.delta) || input.delta === 0) {
    throw validationError('Stock adjustment must be a finite, non-zero safe integer.');
  }
  assertText(input.reason, 'Adjustment reason', 3);
}

export function createInventoryService(repository: InventoryRepository, alertSync: AlertService): InventoryService {
  return {
    async listItems(): Promise<InventoryItem[]> {
      return repository.listItems();
    },

    async getItem(itemId: string): Promise<InventoryItem | null> {
      return repository.getItemById(itemId);
    },

    async createItem(input: CreateItemInput, session: Session): Promise<ItemMutationResult> {
      return repository.runExclusive(async () => {
        assertInventoryManager(session);
        validateCreateInput(input);

        const item = await repository.createItem({
          sku: input.sku,
          name: input.name,
          unit: input.unit,
          onHand: input.initialOnHand,
          reorderPoint: input.reorderPoint,
        });

        const alert = await alertSync.syncLowStockAlertForItem(item);
        return { item, alert };
      });
    },

    async updateItem(itemId: string, input: UpdateItemInput, session: Session): Promise<ItemMutationResult> {
      return repository.runExclusive(async () => {
        assertInventoryManager(session);
        validateUpdateInput(input);

        const existing = await repository.getItemById(itemId);
        if (!existing) {
          throw notFoundError('Item not found.');
        }

        const patch: Parameters<InventoryRepository['updateItem']>[1] = {};
        if (input.sku !== undefined) patch.sku = input.sku;
        if (input.name !== undefined) patch.name = input.name;
        if (input.unit !== undefined) patch.unit = input.unit;
        if (input.reorderPoint !== undefined) patch.reorderPoint = input.reorderPoint;
        const item = await repository.updateItem(itemId, patch);

        if (!item) {
          throw notFoundError('Item not found.');
        }

        const alert = await alertSync.syncLowStockAlertForItem(item);
        return { item, alert };
      });
    },

    async adjustStock(itemId: string, input: AdjustStockInput, session: Session): Promise<ItemMutationResult> {
      return repository.runExclusive(async () => {
        assertInventoryManager(session);
        validateAdjustmentInput(input);

        const item = await repository.getItemById(itemId);
        if (!item) {
          throw notFoundError('Item not found.');
        }

        const nextOnHand = resolveNextStock(item, input.delta);
        if (nextOnHand < 0) {
          throw conflictError('Stock cannot go below zero.', {
            onHand: item.onHand,
            delta: input.delta,
          });
        }

        if (nextOnHand < item.reservedQuantity) {
          throw conflictError('Stock cannot drop below the quantity already reserved.', {
            onHand: item.onHand,
            reservedQuantity: item.reservedQuantity,
            availableQuantity: getAvailableQuantity(item),
          });
        }

        const updatedItem = await repository.updateItem(item.id, {
          onHand: nextOnHand,
        });

        if (!updatedItem) {
          throw notFoundError('Item not found.');
        }

        const alert = await alertSync.syncLowStockAlertForItem(updatedItem);
        return { item: updatedItem, alert };
      });
    },
  };
}

export const inventoryService = createInventoryService(inventoryRepository, alertService);
