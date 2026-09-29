/*
What this file does: Owns the hold and release workflow so reservation math, status transitions, and audit fields stay consistent.
What calls it: the reservation API routes and the dashboard UI.
What it calls: the repository, the alert service, and permission helpers.
Junior mistake: letting any user release any hold, which would turn reservation records into a shared editing surface.
*/

import type { Session } from '@/lib/auth/session';
import { getAvailableQuantity, type InventoryItem, type InventoryReservation, type LowStockAlert } from '@/domain/inventory';
import { conflictError, forbiddenError, notFoundError, validationError } from '@/lib/errors';
import { canCreateHoldAction, canReleaseReservationAction, canViewAllReservationAction } from '@/lib/middleware/withRole';
import type { AlertService } from '@/services/alertService';
import { alertService } from '@/services/alertService';
import { inventoryRepository } from '@/repositories/inMemoryInventoryRepository';
import type { InventoryRepository } from '@/repositories/inventoryRepository';
import type { CreateHoldInput, ReleaseReservationInput } from '@/lib/validation/reservationSchemas';

export interface ReservationMutationResult {
  reservation: InventoryReservation;
  item: InventoryItem;
  alert: LowStockAlert | null;
}

export interface ReservationService {
  listReservations(session: Session): Promise<InventoryReservation[]>;
  createHold(input: CreateHoldInput, session: Session): Promise<ReservationMutationResult>;
  releaseHold(reservationId: string, input: ReleaseReservationInput, session: Session): Promise<ReservationMutationResult>;
}

function canViewReservation(session: Session, reservation: InventoryReservation): boolean {
  return canViewAllReservationAction(session.role) || reservation.createdByUserId === session.userId;
}

function assertRecord(input: unknown): asserts input is Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('Reservation input must be an object.');
  }
}

function validateCreateHoldInput(input: CreateHoldInput): void {
  assertRecord(input);
  if (Object.keys(input).some((key) => !['itemId', 'quantity', 'reason'].includes(key))) {
    throw validationError('Unknown reservation field.');
  }
  if (typeof input.itemId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.itemId)) {
    throw validationError('Item id must be a UUID.');
  }
  if (typeof input.quantity !== 'number' || !Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
    throw validationError('Reservation quantity must be a finite positive safe integer.');
  }
  if (typeof input.reason !== 'string' || input.reason.trim().length < 3) {
    throw validationError('Reservation reason is required.');
  }
}

function validateReleaseInput(input: ReleaseReservationInput): void {
  assertRecord(input);
  if (Object.keys(input).some((key) => key !== 'releaseReason')) {
    throw validationError('Unknown release field.');
  }
  if (input.releaseReason !== undefined && (typeof input.releaseReason !== 'string' || input.releaseReason.trim().length < 3)) {
    throw validationError('Release reason is required.');
  }
}

export function createReservationService(repository: InventoryRepository, alertSync: AlertService): ReservationService {
  return {
    async listReservations(session: Session): Promise<InventoryReservation[]> {
      if (canViewAllReservationAction(session.role)) {
        return repository.listReservations();
      }

      return repository.listReservations({
        createdByUserId: session.userId,
      });
    },

    async createHold(input: CreateHoldInput, session: Session): Promise<ReservationMutationResult> {
      return repository.runExclusive(async () => {
        if (!canCreateHoldAction(session.role)) {
          throw forbiddenError('View-only users cannot create stock holds.');
        }
        validateCreateHoldInput(input);

        const item = await repository.getItemById(input.itemId);
        if (!item) {
          throw notFoundError('Item not found.');
        }

        const availableQuantity = getAvailableQuantity(item);
        if (input.quantity > availableQuantity) {
          throw conflictError('Not enough available stock for this hold.', {
            availableQuantity,
            requestedQuantity: input.quantity,
          });
        }

        const updatedItem = await repository.updateItem(item.id, {
          reservedQuantity: item.reservedQuantity + input.quantity,
        });

        if (!updatedItem) {
          throw notFoundError('Item not found.');
        }

        // The repository-owned boundary keeps the stock bump and reservation insert together.
        const reservation = await repository.createReservation({
          itemId: item.id,
          itemSku: item.sku,
          itemName: item.name,
          quantity: input.quantity,
          reason: input.reason,
          status: 'active',
          createdByUserId: session.userId,
          createdByUserName: session.displayName,
        });

        const alert = await alertSync.syncLowStockAlertForItem(updatedItem);
        return { reservation, item: updatedItem, alert };
      });
    },

    async releaseHold(reservationId: string, input: ReleaseReservationInput, session: Session): Promise<ReservationMutationResult> {
      return repository.runExclusive(async () => {
      validateReleaseInput(input);
      const reservation = await repository.getReservationById(reservationId);
        if (!reservation) {
          throw notFoundError('Reservation not found.');
        }

        if (reservation.status !== 'active') {
          throw conflictError('This reservation has already been released.');
        }

        if (!canViewReservation(session, reservation) || (!canReleaseReservationAction(session.role) && reservation.createdByUserId !== session.userId)) {
          throw forbiddenError('You can only release your own holds unless you are a manager or owner.');
        }

        const item = await repository.getItemById(reservation.itemId);
        if (!item) {
          throw notFoundError('Item not found.');
        }

        if (item.reservedQuantity < reservation.quantity) {
          throw conflictError('The item record no longer matches the reservation quantity.', {
            reservedQuantity: item.reservedQuantity,
            reservationQuantity: reservation.quantity,
          });
        }

        const updatedItem = await repository.updateItem(item.id, {
          reservedQuantity: item.reservedQuantity - reservation.quantity,
        });

        if (!updatedItem) {
          throw notFoundError('Item not found.');
        }

        const updatedReservation = await repository.updateReservation(reservation.id, {
          status: 'released',
          releasedAt: new Date().toISOString(),
          releasedByUserId: session.userId,
          releaseReason: input.releaseReason?.trim() || 'Released manually',
        });

        if (!updatedReservation) {
          throw notFoundError('Reservation not found.');
        }

        const alert = await alertSync.syncLowStockAlertForItem(updatedItem);
        return { reservation: updatedReservation, item: updatedItem, alert };
      });
    },
  };
}

export const reservationService = createReservationService(inventoryRepository, alertService);
