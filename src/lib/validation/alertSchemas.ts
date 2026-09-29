/*
What this file does: Validates query parameters for alert listing.
What calls it: the alerts route and tests that exercise the read boundary.
What it calls: zod only.
Junior mistake: letting arbitrary query strings leak through and then branching on raw string values in the route.
*/

import { z } from 'zod';

export const listAlertsQuerySchema = z
  .object({
    state: z.enum(['open', 'cleared']).optional(),
  })
  .strict();

export type ListAlertsQueryInput = z.infer<typeof listAlertsQuerySchema>;
