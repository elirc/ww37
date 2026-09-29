/*
What this file does: Defines the Zod validation boundary for item creation and stock adjustment routes.
What calls it: the item API routes and the tests that pin rejection behavior.
What it calls: zod only.
Junior mistake: letting a route accept partial shapes or negative stock deltas just because the UI "shouldn't" send them.
*/

import { z } from 'zod';

export const createItemSchema = z
  .object({
    sku: z.string().trim().min(3, 'SKU must be at least 3 characters'),
    name: z.string().trim().min(2, 'Item name must be at least 2 characters'),
    unit: z.string().trim().min(1, 'Unit is required'),
    initialOnHand: z.coerce.number().int().nonnegative('Initial stock cannot be negative'),
    reorderPoint: z.coerce.number().int().nonnegative('Reorder point cannot be negative'),
  })
  .strict();

export const updateItemSchema = z
  .object({
    sku: z.string().trim().min(3).optional(),
    name: z.string().trim().min(2).optional(),
    unit: z.string().trim().min(1).optional(),
    reorderPoint: z.coerce.number().int().nonnegative().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const adjustStockSchema = z
  .object({
    delta: z.coerce.number().int().refine((value) => value !== 0, {
      message: 'Stock adjustment cannot be zero',
    }),
    reason: z.string().trim().min(3, 'Stock adjustments need a reason'),
  })
  .strict();

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
