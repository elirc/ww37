/*
What this file does: Keeps low-stock alerts aligned with current item counts so the dashboard can warn operators immediately after a stock change.
What calls it: inventory and reservation services after mutations, plus the alert listing route.
What it calls: the repository methods that read and write alert records.
Junior mistake: generating a fresh alert every time an item is edited instead of updating the existing open alert.
*/

import { getAvailableQuantity, isItemLowStock, type AlertStatus, type InventoryItem, type LowStockAlert } from '@/domain/inventory';
import type { InventoryRepository } from '@/repositories/inventoryRepository';
import { inventoryRepository } from '@/repositories/inMemoryInventoryRepository';

export interface AlertService {
  syncLowStockAlertForItem(item: InventoryItem): Promise<LowStockAlert | null>;
  listAlerts(filter?: { itemId?: string; status?: AlertStatus }): Promise<LowStockAlert[]>;
}

function buildAlertMessage(item: InventoryItem): string {
  return `${item.name} is below its reorder point of ${item.reorderPoint}.`;
}

export function createAlertService(repository: InventoryRepository): AlertService {
  return {
    async syncLowStockAlertForItem(item: InventoryItem): Promise<LowStockAlert | null> {
      const currentOpenAlert = await repository.getOpenAlertByItemId(item.id);
      const availableQuantity = getAvailableQuantity(item);

      if (isItemLowStock(item)) {
        if (currentOpenAlert) {
          // ⚠️ SENIOR NOTE: keep the open alert updated instead of creating a duplicate alert row for every stock mutation.
          return repository.updateAlert(currentOpenAlert.id, {
            itemSku: item.sku,
            itemName: item.name,
            threshold: item.reorderPoint,
            availableQuantity,
            message: buildAlertMessage(item),
            status: 'open',
            clearedAt: undefined,
          });
        }

        return repository.createAlert({
          itemId: item.id,
          itemSku: item.sku,
          itemName: item.name,
          threshold: item.reorderPoint,
          availableQuantity,
          message: buildAlertMessage(item),
          status: 'open',
        });
      }

      if (currentOpenAlert) {
        return repository.updateAlert(currentOpenAlert.id, {
          itemSku: item.sku,
          itemName: item.name,
          threshold: item.reorderPoint,
          availableQuantity,
          message: buildAlertMessage(item),
          status: 'cleared',
          clearedAt: new Date().toISOString(),
        });
      }

      return null;
    },

    async listAlerts(filter?: { itemId?: string; status?: AlertStatus }): Promise<LowStockAlert[]> {
      return repository.listAlerts(filter);
    },
  };
}

export const alertService = createAlertService(inventoryRepository);
