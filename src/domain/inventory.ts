/*
What this file does: Defines the inventory, reservation, and low-stock alert entities plus pure domain helpers.
What calls it: repositories, services, validation tests, and the dashboard UI.
What it calls: nothing; it intentionally stays dependency-free.
Junior mistake: storing derived values like availableQuantity separately instead of calculating them from the canonical stock counts.
*/

export type ReservationStatus = 'active' | 'released';

export type AlertStatus = 'open' | 'cleared';

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  unit: string;
  onHand: number;
  reservedQuantity: number;
  reorderPoint: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryReservation {
  id: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  quantity: number;
  reason: string;
  status: ReservationStatus;
  createdByUserId: string;
  createdByUserName: string;
  createdAt: string;
  releasedAt?: string;
  releasedByUserId?: string;
  releaseReason?: string;
}

export interface LowStockAlert {
  id: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  threshold: number;
  availableQuantity: number;
  message: string;
  status: AlertStatus;
  createdAt: string;
  updatedAt: string;
  clearedAt?: string;
}

export function getAvailableQuantity(item: InventoryItem): number {
  return item.onHand - item.reservedQuantity;
}

export function isItemLowStock(item: InventoryItem): boolean {
  return getAvailableQuantity(item) <= item.reorderPoint;
}
