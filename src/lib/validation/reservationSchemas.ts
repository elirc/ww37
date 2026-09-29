/*
What this file does: Defines the Zod boundary for reservation holds and release requests.
What calls it: reservation routes and their tests.
What it calls: zod only.
Junior mistake: accepting a hold request without a reason or with quantity zero, which makes audit trails and inventory math unreliable.
*/

import { z } from 'zod';

export const createHoldSchema = z
  .object({
    itemId: z.string().uuid('Item id must be a UUID'),
    quantity: z.coerce.number().int().positive('Reservation quantity must be greater than zero'),
    reason: z.string().trim().min(3, 'Reservation reason is required'),
  })
  .strict();

export const releaseReservationSchema = z
  .object({
    releaseReason: z.string().trim().min(3, 'Release reason is required').optional(),
  })
  .strict();

export type CreateHoldInput = z.infer<typeof createHoldSchema>;
export type ReleaseReservationInput = z.infer<typeof releaseReservationSchema>;
