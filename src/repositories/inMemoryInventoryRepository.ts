/*
What this file does: Implements the inventory repository contract with seeded in-memory Maps for a no-install learning build.
What calls it: the service singletons and test factories.
What it calls: the seed factory and the domain types.
Junior mistake: returning the internal Map entries directly, which lets callers mutate state behind the repository's back.
*/

import { randomUUID } from 'crypto';

import { type AlertStatus, type InventoryItem, type InventoryReservation, type LowStockAlert, type ReservationStatus } from '@/domain/inventory';
import { createSeedData, type SeedData } from '@/data/seed';
import type {
  CreateAlertRecord,
  CreateItemRecord,
  CreateReservationRecord,
  InventoryRepository,
  UpdateAlertRecord,
  UpdateItemRecord,
  UpdateReservationRecord,
} from '@/repositories/inventoryRepository';

// These clones are shallow ({ ...item }): safe today because InventoryItem holds only primitives.
// If a nested object (for example a supplier record) is ever added, a caller mutating it would change
// the repository's copy too; the "clone is shallow" test pins that assumption.
function cloneItem(item: InventoryItem): InventoryItem {
  return { ...item };
}

function cloneReservation(reservation: InventoryReservation): InventoryReservation {
  return { ...reservation };
}

function cloneAlert(alert: LowStockAlert): LowStockAlert {
  return { ...alert };
}

export class InMemoryInventoryRepository implements InventoryRepository {
  private items = new Map<string, InventoryItem>();

  private reservations = new Map<string, InventoryReservation>();

  private alerts = new Map<string, LowStockAlert>();

  private mutationTail: Promise<void> = Promise.resolve();

  constructor(seed: SeedData = createSeedData()) {
    for (const item of seed.items) {
      this.items.set(item.id, cloneItem(item));
    }

    for (const reservation of seed.reservations) {
      this.reservations.set(reservation.id, cloneReservation(reservation));
    }

    for (const alert of seed.alerts) {
      this.alerts.set(alert.id, cloneAlert(alert));
    }
  }

  async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationTail;
    let release!: () => void;
    this.mutationTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    const items = new Map([...this.items].map(([id, item]) => [id, cloneItem(item)]));
    const reservations = new Map([...this.reservations].map(([id, reservation]) => [id, cloneReservation(reservation)]));
    const alerts = new Map([...this.alerts].map(([id, alert]) => [id, cloneAlert(alert)]));
    try {
      return await operation();
    } catch (error) {
      this.items = items;
      this.reservations = reservations;
      this.alerts = alerts;
      throw error;
    } finally {
      release();
    }
  }

  async listItems(): Promise<InventoryItem[]> {
    return [...this.items.values()]
      .map(cloneItem)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async getItemById(itemId: string): Promise<InventoryItem | null> {
    const item = this.items.get(itemId);
    return item ? cloneItem(item) : null;
  }

  async createItem(record: CreateItemRecord): Promise<InventoryItem> {
    const now = new Date().toISOString();
    const item: InventoryItem = {
      id: randomUUID(),
      sku: record.sku,
      name: record.name,
      unit: record.unit,
      onHand: record.onHand,
      reservedQuantity: record.reservedQuantity ?? 0,
      reorderPoint: record.reorderPoint,
      createdAt: now,
      updatedAt: now,
    };

    this.items.set(item.id, item);
    return cloneItem(item);
  }

  async updateItem(itemId: string, patch: UpdateItemRecord): Promise<InventoryItem | null> {
    const current = this.items.get(itemId);
    if (!current) {
      return null;
    }

    const updated: InventoryItem = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    this.items.set(itemId, updated);
    return cloneItem(updated);
  }

  async listReservations(filter?: { itemId?: string; createdByUserId?: string; status?: ReservationStatus }): Promise<InventoryReservation[]> {
    return [...this.reservations.values()]
      .filter((reservation) => {
        if (filter?.itemId && reservation.itemId !== filter.itemId) {
          return false;
        }
        if (filter?.createdByUserId && reservation.createdByUserId !== filter.createdByUserId) {
          return false;
        }
        if (filter?.status && reservation.status !== filter.status) {
          return false;
        }
        return true;
      })
      .map(cloneReservation)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getReservationById(reservationId: string): Promise<InventoryReservation | null> {
    const reservation = this.reservations.get(reservationId);
    return reservation ? cloneReservation(reservation) : null;
  }

  async createReservation(record: CreateReservationRecord): Promise<InventoryReservation> {
    const now = new Date().toISOString();
    const reservation: InventoryReservation = {
      id: randomUUID(),
      itemId: record.itemId,
      itemSku: record.itemSku,
      itemName: record.itemName,
      quantity: record.quantity,
      reason: record.reason,
      status: record.status,
      createdByUserId: record.createdByUserId,
      createdByUserName: record.createdByUserName,
      createdAt: now,
      releasedAt: record.releasedAt,
      releasedByUserId: record.releasedByUserId,
      releaseReason: record.releaseReason,
    };

    this.reservations.set(reservation.id, reservation);
    return cloneReservation(reservation);
  }

  async updateReservation(reservationId: string, patch: UpdateReservationRecord): Promise<InventoryReservation | null> {
    const current = this.reservations.get(reservationId);
    if (!current) {
      return null;
    }

    const updated: InventoryReservation = {
      ...current,
      ...patch,
    };

    this.reservations.set(reservationId, updated);
    return cloneReservation(updated);
  }

  async listAlerts(filter?: { itemId?: string; status?: AlertStatus }): Promise<LowStockAlert[]> {
    return [...this.alerts.values()]
      .filter((alert) => {
        if (filter?.itemId && alert.itemId !== filter.itemId) {
          return false;
        }
        if (filter?.status && alert.status !== filter.status) {
          return false;
        }
        return true;
      })
      .map(cloneAlert)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getOpenAlertByItemId(itemId: string): Promise<LowStockAlert | null> {
    const match = [...this.alerts.values()].find((alert) => alert.itemId === itemId && alert.status === 'open');
    return match ? cloneAlert(match) : null;
  }

  async createAlert(record: CreateAlertRecord): Promise<LowStockAlert> {
    const now = new Date().toISOString();
    const alert: LowStockAlert = {
      id: randomUUID(),
      itemId: record.itemId,
      itemSku: record.itemSku,
      itemName: record.itemName,
      threshold: record.threshold,
      availableQuantity: record.availableQuantity,
      message: record.message,
      status: record.status,
      createdAt: now,
      updatedAt: now,
      clearedAt: record.clearedAt,
    };

    this.alerts.set(alert.id, alert);
    return cloneAlert(alert);
  }

  async updateAlert(alertId: string, patch: UpdateAlertRecord): Promise<LowStockAlert | null> {
    const current = this.alerts.get(alertId);
    if (!current) {
      return null;
    }

    const updated: LowStockAlert = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    this.alerts.set(alertId, updated);
    return cloneAlert(updated);
  }
}

export const inventoryRepository = new InMemoryInventoryRepository();
