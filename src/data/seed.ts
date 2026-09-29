/*
What this file does: Provides deterministic mock seed data so the app can render and the tests have stable starting conditions.
What calls it: the in-memory repository factory.
What it calls: crypto.randomUUID for record identifiers.
Junior mistake: seeding low-stock data without also seeding the matching alert state, which makes the dashboard look inconsistent at boot.
*/

import { randomUUID } from 'crypto';

import { type InventoryItem, type InventoryReservation, type LowStockAlert } from '@/domain/inventory';

export interface SeedData {
  items: InventoryItem[];
  reservations: InventoryReservation[];
  alerts: LowStockAlert[];
}

function nowOffset(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export function createSeedData(): SeedData {
  const milkId = randomUUID();
  const breadId = randomUUID();
  const soapId = randomUUID();
  const reservationId = randomUUID();
  const alertId = randomUUID();

  const items: InventoryItem[] = [
    {
      id: milkId,
      sku: 'MILK-1L',
      name: 'Whole Milk 1L',
      unit: 'bottle',
      onHand: 24,
      reservedQuantity: 0,
      reorderPoint: 10,
      createdAt: nowOffset(180),
      updatedAt: nowOffset(20),
    },
    {
      id: breadId,
      sku: 'BREAD-SD',
      name: 'Sourdough Bread',
      unit: 'loaf',
      onHand: 8,
      reservedQuantity: 2,
      reorderPoint: 6,
      createdAt: nowOffset(170),
      updatedAt: nowOffset(25),
    },
    {
      id: soapId,
      sku: 'SOAP-BAR',
      name: 'Hand Soap',
      unit: 'bar',
      onHand: 4,
      reservedQuantity: 0,
      reorderPoint: 5,
      createdAt: nowOffset(160),
      updatedAt: nowOffset(15),
    },
  ];

  const reservations: InventoryReservation[] = [
    {
      id: reservationId,
      itemId: breadId,
      itemSku: 'BREAD-SD',
      itemName: 'Sourdough Bread',
      quantity: 2,
      reason: 'Customer pickup later today',
      status: 'active',
      createdByUserId: 'clerk-01',
      createdByUserName: 'Maya Clerk',
      createdAt: nowOffset(10),
    },
  ];

  const alerts: LowStockAlert[] = [
    {
      id: alertId,
      itemId: soapId,
      itemSku: 'SOAP-BAR',
      itemName: 'Hand Soap',
      threshold: 5,
      availableQuantity: 4,
      message: 'Hand Soap is below its reorder point of 5.',
      status: 'open',
      createdAt: nowOffset(12),
      updatedAt: nowOffset(12),
    },
  ];

  return { items, reservations, alerts };
}
